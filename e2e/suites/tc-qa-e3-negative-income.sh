#!/usr/bin/env bash
# TC-QA-E3 | negative amount -> income
# Shortcut -> keypad -12.5 -> OK -> form shows income, amount = abs = 12.5 -> save -> DB+1.
set -uo pipefail

TC_ID="TC-QA-E3"
TC_NAME="negative amount - income"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

type_key() { tap_by_id "$1" || fail "keypad key '$1' not tappable"; }

run_case() {
	local n
	n="$(db_tx_count || true)"
	[ -n "$n" ] || fail "cannot read DB (need debug build + sqlite3 on device)"
	step "baseline tx count = $n"

	step "cold start: force-stop app"
	force_stop_app
	sleep 1

	step "trigger quick-add shortcut"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad not shown"

	step "type -12.5 (minus then 12.5)"
	type_key btnSub; type_key btn1; type_key btn2; type_key btnDot; type_key btn5
	tap_by_id btnOk || fail "OK tap failed"

	step "enter form; expect amount = abs(-12.5) = 12.5"
	wait_for_text "记一笔" || fail "form not shown"
	visible_text "12.5" || fail "amount not 12.5 (negative->abs failed)"

	step "tap save"
	tap_by_text "保存" || fail "save button not found"
	wait_off_app || fail "app did not return to desktop after save"

	step "verify DB row +1"
	local got
	got="$(db_tx_count || true)"
	[ "$got" = "$((n + 1))" ] || fail "expected $((n + 1)) rows, got '$got'"

	pass
}

runner_main "$@"
