#!/usr/bin/env bash
# Entry point: run all (or selected) quick-add smoke suites and report.
#
# Usage:
#   bash e2e/bin/run-smoke.sh                 # run every tc-qa-*.sh
#   bash e2e/bin/run-smoke.sh suites/tc-qa-1.1-cold-save.sh   # run one
#   DEVICE_SERIAL=emulator-5554 bash e2e/bin/run-smoke.sh     # pin a device
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

SUITES=("$@")
if [ ${#SUITES[@]} -eq 0 ]; then
	mapfile -t SUITES < <(ls "$root"/suites/tc-qa-*.sh 2>/dev/null | sort)
fi

total=${#SUITES[@]}
if [ "$total" -eq 0 ]; then
	echo "No suites found under $root/suites" >&2
	exit 1
fi

passed=0
failed=0
failed_list=()
for s in "${SUITES[@]}"; do
	name="$(basename "$s")"
	echo "=== $name ==="
	if bash "$s"; then
		passed=$((passed + 1))
	else
		failed=$((failed + 1))
		failed_list+=("$name")
	fi
done

echo
echo "Result: $passed passed, $failed failed (of $total)."
if [ "$failed" -gt 0 ]; then
	printf 'Failed:\n' >&2
	printf '  %s\n' "${failed_list[@]}" >&2
	exit 1
fi
