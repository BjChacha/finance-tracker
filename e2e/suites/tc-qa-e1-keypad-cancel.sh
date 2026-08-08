#!/usr/bin/env bash
# TC-QA-E1 | keypad-stage cancel
# Shortcut -> keypad -> cancel (back) before OK -> stays on desktop, no form, no save.
set -uo pipefail

TC_ID="TC-QA-E1"
TC_NAME="keypad-stage cancel"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$DIR/../lib/runner.sh"

run_case() {
	step "cold start: force-stop app"
	force_stop_app
	sleep 1

	step "trigger quick-add shortcut"
	am_start_quickadd
	wait_for_id btnOk || fail "keypad not shown"

	step "cancel keypad before pressing OK (hardware back)"
	press_back

	# Focus check (not process liveness): prewarmReactHost keeps the process
	# alive, so we assert that no app Activity holds focus after the keypad closes.
	step "verify keypad closed and no app screen took over"
	wait_gone_id btnOk || fail "keypad did not close after back"
	wait_off_app || fail "an app screen took focus (expected to stay on desktop)"

	pass
}

runner_main "$@"
