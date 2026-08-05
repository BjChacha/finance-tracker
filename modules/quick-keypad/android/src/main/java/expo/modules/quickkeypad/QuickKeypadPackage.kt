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
    return listOf(QuickAddHandoffLifecycleListener())
  }
}

private class QuickAddHandoffLifecycleListener : ReactActivityLifecycleListener {
  private var activityRef: WeakReference<Activity>? = null

  override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
    activityRef = WeakReference(activity)
    QuickAddHandoffController.attachMainActivity(activity)
    beginHandoff(activity, activity.intent)
  }

  override fun onResume(activity: Activity) {
    activityRef = WeakReference(activity)
    QuickAddHandoffController.attachMainActivity(activity)
  }

  override fun onNewIntent(intent: Intent): Boolean {
    activityRef?.get()?.let { beginHandoff(it, intent) }
    return false
  }

  override fun onDestroy(activity: Activity) {
    QuickAddHandoffController.clear(activity)
    if (activityRef?.get() === activity) {
      activityRef = null
    }
  }

  /**
   * A quick-add intent starts the protected translucent handoff. Every normal intent cancels any
   * retained source and restores the reused singleTask MainActivity to its opaque state.
   */
  private fun beginHandoff(activity: Activity, intent: Intent?) {
    val handoffId = intent?.getStringExtra(QuickAddHandoffController.EXTRA_HANDOFF_ID)
    if (handoffId.isNullOrBlank()) {
      QuickAddHandoffController.restoreOpaque(activity)
      return
    }
    QuickAddHandoffController.begin(activity, handoffId)
  }
}
