package expo.modules.quickkeypad

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.Trace
import android.util.Log
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * Covers a resumed MainActivity until the matching quick-add route has rendered.
 *
 * Launcher shortcuts run the keypad in a separate task. Without this handoff,
 * Android can draw MainActivity's previous route before Expo Router handles the
 * incoming deep link.
 */
object QuickAddHandoffController {
    const val EXTRA_HANDOFF_ID = "expo.modules.quickkeypad.HANDOFF_ID"

    /** Launcher entries that only need a React sheet over the desktop, without a native source. */
    const val EXTRA_TRANSLUCENT_LAUNCH = "expo.modules.quickkeypad.TRANSLUCENT_LAUNCH"

    private const val TAG = "QuickAddHandoff"
    private const val PERF_TAG = "QuickAddPerf"
    private const val TIMEOUT_MS = 5_000L
    private const val PENDING_LAUNCH_TTL_MS = 30_000L
    private const val TRACE_CONFIRM_TO_FIRST_VISIBLE = "QuickAdd/ConfirmToFirstVisible"
    private const val TRACE_CONFIRM_TO_INTERACTIVE = "QuickAdd/ConfirmToInteractive"
    private const val TRACE_MAIN_ACTIVITY_HANDOFF = "QuickAdd/MainActivityHandoff"
    private const val TRACE_ROUTE_RENDER = "QuickAdd/RouteRender"
    private const val TRACE_FORM_DATA_READY = "QuickAdd/FormDataReady"

    private val mainHandler = Handler(Looper.getMainLooper())
    private val launchLock = Any()

    private data class TargetSession(
        val handoffId: String,
        val activityRef: WeakReference<Activity>,
        val contentRef: WeakReference<View>?,
        val originalContentVisibility: Int,
        val originalContentAlpha: Float,
        val originalContentAccessibility: Int,
        val overlay: View,
        val presentationState: QuickAddPresentationState,
    )

    private data class RetainedSource(
        val handoffId: String,
        val activityRef: WeakReference<QuickAddHandoffSource>,
    )

    private data class TranslucencyState(
        val activityRef: WeakReference<Activity>,
        val windowBackground: Drawable?,
    )

    private var targetSession: TargetSession? = null
    private var retainedSource: RetainedSource? = null
    private var mainActivityRef: WeakReference<Activity>? = null
    private var pendingLaunch: QuickAddLaunch? = null
    private var completedHandoffId: String? = null
    private var interactiveReadyHandoffId: String? = null
    private var performanceSession: PerformanceSession? = null

    /** The saved state belongs to one Activity instance and must never outlive it. */
    private var translucencyState: TranslucencyState? = null

    private fun isTranslucent(activity: Activity): Boolean = translucencyState?.activityRef?.get() === activity

    private val timeoutRunnable =
        Runnable {
            val timedOutId = targetSession?.handoffId ?: retainedSource?.handoffId ?: return@Runnable
            Log.w(TAG, "Timed out waiting for quick-add route handoff: $timedOutId")
            finishPerformance(timedOutId, "timeout")
            clearPendingLaunch(timedOutId)
            abortVisualHandoffOnMain(timedOutId, finishSource = true)
        }

    private data class PerformanceSession(
        val handoffId: String,
        val cookie: Int,
        val confirmStartedAt: Long,
        var lastPhaseAt: Long = confirmStartedAt,
        var mainActivityHandoffOpen: Boolean = false,
        var routeRenderOpen: Boolean = false,
        var formDataReadyOpen: Boolean = false,
        var firstVisibleOpen: Boolean = true,
        var interactiveOpen: Boolean = true,
    )

    data class QuickAddLaunch(
        val amountCents: Long,
        val currency: String,
        val type: String,
        val handoffId: String,
        val createdAt: Long = SystemClock.elapsedRealtime(),
    ) {
        fun toPayload(): Map<String, Any> =
            mapOf(
                "amountCents" to amountCents.toDouble(),
                "currency" to currency,
                "type" to type,
                "handoffId" to handoffId,
            )
    }

    /**
     * Persist the launch before MainActivity receives its deep link.
     *
     * ReactActivityDelegateWrapper can drop an onNewIntent callback while its app load is still
     * pending. Keeping the payload here lets JavaScript pull it once Expo Router is ready —
     * delivery is pull-only (getPendingLaunch) so a stale root can never navigate on it.
     */
    fun publishLaunch(launch: QuickAddLaunch) {
        synchronized(launchLock) {
            pendingLaunch = launch
            completedHandoffId = null
            interactiveReadyHandoffId = null
        }
    }

    fun beginPerformance(handoffId: String) {
        val now = SystemClock.elapsedRealtime()
        synchronized(launchLock) {
            performanceSession?.let { finishPerformanceLocked(it, "replaced", now) }
            val session =
                PerformanceSession(
                    handoffId = handoffId,
                    cookie = handoffId.hashCode(),
                    confirmStartedAt = now,
                )
            performanceSession = session
            beginAsyncSection(TRACE_CONFIRM_TO_FIRST_VISIBLE, session.cookie)
            beginAsyncSection(TRACE_CONFIRM_TO_INTERACTIVE, session.cookie)
            logPhase(session, "confirm_start", now)
        }
    }

    fun cancelPerformance(
        handoffId: String,
        reason: String,
    ) {
        finishPerformance(handoffId, reason)
    }

    fun beginMainActivityHandoff(handoffId: String) {
        val now = SystemClock.elapsedRealtime()
        synchronized(launchLock) {
            val session = performanceSession?.takeIf { it.handoffId == handoffId } ?: return
            if (session.mainActivityHandoffOpen) return
            session.mainActivityHandoffOpen = true
            beginAsyncSection(TRACE_MAIN_ACTIVITY_HANDOFF, session.cookie)
            logPhase(session, "native_confirmed", now)
        }
    }

    fun getPendingLaunch(): QuickAddLaunch? =
        synchronized(launchLock) {
            val launch = pendingLaunch ?: return@synchronized null
            if (SystemClock.elapsedRealtime() - launch.createdAt > PENDING_LAUNCH_TTL_MS) {
                pendingLaunch = null
                null
            } else {
                launch
            }
        }

    fun retainSource(
        activity: QuickAddHandoffSource,
        handoffId: String,
    ) {
        runOnMainThread {
            val currentIds = currentVisualHandoffIds()
            currentIds.filter { it != handoffId }.forEach { replacedId ->
                finishPerformance(replacedId, "replaced")
                clearPendingLaunch(replacedId)
                abortVisualHandoffOnMain(replacedId, finishSource = true)
            }

            retainedSource =
                RetainedSource(
                    handoffId = handoffId,
                    activityRef = WeakReference(activity),
                )
            scheduleTimeout()
        }
    }

    fun cancelLaunch(
        handoffId: String,
        reason: String,
    ) {
        finishPerformance(handoffId, reason)
        clearPendingLaunch(handoffId)
        runOnMainThread {
            abortVisualHandoffOnMain(handoffId, finishSource = false)
        }
    }

    fun sourceDestroyed(
        activity: QuickAddHandoffSource,
        handoffId: String?,
    ) {
        if (handoffId.isNullOrBlank()) return
        runOnMainThread {
            val source = retainedSource ?: return@runOnMainThread
            if (source.handoffId != handoffId || source.activityRef.get() !== activity) {
                return@runOnMainThread
            }
            retainedSource = null
            cancelTimeoutIfIdle()
        }
    }

    fun attachMainActivity(activity: Activity) {
        runOnMainThread {
            mainActivityRef = WeakReference(activity)
        }
    }

    fun begin(
        activity: Activity,
        handoffId: String?,
    ) {
        if (handoffId.isNullOrBlank()) return
        markMainActivityReceived(handoffId)
        runOnMainThread {
            mainActivityRef = WeakReference(activity)
            beginTargetOnMain(activity, handoffId)
        }
    }

    private fun beginTargetOnMain(
        activity: Activity,
        handoffId: String,
    ) {
        val alreadyCompleted = synchronized(launchLock) { completedHandoffId == handoffId }
        if (alreadyCompleted) return

        val currentTarget = targetSession
        if (
            currentTarget?.handoffId == handoffId &&
            currentTarget.activityRef.get() === activity
        ) {
            releaseInteractiveHandoffOnMain(handoffId)
            return
        }

        currentVisualHandoffIds().filter { it != handoffId }.forEach { replacedId ->
            finishPerformance(replacedId, "replaced")
            clearPendingLaunch(replacedId)
            abortVisualHandoffOnMain(replacedId, finishSource = true)
        }
        targetSession?.let { clearTargetOnMain(it.handoffId) }
        applyTranslucency(activity)

        val decorView = activity.window.decorView as? ViewGroup
        if (decorView == null) {
            Log.e(TAG, "MainActivity decor view is unavailable for handoff: $handoffId")
            finishPerformance(handoffId, "missing_decor_view")
            clearPendingLaunch(handoffId)
            abortVisualHandoffOnMain(handoffId, finishSource = true)
            clearTranslucency(activity)
            return
        }
        val content = activity.findViewById<View>(android.R.id.content)
        val originalContentVisibility = content?.visibility ?: View.VISIBLE
        val originalContentAlpha = content?.alpha ?: 1f
        val originalContentAccessibility =
            content?.importantForAccessibility ?: View.IMPORTANT_FOR_ACCESSIBILITY_AUTO

        val cover =
            View(activity).apply {
                setBackgroundColor(
                    ContextCompat.getColor(
                        activity,
                        if (isTranslucent(activity)) {
                            R.color.quick_handoff_scrim
                        } else {
                            R.color.quick_handoff_background
                        },
                    ),
                )
                isClickable = true
                isFocusable = true
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
                elevation = 10_000f
            }
        decorView.addView(
            cover,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        content?.apply {
            visibility = View.INVISIBLE
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        }
        targetSession =
            TargetSession(
                handoffId = handoffId,
                activityRef = WeakReference(activity),
                contentRef = content?.let(::WeakReference),
                originalContentVisibility = originalContentVisibility,
                originalContentAlpha = originalContentAlpha,
                originalContentAccessibility = originalContentAccessibility,
                overlay = cover,
                presentationState = QuickAddPresentationState(handoffId),
            )
        scheduleTimeout()
        releaseInteractiveHandoffOnMain(handoffId)
    }

    /**
     * A normal launch must cancel a pending shortcut handoff and restore MainActivity to its
     * original opaque state.
     */
    fun restoreOpaque(activity: Activity) {
        runOnMainThread {
            currentVisualHandoffIds().forEach { handoffId ->
                finishPerformance(handoffId, "normal_intent")
                clearPendingLaunch(handoffId)
                abortVisualHandoffOnMain(handoffId, finishSource = true)
            }
            clearTranslucency(activity)
        }
    }

    /**
     * Launcher entries without a native source activity (for example the natural-language sheet)
     * only need a translucent window: the desktop stays visible behind the React sheet, and no
     * opaque launch overlay is drawn.
     */
    fun beginTranslucentLaunch(activity: Activity) {
        runOnMainThread {
            AppLaunchController.cancelForQuickAdd(activity)
            applyTranslucency(activity)
        }
    }

    /**
     * API 30+ can keep the final sheet over the launcher. Older releases retain the opaque fallback.
     */
    private fun applyTranslucency(activity: Activity) {
        if (isTranslucent(activity)) return
        val themeIsTranslucent = isThemeTranslucent(activity)
        val requiresDynamicTranslucency =
            !themeIsTranslucent || AppLaunchController.isExplicitlyOpaque(activity)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R && requiresDynamicTranslucency) return
        translucencyState?.activityRef?.get()?.let(::clearTranslucency)
        if (
            requiresDynamicTranslucency &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
            !activity.setTranslucent(true)
        ) {
            Log.w(TAG, "setTranslucent(true) rejected; keeping the opaque window")
            return
        }
        translucencyState =
            TranslucencyState(
                activityRef = WeakReference(activity),
                windowBackground = activity.window.decorView.background,
            )
        activity.window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    }

    private fun isThemeTranslucent(activity: Activity): Boolean {
        val attributes =
            activity.obtainStyledAttributes(intArrayOf(android.R.attr.windowIsTranslucent))
        return try {
            attributes.getBoolean(0, false)
        } finally {
            attributes.recycle()
        }
    }

    private fun clearTranslucency(activity: Activity) {
        if (!isTranslucent(activity)) return
        val state = translucencyState
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.setTranslucent(false)
        }
        translucencyState = null
        val opaqueColor = resolveWindowBackgroundColor(activity)
        activity.window.setBackgroundDrawable(
            state?.windowBackground ?: ColorDrawable(opaqueColor),
        )
        AppLaunchController.markExplicitlyOpaque(activity)
    }

    private fun resolveWindowBackgroundColor(activity: Activity): Int {
        val typedValue = TypedValue()
        val resolved =
            activity.theme.resolveAttribute(
                android.R.attr.windowBackground,
                typedValue,
                true,
            )
        return if (resolved && typedValue.type >= TypedValue.TYPE_FIRST_COLOR_INT &&
            typedValue.type <= TypedValue.TYPE_LAST_COLOR_INT
        ) {
            typedValue.data
        } else {
            ContextCompat.getColor(activity, R.color.quick_handoff_background)
        }
    }

    fun complete(handoffId: String?) {
        if (handoffId.isNullOrBlank()) return
        markFirstVisible(handoffId)
        clearPendingLaunch(handoffId)
    }

    fun revealPresentation(
        handoffId: String?,
        completion: (Boolean) -> Unit,
    ) {
        if (handoffId.isNullOrBlank()) {
            completion(false)
            return
        }
        runOnMainThread {
            val target = targetSession?.takeIf { it.handoffId == handoffId }
            if (target == null) {
                completion(false)
                return@runOnMainThread
            }
            val decision = target.presentationState.reveal(handoffId)
            if (!decision.accepted) {
                completion(false)
                return@runOnMainThread
            }
            if (decision.changed) {
                revealTargetContentOnMain(target)
            }

            val decorView =
                target.activityRef
                    .get()
                    ?.window
                    ?.decorView
            if (decorView?.isAttachedToWindow != true) {
                completion(false)
                return@runOnMainThread
            }
            if (!decision.changed) {
                completion(true)
                return@runOnMainThread
            }
            decorView.postOnAnimation {
                val stillActive =
                    targetSession?.takeIf { it.handoffId == handoffId }?.presentationState?.phase ==
                        QuickAddPresentationPhase.REVEALED
                completion(stillActive)
            }
        }
    }

    fun completeInteractive(handoffId: String?) {
        if (handoffId.isNullOrBlank()) return
        runOnMainThread {
            val visualMatches =
                targetSession?.handoffId == handoffId || retainedSource?.handoffId == handoffId
            val nativeStateMatches =
                synchronized(launchLock) {
                    pendingLaunch?.handoffId == handoffId ||
                        performanceSession?.handoffId == handoffId ||
                        interactiveReadyHandoffId == handoffId ||
                        completedHandoffId == handoffId
                }
            if (!visualMatches && !nativeStateMatches) return@runOnMainThread

            val now = SystemClock.elapsedRealtime()
            synchronized(launchLock) {
                if (pendingLaunch?.handoffId == handoffId) {
                    pendingLaunch = null
                }
                interactiveReadyHandoffId = handoffId
                performanceSession?.takeIf { it.handoffId == handoffId }?.let { session ->
                    finishFirstVisibleLocked(session, now)
                    if (session.formDataReadyOpen) {
                        endAsyncSection(TRACE_FORM_DATA_READY, session.cookie)
                        session.formDataReadyOpen = false
                    }
                    if (session.interactiveOpen) {
                        endAsyncSection(TRACE_CONFIRM_TO_INTERACTIVE, session.cookie)
                        session.interactiveOpen = false
                        logPhase(session, "interactive", now)
                    }
                    performanceSession = null
                }
            }
            releaseInteractiveHandoffOnMain(handoffId)
        }
    }

    fun clear(activity: Activity) {
        runOnMainThread {
            if (mainActivityRef?.get() === activity) {
                mainActivityRef = null
            }
            if (translucencyState?.activityRef?.get() === activity) {
                translucencyState = null
            }
            val handoffId =
                targetSession
                    ?.takeIf { it.activityRef.get() === activity }
                    ?.handoffId
                    ?: return@runOnMainThread
            finishPerformance(handoffId, "activity_destroyed")
            clearPendingLaunch(handoffId)
            finishRetainedSourceOnMain(handoffId, finishSource = true)
            clearTargetOnMain(handoffId)
        }
    }

    private fun currentVisualHandoffIds(): List<String> = listOfNotNull(targetSession?.handoffId, retainedSource?.handoffId).distinct()

    private fun scheduleTimeout() {
        mainHandler.removeCallbacks(timeoutRunnable)
        mainHandler.postDelayed(timeoutRunnable, TIMEOUT_MS)
    }

    private fun cancelTimeoutIfIdle() {
        if (targetSession == null && retainedSource == null) {
            mainHandler.removeCallbacks(timeoutRunnable)
        }
    }

    private fun clearPendingLaunch(handoffId: String) {
        synchronized(launchLock) {
            if (pendingLaunch?.handoffId == handoffId) {
                pendingLaunch = null
            }
        }
    }

    private fun abortVisualHandoffOnMain(
        handoffId: String,
        finishSource: Boolean,
    ) {
        val targetActivity =
            targetSession
                ?.takeIf { it.handoffId == handoffId }
                ?.activityRef
                ?.get()
        synchronized(launchLock) {
            if (interactiveReadyHandoffId == handoffId) {
                interactiveReadyHandoffId = null
            }
        }
        finishRetainedSourceOnMain(handoffId, finishSource)
        clearTargetOnMain(handoffId)
        targetActivity?.let(::clearTranslucency)
        cancelTimeoutIfIdle()
    }

    private fun releaseInteractiveHandoffOnMain(handoffId: String) {
        val target = targetSession?.takeIf { it.handoffId == handoffId } ?: return
        val ready =
            synchronized(launchLock) {
                if (interactiveReadyHandoffId != handoffId) {
                    false
                } else {
                    interactiveReadyHandoffId = null
                    completedHandoffId = handoffId
                    true
                }
            }
        if (!ready) return

        val releaseDecision = target.presentationState.release(handoffId)
        if (!releaseDecision.accepted) return
        if (releaseDecision.revealFirst) {
            revealTargetContentOnMain(target)
        }

        // Keep the shared timeout armed while the frame-driven cleanup below runs: if the
        // target window stops receiving animation frames (e.g. obscured by the translucent
        // result-mode keypad), the timeout force-finishes this handoff. finishRetainedSource
        // cancels it once both sessions are actually gone.
        val decorView =
            target.activityRef
                .get()
                ?.window
                ?.decorView
        if (decorView?.isAttachedToWindow == true) {
            decorView.postOnAnimation {
                if (targetSession?.handoffId == handoffId) {
                    clearTargetOnMain(handoffId)
                    decorView.postOnAnimation {
                        finishRetainedSourceOnMain(handoffId, finishSource = true)
                    }
                }
            }
        } else {
            clearTargetOnMain(handoffId)
            finishRetainedSourceOnMain(handoffId, finishSource = true)
        }
    }

    private fun finishRetainedSourceOnMain(
        handoffId: String,
        finishSource: Boolean,
    ) {
        val source = retainedSource?.takeIf { it.handoffId == handoffId } ?: return
        retainedSource = null
        source.activityRef.get()?.let { activity ->
            if (finishSource) {
                activity.finishRetainedHandoff(handoffId)
            } else {
                activity.cancelRetainedHandoff(handoffId)
            }
        }
        cancelTimeoutIfIdle()
    }

    private fun revealTargetContentOnMain(target: TargetSession) {
        target.contentRef?.get()?.apply {
            visibility = target.originalContentVisibility
            alpha = target.originalContentAlpha
            importantForAccessibility = target.originalContentAccessibility
        }
        (target.overlay.parent as? ViewGroup)?.removeView(target.overlay)
    }

    private fun clearTargetOnMain(handoffId: String) {
        val target = targetSession?.takeIf { it.handoffId == handoffId } ?: return
        targetSession = null
        val abortDecision = target.presentationState.abort(handoffId)
        if (abortDecision.revealFirst) {
            revealTargetContentOnMain(target)
        }
        cancelTimeoutIfIdle()
    }

    private fun markMainActivityReceived(handoffId: String) {
        val now = SystemClock.elapsedRealtime()
        synchronized(launchLock) {
            val session = performanceSession?.takeIf { it.handoffId == handoffId } ?: return
            if (session.mainActivityHandoffOpen) {
                endAsyncSection(TRACE_MAIN_ACTIVITY_HANDOFF, session.cookie)
                session.mainActivityHandoffOpen = false
            } else if (session.routeRenderOpen || session.formDataReadyOpen) {
                return
            }
            session.routeRenderOpen = true
            session.formDataReadyOpen = true
            beginAsyncSection(TRACE_ROUTE_RENDER, session.cookie)
            beginAsyncSection(TRACE_FORM_DATA_READY, session.cookie)
            logPhase(session, "main_activity_received", now)
        }
    }

    private fun markFirstVisible(handoffId: String) {
        val now = SystemClock.elapsedRealtime()
        synchronized(launchLock) {
            val session = performanceSession?.takeIf { it.handoffId == handoffId } ?: return
            finishFirstVisibleLocked(session, now)
        }
    }

    private fun finishFirstVisibleLocked(
        session: PerformanceSession,
        now: Long,
    ) {
        if (session.routeRenderOpen) {
            endAsyncSection(TRACE_ROUTE_RENDER, session.cookie)
            session.routeRenderOpen = false
        }
        if (session.firstVisibleOpen) {
            endAsyncSection(TRACE_CONFIRM_TO_FIRST_VISIBLE, session.cookie)
            session.firstVisibleOpen = false
            logPhase(session, "first_visible", now)
        }
    }

    private fun finishPerformance(
        handoffId: String,
        reason: String,
    ) {
        val now = SystemClock.elapsedRealtime()
        synchronized(launchLock) {
            val session = performanceSession?.takeIf { it.handoffId == handoffId } ?: return
            finishPerformanceLocked(session, reason, now)
            performanceSession = null
        }
    }

    private fun finishPerformanceLocked(
        session: PerformanceSession,
        reason: String,
        now: Long,
    ) {
        if (session.mainActivityHandoffOpen) {
            endAsyncSection(TRACE_MAIN_ACTIVITY_HANDOFF, session.cookie)
            session.mainActivityHandoffOpen = false
        }
        if (session.routeRenderOpen) {
            endAsyncSection(TRACE_ROUTE_RENDER, session.cookie)
            session.routeRenderOpen = false
        }
        if (session.formDataReadyOpen) {
            endAsyncSection(TRACE_FORM_DATA_READY, session.cookie)
            session.formDataReadyOpen = false
        }
        if (session.firstVisibleOpen) {
            endAsyncSection(TRACE_CONFIRM_TO_FIRST_VISIBLE, session.cookie)
            session.firstVisibleOpen = false
        }
        if (session.interactiveOpen) {
            endAsyncSection(TRACE_CONFIRM_TO_INTERACTIVE, session.cookie)
            session.interactiveOpen = false
        }
        logPhase(session, reason, now)
    }

    private fun logPhase(
        session: PerformanceSession,
        phase: String,
        now: Long,
    ) {
        val phaseMs = now - session.lastPhaseAt
        val totalMs = now - session.confirmStartedAt
        session.lastPhaseAt = now
        Log.i(
            PERF_TAG,
            "handoffId=${session.handoffId} phase=$phase phaseMs=$phaseMs totalMs=$totalMs",
        )
    }

    private fun beginAsyncSection(
        name: String,
        cookie: Int,
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            Trace.beginAsyncSection(name, cookie)
        }
    }

    private fun endAsyncSection(
        name: String,
        cookie: Int,
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            Trace.endAsyncSection(name, cookie)
        }
    }

    private inline fun runOnMainThread(crossinline action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            mainHandler.post { action() }
        }
    }
}
