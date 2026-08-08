#!/usr/bin/env bash
# TC-QA-3.2 | warm-start (level-2 screen) · cancel
# App alive on a level-2 screen -> home -> shortcut -> OK -> form -> cancel -> desktop, no new row.
set -uo pipefail

TC_ID="TC-QA-3.2"
TC_NAME="warm-start level-2 - cancel"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

type_key() { tap_by_id "$1" || fail "keypad key '$1' not tappable"; }

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
	if [ -z "$n" ]; then
		step "WARN: cannot read DB; skipping no-new-row check"
	else
		step "baseline tx count = $n"
	fi

	step "warm setup: open a level-2 screen (transactions), then go home"
	warm_level2
	app_alive || fail "app not alive after going home"

	step "trigger quick-add shortcut"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad OK button not shown"

	step "type 36.9"
	type_key btn3; type_key btn6; type_key btnDot; type_key btn9
	tap_by_id btnOk || fail "keypad OK tap failed"

	step "enter form"
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
