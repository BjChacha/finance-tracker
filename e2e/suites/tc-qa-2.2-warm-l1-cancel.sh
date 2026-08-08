#!/usr/bin/env bash
# TC-QA-2.2 | warm-start (level-1 tab) · cancel
# App alive on a tab -> home -> shortcut -> keypad -> OK -> form -> cancel -> desktop, no new row.
set -uo pipefail

TC_ID="TC-QA-2.2"
TC_NAME="warm-start level-1 - cancel"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

type_key() { tap_by_id "$1" || fail "keypad key '$1' not tappable"; }

warm_level1() {
	am_start_main
	sleep 2
	go_home
	sleep 1
}

run_case() {
	local n
	n="$(db_tx_count || true)"
	if [ -z "$n" ]; then
		step "WARN: cannot read DB; skipping no-new-row check"
	else
		step "baseline tx count = $n"
	fi

	step "warm setup: open app on a level-1 tab, then go home"
	warm_level1
	app_alive || fail "app not alive after going home"

	step "trigger quick-add shortcut"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad OK button not shown"

	step "type 88"
	type_key btn8; type_key btn8
	tap_by_id btnOk || fail "keypad OK tap failed"

	step "enter quick-add form"
	wait_for_text "记一笔" || fail "form title not shown"

	step "cancel via hardware back"
	press_back
	wait_off_app || fail "app did not return to desktop after cancel"

	if [ -n "$n" ]; then
		step "verify DB unchanged"
		local got
		got="$(db_tx_count || true)"
		[ "$got" = "$n" ] || fail "expected $n rows (no new), got '$got'"
	fi

	pass
}

runner_main "$@"
