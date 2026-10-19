package expo.modules.quickkeypad

/** Native entry windows retained until the application presents their destination. */
interface QuickAddHandoffSource {
  fun finishRetainedHandoff(handoffId: String)
  fun cancelRetainedHandoff(handoffId: String)
}
