package expo.modules.quickkeypad

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickAddPresentationStateTest {
  @Test
  fun revealMovesCoveredPresentationToRevealedAndIsIdempotent() {
    val state = QuickAddPresentationState("handoff-1")

    val first = state.reveal("handoff-1")
    val second = state.reveal("handoff-1")

    assertTrue(first.accepted)
    assertTrue(first.changed)
    assertTrue(second.accepted)
    assertFalse(second.changed)
    assertEquals(QuickAddPresentationPhase.REVEALED, state.phase)
  }

  @Test
  fun staleHandoffCannotRevealOrReleasePresentation() {
    val state = QuickAddPresentationState("handoff-1")

    assertFalse(state.reveal("handoff-old").accepted)
    assertFalse(state.release("handoff-old").accepted)
    assertEquals(QuickAddPresentationPhase.COVERED, state.phase)
  }

  @Test
  fun earlyInteractiveReleaseRevealsCoveredPresentationFirst() {
    val state = QuickAddPresentationState("handoff-1")

    val decision = state.release("handoff-1")

    assertTrue(decision.accepted)
    assertTrue(decision.revealFirst)
    assertEquals(QuickAddPresentationPhase.RELEASED, state.phase)
    assertFalse(state.reveal("handoff-1").accepted)
  }

  @Test
  fun interactiveReleaseDoesNotRevealAnAlreadyRevealedPresentationAgain() {
    val state = QuickAddPresentationState("handoff-1")
    state.reveal("handoff-1")

    val decision = state.release("handoff-1")

    assertTrue(decision.accepted)
    assertFalse(decision.revealFirst)
    assertEquals(QuickAddPresentationPhase.RELEASED, state.phase)
    assertFalse(state.release("handoff-1").accepted)
  }

  @Test
  fun timeoutOrActivityDestructionRevealsCoveredPresentationBeforeAbort() {
    val state = QuickAddPresentationState("handoff-1")

    val decision = state.abort("handoff-1")

    assertTrue(decision.accepted)
    assertTrue(decision.revealFirst)
    assertEquals(QuickAddPresentationPhase.RELEASED, state.phase)
  }
}
