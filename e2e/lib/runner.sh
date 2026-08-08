# shellcheck shell=bash
# Common harness sourced by every suite.
#
# A suite sets TC_ID / TC_NAME and defines run_case(), then calls runner_main.
# runner_main pulls in config + device + helpers + db, prepares the device, and
# invokes run_case. step()/pass()/fail() give uniform pass/fail reporting.

TC_ID="${TC_ID:-UNKNOWN}"
TC_NAME="${TC_NAME:-}"

step() { echo "  - $*"; }

pass() {
	echo "PASS: ${TC_ID} ${TC_NAME}"
	exit 0
}

fail() {
	echo "FAIL: ${TC_ID} ${TC_NAME:+(${TC_NAME})} - $*" >&2
	exit 1
}

runner_main() {
	local here
	here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	# shellcheck source=/dev/null
	. "$here/config.sh"
	# shellcheck source=/dev/null
	. "$here/device.sh"
	# shellcheck source=/dev/null
	. "$here/adb-helpers.sh"
	# shellcheck source=/dev/null
	. "$here/db.sh"
	device_setup || fail "device setup failed (adb unavailable / no device)"
	if ! command -v run_case >/dev/null 2>&1; then
		fail "suite did not define run_case()"
	fi
	run_case
}
