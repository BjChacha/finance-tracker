package expo.modules.quickkeypad

import android.animation.ValueAnimator
import android.app.Activity
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import androidx.core.view.WindowInsetsControllerCompat
import java.lang.ref.WeakReference

/** Keeps a new MainActivity on its resolved theme color until the first React screen is ready. */
object AppLaunchController {
  private const val TAG = "AppLaunch"
  private const val TIMEOUT_MS = 5_000L
  private const val FADE_DURATION_MS = 160L

  private val mainHandler = Handler(Looper.getMainLooper())
  private val fadeInterpolator = PathInterpolator(0.2f, 0f, 0f, 1f)

  private class LaunchSession(
    val activityRef: WeakReference<Activity>,
    val contentRef: WeakReference<View>?,
    val originalContentVisibility: Int,
    val originalContentAlpha: Float,
    val originalContentAccessibility: Int,
    val overlay: View,
    val backgroundColor: Int,
    var releaseStarted: Boolean = false,
  )

  private var launchSession: LaunchSession? = null
  private var explicitlyOpaqueActivityRef: WeakReference<Activity>? = null

  private val timeoutRunnable = Runnable {
    val current = launchSession ?: return@Runnable
    Log.w(TAG, "Timed out waiting for the first React screen")
    releaseOnMain(current, animate = false)
  }

  fun begin(activity: Activity) {
    runOnMainThread { beginOnMain(activity) }
  }

  fun complete() {
    runOnMainThread {
      val current = launchSession ?: return@runOnMainThread
      releaseOnMain(current, animate = areAnimationsEnabled())
    }
  }

  fun cancelForQuickAdd(activity: Activity) {
    runOnMainThread {
      val current = launchSession?.takeIf { it.activityRef.get() === activity }
        ?: return@runOnMainThread
      removeSessionOnMain(current)
    }
  }

  fun clear(activity: Activity) {
    runOnMainThread {
      launchSession
        ?.takeIf { it.activityRef.get() === activity }
        ?.let(::removeSessionOnMain)
      if (explicitlyOpaqueActivityRef?.get() === activity) {
        explicitlyOpaqueActivityRef = null
      }
    }
  }

  fun isExplicitlyOpaque(activity: Activity): Boolean =
    explicitlyOpaqueActivityRef?.get() === activity

  fun markExplicitlyOpaque(activity: Activity) {
    explicitlyOpaqueActivityRef = WeakReference(activity)
  }

  private fun beginOnMain(activity: Activity) {
    launchSession?.let(::removeSessionOnMain)
    if (explicitlyOpaqueActivityRef?.get() === activity) {
      explicitlyOpaqueActivityRef = null
    }

    val palette =
      QuickKeypadThemeStore.read(activity) ?: QuickKeypadThemeStore.fromResources(activity)
    val decorView = activity.window.decorView as? ViewGroup
    if (decorView == null) {
      Log.e(TAG, "MainActivity decor view is unavailable")
      makeWindowOpaque(activity, palette.background)
      return
    }

    activity.window.setBackgroundDrawable(ColorDrawable(palette.background))
    syncSystemBarAppearance(activity, decorView, palette)

    val content = activity.findViewById<View>(android.R.id.content)
    val overlay = View(activity).apply {
      setBackgroundColor(palette.background)
      isClickable = true
      isFocusable = true
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
      elevation = 10_000f
    }
    decorView.addView(
      overlay,
      ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )

    val current =
      LaunchSession(
        activityRef = WeakReference(activity),
        contentRef = content?.let(::WeakReference),
        originalContentVisibility = content?.visibility ?: View.VISIBLE,
        originalContentAlpha = content?.alpha ?: 1f,
        originalContentAccessibility =
          content?.importantForAccessibility ?: View.IMPORTANT_FOR_ACCESSIBILITY_AUTO,
        overlay = overlay,
        backgroundColor = palette.background,
      )
    content?.apply {
      visibility = View.INVISIBLE
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
    launchSession = current
    mainHandler.removeCallbacks(timeoutRunnable)
    mainHandler.postDelayed(timeoutRunnable, TIMEOUT_MS)
  }

  private fun releaseOnMain(
    current: LaunchSession,
    animate: Boolean,
  ) {
    if (launchSession !== current || current.releaseStarted) return
    current.releaseStarted = true
    mainHandler.removeCallbacks(timeoutRunnable)
    restoreContent(current)

    if (!animate || !current.overlay.isAttachedToWindow) {
      finishReleaseOnMain(current)
      return
    }

    current.overlay
      .animate()
      .alpha(0f)
      .setDuration(FADE_DURATION_MS)
      .setInterpolator(fadeInterpolator)
      .withEndAction {
        if (launchSession === current) {
          finishReleaseOnMain(current)
        }
      }
      .start()
  }

  private fun finishReleaseOnMain(current: LaunchSession) {
    if (launchSession !== current) return
    launchSession = null
    current.activityRef.get()?.let { activity ->
      makeWindowOpaque(activity, current.backgroundColor)
    }
    (current.overlay.parent as? ViewGroup)?.removeView(current.overlay)
  }

  private fun removeSessionOnMain(current: LaunchSession) {
    if (launchSession === current) {
      launchSession = null
    }
    mainHandler.removeCallbacks(timeoutRunnable)
    current.overlay.animate().cancel()
    restoreContent(current)
    (current.overlay.parent as? ViewGroup)?.removeView(current.overlay)
  }

  private fun restoreContent(current: LaunchSession) {
    current.contentRef?.get()?.apply {
      visibility = current.originalContentVisibility
      alpha = current.originalContentAlpha
      importantForAccessibility = current.originalContentAccessibility
    }
  }

  private fun makeWindowOpaque(
    activity: Activity,
    backgroundColor: Int,
  ) {
    activity.window.setBackgroundDrawable(ColorDrawable(backgroundColor))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      runCatching { activity.setTranslucent(false) }
        .onFailure { error -> Log.w(TAG, "Failed to make MainActivity opaque", error) }
    }
    markExplicitlyOpaque(activity)
  }

  private fun syncSystemBarAppearance(
    activity: Activity,
    decorView: View,
    palette: QuickKeypadPalette,
  ) {
    activity.window.statusBarColor = palette.background
    activity.window.navigationBarColor = palette.background
    WindowInsetsControllerCompat(activity.window, decorView).apply {
      isAppearanceLightStatusBars = !palette.isDark
      isAppearanceLightNavigationBars = !palette.isDark
    }
  }

  private fun areAnimationsEnabled(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || ValueAnimator.areAnimatorsEnabled()

  private inline fun runOnMainThread(crossinline action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      action()
    } else {
      mainHandler.post { action() }
    }
  }
}
