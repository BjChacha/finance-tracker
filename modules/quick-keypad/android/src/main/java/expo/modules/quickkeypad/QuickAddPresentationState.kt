package expo.modules.quickkeypad

internal enum class QuickAddPresentationPhase {
  COVERED,
  REVEALED,
  RELEASED,
}

internal data class QuickAddRevealDecision(
  val accepted: Boolean,
  val changed: Boolean,
)

internal data class QuickAddReleaseDecision(
  val accepted: Boolean,
  val revealFirst: Boolean,
)

internal class QuickAddPresentationState(
  private val handoffId: String,
) {
  var phase: QuickAddPresentationPhase = QuickAddPresentationPhase.COVERED
    private set

  fun reveal(candidateHandoffId: String): QuickAddRevealDecision {
    if (candidateHandoffId != handoffId || phase == QuickAddPresentationPhase.RELEASED) {
      return QuickAddRevealDecision(accepted = false, changed = false)
    }
    if (phase == QuickAddPresentationPhase.REVEALED) {
      return QuickAddRevealDecision(accepted = true, changed = false)
    }
    phase = QuickAddPresentationPhase.REVEALED
    return QuickAddRevealDecision(accepted = true, changed = true)
  }

  fun release(candidateHandoffId: String): QuickAddReleaseDecision {
    return finish(candidateHandoffId)
  }

  fun abort(candidateHandoffId: String): QuickAddReleaseDecision {
    return finish(candidateHandoffId)
  }

  private fun finish(candidateHandoffId: String): QuickAddReleaseDecision {
    if (candidateHandoffId != handoffId || phase == QuickAddPresentationPhase.RELEASED) {
      return QuickAddReleaseDecision(accepted = false, revealFirst = false)
    }
    val revealFirst = phase == QuickAddPresentationPhase.COVERED
    phase = QuickAddPresentationPhase.RELEASED
    return QuickAddReleaseDecision(accepted = true, revealFirst = revealFirst)
  }
}
