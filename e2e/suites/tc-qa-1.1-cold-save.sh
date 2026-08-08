#!/usr/bin/env bash
# TC-QA-1.1 | cold-start · save
# Process dead -> shortcut -> keypad 12.34 -> OK -> form -> save -> desktop + DB+1.
set -uo pipefail

TC_ID="TC-QA-1.1"
TC_NAME="cold-start - save"
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
	app_alive && fail "app still alive after force-stop"

	step "trigger quick-add shortcut (adb am start QuickKeypadActivity)"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad OK button not shown"

	step "type 12.34"
	type_key btn1; type_key btn2; type_key btnDot; type_key btn3; type_key btn4

	step "confirm amount (OK)"
	tap_by_id btnOk || fail "keypad OK tap failed"

	step "enter quick-add form"
	wait_for_text "记一笔" || fail "form title '记一笔' not shown"
	visible_text "12.34" || fail "prefilled amount mismatch (expected 12.34)"

	step "tap save"
	tap_by_text "保存" || fail "save button not found"

	step "verify app returned to desktop"
	wait_off_app || fail "app did not return to desktop after save"

	step "verify DB row +1"
	local got
	got="$(db_tx_count || true)"
	[ "$got" = "$((n + 1))" ] || fail "expected $((n + 1)) rows, got '$got'"

	pass
}

runner_main "$@"
