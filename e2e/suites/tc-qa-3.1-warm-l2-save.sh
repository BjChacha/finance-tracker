#!/usr/bin/env bash
# TC-QA-3.1 | warm-start (level-2 screen) · save
# App alive on a level-2 screen -> home -> shortcut -> OK -> form (level-2 cleared
# by dismissAll) -> save -> desktop + DB+1.
set -uo pipefail

TC_ID="TC-QA-3.1"
TC_NAME="warm-start level-2 - save"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

type_key() { tap_by_id "$1" || fail "keypad key '$1' not tappable"; }

# Warm precondition: app on a level-2 screen (transactions list) via deep link,
# then backgrounded. The residual modal must be cleared before quick-add shows.
warm_level2() {
	am_start_main
	sleep 2
	deep_link "transactions"
	sleep 2
	go_home
	sleep 1
}

run_case() {
	local n
	n="$(db_tx_count || true)"
	[ -n "$n" ] || fail "cannot read DB (need debug build + sqlite3 on device)"
	step "baseline tx count = $n"

	step "warm setup: open a level-2 screen (transactions), then go home"
	warm_level2
	app_alive || fail "app not alive after going home"

	step "trigger quick-add shortcut"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad OK button not shown"

	step "type 36.9"
	type_key btn3; type_key btn6; type_key btnDot; type_key btn9
	tap_by_id btnOk || fail "keypad OK tap failed"

	step "enter form; level-2 residual must be cleared (dismissAll)"
	wait_for_text "记一笔" || fail "quick-add form not in foreground (level-2 residual not cleared?)"
	visible_text "36.9" || fail "prefilled amount mismatch (expected 36.9)"

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
