package expo.modules.quickkeypad

import android.app.Activity
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Launch delivery is pull-only: JavaScript reads getPendingQuickAddLaunch() when the router root
 * is ready (and again when the app returns to the foreground). Pushing the launch through an
 * event was delivered to a stale MainActivity root that CLEAR_TASK was about to destroy, which
 * raced the new root's deep-link navigation (duplicate/ghost forms, handoff timeouts).
 */
class QuickKeypadModule : Module() {
    private var pendingPromise: Promise? = null
    private var hasPendingActivityResult = false
    private var pendingActivityResult: Map<String, Any>? = null

    override fun definition() =
        ModuleDefinition {
            Name("QuickKeypad")

            Function("syncTheme") { theme: QuickKeypadThemeRecord ->
                val context =
                    appContext.reactContext?.applicationContext
                        ?: return@Function false
                QuickKeypadThemeStore.save(context, theme)
            }

            OnCreate {
                registerQuickAddShortcut()
            }

            OnActivityEntersForeground {
                resolvePendingActivityResult()
            }

            AsyncFunction("open") {
                initialAmount: Double,
                initialCurrency: String,
                allowCurrencySelection: Boolean,
                allowZero: Boolean,
                promise: Promise,
                ->
                val activity = appContext.currentActivity
                if (activity == null) {
                    promise.resolve(null)
                    return@AsyncFunction
                }
                if (pendingPromise != null) {
                    // A previous open() never settled (its activity result was lost while the app was
                    // backgrounded). Recycle the slot instead of silently rejecting every future open.
                    val stale = pendingPromise
                    pendingPromise = null
                    hasPendingActivityResult = false
                    pendingActivityResult = null
                    stale?.resolve(null)
                }

                pendingPromise = promise
                hasPendingActivityResult = false
                pendingActivityResult = null
                val intent =
                    Intent(activity, QuickKeypadActivity::class.java).apply {
                        putExtra(QuickKeypadActivity.EXTRA_RESULT_MODE, true)
                        putExtra(QuickKeypadActivity.EXTRA_INITIAL_AMOUNT, initialAmount.toLong())
                        putExtra(QuickKeypadActivity.EXTRA_INITIAL_CURRENCY, initialCurrency)
                        putExtra(QuickKeypadActivity.EXTRA_ALLOW_CURRENCY_SELECTION, allowCurrencySelection)
                        putExtra(QuickKeypadActivity.EXTRA_ALLOW_ZERO, allowZero)
                    }
                activity.startActivityForResult(intent, REQUEST_CODE)
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    @Suppress("DEPRECATION")
                    activity.overridePendingTransition(R.anim.slide_up, 0)
                }
            }

            Function("completeAppLaunch") {
                AppLaunchController.complete()
            }

            Function("completeQuickAddHandoff") { handoffId: String ->
                QuickAddHandoffController.complete(handoffId)
            }

            AsyncFunction("revealQuickAddPresentation") { handoffId: String, promise: Promise ->
                QuickAddHandoffController.revealPresentation(handoffId) { revealed ->
                    promise.resolve(revealed)
                }
            }

            Function("completeQuickAddInteractive") { handoffId: String ->
                QuickAddHandoffController.completeInteractive(handoffId)
            }

            Function("getPendingQuickAddLaunch") {
                QuickAddHandoffController.getPendingLaunch()?.toPayload()
            }

            // Fallback signal for the natural-language shortcut: Expo's activity delegate can
            // swallow onNewIntent, so JS pulls this when the router root is ready and on resume.
            Function("consumePendingNaturalLanguageLaunch") {
                QuickAddHandoffController.consumePendingNaturalLanguageLaunch()
            }

            OnActivityResult { activity, (requestCode, resultCode, data) ->
                if (requestCode != REQUEST_CODE) {
                    return@OnActivityResult
                }

                if (pendingPromise == null) return@OnActivityResult
                hasPendingActivityResult = true
                pendingActivityResult =
                    if (resultCode == Activity.RESULT_OK && data != null) {
                        mapOf(
                            "amountCents" to
                                data.getLongExtra(QuickKeypadActivity.RESULT_AMOUNT_CENTS, 0L).toDouble(),
                            "currency" to (data.getStringExtra(QuickKeypadActivity.RESULT_CURRENCY) ?: "CNY"),
                        )
                    } else {
                        null
                    }

                val resumed =
                    (activity as? LifecycleOwner)
                        ?.lifecycle
                        ?.currentState
                        ?.isAtLeast(Lifecycle.State.RESUMED) == true
                if (resumed) {
                    resolvePendingActivityResult()
                }
            }

            OnDestroy {
                pendingPromise?.resolve(null)
                pendingPromise = null
                hasPendingActivityResult = false
                pendingActivityResult = null
            }
        }

    private fun resolvePendingActivityResult() {
        if (!hasPendingActivityResult) return
        val promise =
            pendingPromise ?: run {
                hasPendingActivityResult = false
                pendingActivityResult = null
                return
            }
        val result = pendingActivityResult
        pendingPromise = null
        hasPendingActivityResult = false
        pendingActivityResult = null
        promise.resolve(result)
    }

    private fun registerQuickAddShortcut() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return
        val context = appContext.reactContext?.applicationContext ?: return
        val shortcutManager = context.getSystemService(ShortcutManager::class.java) ?: return
        val intent =
            Intent(context, QuickKeypadActivity::class.java).apply {
                action = "${context.packageName}.QUICK_ADD_TX"
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        val iconResource =
            context.resources
                .getIdentifier("add", "mipmap", context.packageName)
                .takeIf { it != 0 }
                ?: context.applicationInfo.icon
        val shortcut =
            ShortcutInfo
                .Builder(context, "add-transaction")
                .setShortLabel("记一笔")
                .setLongLabel("记一笔")
                .setIcon(Icon.createWithResource(context, iconResource))
                .setIntent(intent)
                .build()
        // Natural-language entry is a normal app launch with a deep link: the input surface lives in
        // React, so the shortcut must not start a separate native activity.
        val textShortcut =
            ShortcutInfo
                .Builder(context, "natural-language-transaction")
                .setShortLabel(context.getString(R.string.natural_language_title))
                .setLongLabel(context.getString(R.string.natural_language_title))
                .setIcon(Icon.createWithResource(context, iconResource))
                .setIntent(
                    Intent(
                        Intent.ACTION_VIEW,
                        Uri.parse("$DEEP_LINK_SCHEME://natural-language-transaction?source=launcher"),
                    ).apply {
                        setClassName(context.packageName, "${context.packageName}.MainActivity")
                        putExtra(QuickAddHandoffController.EXTRA_TRANSLUCENT_LAUNCH, true)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    },
                ).build()
        shortcutManager.dynamicShortcuts = listOf(shortcut, textShortcut)
    }

    private companion object {
        const val REQUEST_CODE = 4201
        const val DEEP_LINK_SCHEME = "finance-tracker"
    }
}
