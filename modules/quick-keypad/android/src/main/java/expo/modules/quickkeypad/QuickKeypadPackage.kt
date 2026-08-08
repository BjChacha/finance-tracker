package expo.modules.quickkeypad

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

class QuickKeypadPackage : Package {
  override fun createReactActivityLifecycleListeners(
    activityContext: Context?,
  ): List<ReactActivityLifecycleListener> {
    return listOf(MainActivityLaunchLifecycleListener())
  }
}

private class MainActivityLaunchLifecycleListener : ReactActivityLifecycleListener {
  private var activityRef: WeakReference<Activity>? = null

  override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
    activityRef = WeakReference(activity)
    QuickAddHandoffController.attachMainActivity(activity)
    beginInitialLaunch(activity, activity.intent)
  }

  override fun onResume(activity: Activity) {
    activityRef = WeakReference(activity)
    QuickAddHandoffController.attachMainActivity(activity)
  }

  override fun onNewIntent(intent: Intent): Boolean {
    activityRef?.get()?.let { handleNewIntent(it, intent) }
    return false
  }

  override fun onDestroy(activity: Activity) {
    AppLaunchController.clear(activity)
    QuickAddHandoffController.clear(activity)
    if (activityRef?.get() === activity) {
      activityRef = null
    }
  }

  private fun beginInitialLaunch(activity: Activity, intent: Intent?) {
    val handoffId = intent?.getStringExtra(QuickAddHandoffController.EXTRA_HANDOFF_ID)
    if (handoffId.isNullOrBlank()) {
      QuickAddHandoffController.restoreOpaque(activity)
      AppLaunchController.begin(activity)
      return
    }
    AppLaunchController.cancelForQuickAdd(activity)
    QuickAddHandoffController.begin(activity, handoffId)
  }

  /** A reused singleTask Activity never replays the normal app-launch fade. */
  private fun handleNewIntent(activity: Activity, intent: Intent?) {
    val handoffId = intent?.getStringExtra(QuickAddHandoffController.EXTRA_HANDOFF_ID)
    if (handoffId.isNullOrBlank()) {
      QuickAddHandoffController.restoreOpaque(activity)
      return
    }
    AppLaunchController.cancelForQuickAdd(activity)
    QuickAddHandoffController.begin(activity, handoffId)
  }
}
