#!/usr/bin/env bash
# TC-QA-E7 | shortcut -> form -> keypad#2 -> invalid/zero confirm shows feedback
# A blocked OK must never look like a dead keypad: the hint appears, the amount can
# still be fixed, and the result is delivered on the next valid OK.
set -uo pipefail

TC_ID="TC-QA-E7"
TC_NAME="keypad blocked-confirm feedback"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

type_key() { tap_by_id "$1" || fail "keypad key '$1' not tappable"; }

open_form_and_keypad2() {
	force_stop_app
	sleep 1
	am_start_quickadd
	wait_for_id btnOk || fail "keypad OK button not shown"
	sleep 1
	type_key btn1; type_key btn2; type_key btnDot; type_key btn3; type_key btn4
	type_key btnOk || fail "keypad OK tap failed"
	wait_for_text "记一笔" || fail "form title '记一笔' not shown"
	sleep 1
	tap_by_text "12.34" || fail "amount field not tappable"
	wait_for_id btnOk || fail "second keypad did not open"
	sleep 1
}

run_case() {
	step "empty expression: OK is blocked with a visible hint"
	open_form_and_keypad2
	type_key btnC
	type_key btnOk || fail "OK tap failed"
	visible_text "金额无效" || fail "no feedback for empty expression (silent block)"
	visible_id btnOk || fail "keypad vanished on blocked confirm"

	step "typing after the hint recovers and delivers"
	type_key btn5; type_key btnDot; type_key btn6; type_key btn7
	type_key btnOk || fail "second OK tap failed"
	wait_gone_id btnOk || fail "keypad stayed open after valid confirm"
	visible_text "5.67" || fail "amount not updated to 5.67"

	step "zero amount: OK is blocked with a visible hint"
	open_form_and_keypad2
	type_key btnC; type_key btn0
	type_key btnOk || fail "OK tap failed"
	visible_text "金额不能为 0" || fail "no feedback for zero amount (silent block)"

	step "cancel still works from the blocked state"
	type_key mask || fail "mask (cancel zone) not tappable"
	wait_gone_id btnOk || fail "keypad stayed open after cancel"
	visible_text "12.34" || fail "original amount lost after cancelled re-edit"

	pass
}

runner_main "$@"
