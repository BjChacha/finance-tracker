#!/usr/bin/env bash
# TC-QA-1.2 | cold-start · cancel
# Process dead -> shortcut -> keypad -> OK -> form -> cancel (back) -> desktop, no new row.
set -uo pipefail

TC_ID="TC-QA-1.2"
TC_NAME="cold-start - cancel"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

type_key() { tap_by_id "$1" || fail "keypad key '$1' not tappable"; }

run_case() {
	local n
	n="$(db_tx_count || true)"
	if [ -z "$n" ]; then
		step "WARN: cannot read DB; skipping no-new-row check"
	else
		step "baseline tx count = $n"
	fi

	step "cold start: force-stop app"
	force_stop_app
	sleep 1
	app_alive && fail "app still alive after force-stop"

	step "trigger quick-add shortcut"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad OK button not shown"

	step "type 12.34"
	type_key btn1; type_key btn2; type_key btnDot; type_key btn3; type_key btn4
	tap_by_id btnOk || fail "keypad OK tap failed"

	step "enter quick-add form"
	wait_for_text "记一笔" || fail "form title '记一笔' not shown"

	step "cancel via hardware back"
	press_back

	step "verify app returned to desktop"
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
