#!/usr/bin/env bash
# TC-QA-E2 | zero-amount blocked
# Shortcut -> keypad -> OK with 0.00 -> no-op (keypad stays, no form launched).
set -uo pipefail

TC_ID="TC-QA-E2"
TC_NAME="zero-amount blocked"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

run_case() {
	step "cold start: force-stop app"
	force_stop_app
	sleep 1

	step "trigger quick-add shortcut"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad not shown"

	step "press OK with empty (0.00) amount - must be a no-op"
	tap_by_id btnOk
	sleep 1

	# Confirm must bail on cents==0: keypad stays, form must NOT appear.
	visible_id btnOk || fail "keypad dismissed despite zero amount (should be blocked)"
	visible_text "记一笔" && fail "form shown despite zero amount"

	pass
}

runner_main "$@"
