#!/usr/bin/env bash
# TC-QA-E6 | shortcut -> form -> re-edit amount -> OK (the reported freeze path)
# Keypad #2 must deliver its result: amount updates and the sheet stays interactive.
set -uo pipefail

TC_ID="TC-QA-E6"
TC_NAME="re-edit amount from quick-add form"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

type_key() { tap_by_id "$1" || fail "keypad key '$1' not tappable"; }

run_case() {
	step "cold start: force-stop app"
	force_stop_app
	sleep 1

	step "trigger quick-add shortcut"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad OK button not shown"
	sleep 1

	step "type 12.34 + OK"
	type_key btn1; type_key btn2; type_key btnDot; type_key btn3; type_key btn4
	type_key btnOk || fail "keypad OK tap failed"

	step "quick-add form appears"
	wait_for_text "记一笔" || fail "form title '记一笔' not shown"
	visible_text "12.34" || fail "prefilled amount mismatch (expected 12.34)"
	sleep 1

	step "tap amount area -> result-mode keypad reopens"
	tap_by_text "12.34" || fail "amount field not tappable"
	wait_for_id btnOk || fail "second keypad did not open"
	sleep 1

	step "edit to 5.67 + OK"
	type_key btn5; type_key btnDot; type_key btn6; type_key btn7
	type_key btnOk || fail "second OK tap failed"

	step "keypad closed and amount updated"
	wait_gone_id btnOk || fail "second keypad stayed open after OK"
	visible_text "5.67" || fail "amount not updated to 5.67 (result lost)"

	step "sheet is still interactive (back exits to desktop)"
	press_back
	wait_off_app || fail "app did not return to desktop after back (screen trapped)"

	pass
}

runner_main "$@"
