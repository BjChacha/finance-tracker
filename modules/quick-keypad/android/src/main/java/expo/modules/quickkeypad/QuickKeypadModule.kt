package expo.modules.quickkeypad

import android.app.Activity
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class QuickKeypadModule : Module() {
  private var pendingPromise: Promise? = null
  private var hasPendingActivityResult = false
  private var pendingActivityResult: Map<String, Any>? = null
  private val quickAddLaunchListener =
    { launch: QuickAddHandoffController.QuickAddLaunch ->
      sendEvent(EVENT_QUICK_ADD_LAUNCH, launch.toPayload())
    }

  override fun definition() = ModuleDefinition {
    Name("QuickKeypad")

    Events(EVENT_QUICK_ADD_LAUNCH)

    Function("syncTheme") { theme: QuickKeypadThemeRecord ->
      val context = appContext.reactContext?.applicationContext
        ?: return@Function false
      QuickKeypadThemeStore.save(context, theme)
    }

    OnCreate {
      QuickAddHandoffController.setLaunchListener(quickAddLaunchListener)
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
        promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null || pendingPromise != null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      pendingPromise = promise
      hasPendingActivityResult = false
      pendingActivityResult = null
      val intent = Intent(activity, QuickKeypadActivity::class.java).apply {
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

    Function("completeQuickAddHandoff") { handoffId: String ->
      QuickAddHandoffController.complete(handoffId)
    }

    Function("completeQuickAddInteractive") { handoffId: String ->
      QuickAddHandoffController.completeInteractive(handoffId)
    }

    Function("getPendingQuickAddLaunch") {
      QuickAddHandoffController.getPendingLaunch()?.toPayload()
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
      QuickAddHandoffController.removeLaunchListener(quickAddLaunchListener)
      pendingPromise?.resolve(null)
      pendingPromise = null
      hasPendingActivityResult = false
      pendingActivityResult = null
    }
  }

  private fun resolvePendingActivityResult() {
    if (!hasPendingActivityResult) return
    val promise = pendingPromise ?: run {
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
    val intent = Intent(context, QuickKeypadActivity::class.java).apply {
      action = "${context.packageName}.QUICK_ADD_TX"
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val iconResource = context.resources.getIdentifier("add", "mipmap", context.packageName)
      .takeIf { it != 0 }
      ?: context.applicationInfo.icon
    val shortcut = ShortcutInfo.Builder(context, "add-transaction")
      .setShortLabel("记一笔")
      .setLongLabel("记一笔")
      .setIcon(Icon.createWithResource(context, iconResource))
      .setIntent(intent)
      .build()
    shortcutManager.dynamicShortcuts = listOf(shortcut)
  }

  private companion object {
    const val REQUEST_CODE = 4201
    const val EVENT_QUICK_ADD_LAUNCH = "onQuickAddLaunch"
  }
}
