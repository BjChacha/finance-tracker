#!/usr/bin/env bash
# TC-QA-2.1 | warm-start (level-1 tab) · save
# App alive on a tab -> home -> shortcut -> keypad 88 -> OK -> form -> save -> desktop + DB+1.
set -uo pipefail

TC_ID="TC-QA-2.1"
TC_NAME="warm-start level-1 - save"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

type_key() { tap_by_id "$1" || fail "keypad key '$1' not tappable"; }

# Warm precondition: app foregrounded on a level-1 tab, then sent to background.
warm_level1() {
	am_start_main
	sleep 2
	go_home
	sleep 1
}

run_case() {
	local n
	n="$(db_tx_count || true)"
	[ -n "$n" ] || fail "cannot read DB (need debug build + sqlite3 on device)"
	step "baseline tx count = $n"

	step "warm setup: open app on a level-1 tab, then go home"
	warm_level1
	app_alive || fail "app not alive after going home (enablement: keep activities)"

	step "trigger quick-add shortcut"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad OK button not shown"

	step "type 88"
	type_key btn8; type_key btn8
	tap_by_id btnOk || fail "keypad OK tap failed"

	step "enter quick-add form"
	wait_for_text "记一笔" || fail "form title not shown"
	visible_text "88" || fail "prefilled amount mismatch (expected 88)"

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
