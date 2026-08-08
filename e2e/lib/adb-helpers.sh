# shellcheck shell=bash
# UI driver primitives for the quick-add smoke suite.
#
# Location strategy: the native keypad exposes stable resource-ids
# (btn0..9/btnDot/btnOk/btnC/btnBack/amountText/mask); RN form elements are
# located by their visible text (保存/支出/记一笔/...). Every helper returns
# non-zero on failure so callers turn that into an explicit FAIL.

# Dump the current window as XML, one node tag per line so grep matches a
# single <node> rather than the whole document.
_dump_ui() {
	adb shell uiautomator dump /sdcard/ui_dump.xml >/dev/null 2>&1 || true
	adb shell cat /sdcard/ui_dump.xml 2>/dev/null | tr -d '\r' | sed 's/>/>\n/g'
}

# Parse "bounds=[x1,y1][x2,y2]" from a node line and echo "cx cy".
_center_from_bounds() {
	local b nums
	b="$(printf '%s' "$1" | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1)"
	[ -n "$b" ] || return 1
	nums="$(printf '%s' "$b" | grep -oE '[0-9]+' | paste -sd ' ')"
	# shellcheck disable=SC2086
	set -- $nums
	[ $# -ge 4 ] || return 1
	echo $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}

# Echo "cx cy" for the first node whose resource-id ends with :id/<id>.
_bounds_of_id() {
	local id="$1" line
	line="$(_dump_ui | grep ":id/${id}\"" | head -1)"
	[ -n "$line" ] || return 1
	_center_from_bounds "$line"
}

# Echo "cx cy" for the first node whose text attribute equals <text>.
_bounds_of_text() {
	local text="$1" line
	line="$(_dump_ui | grep -F "text=\"$text\"" | head -1)"
	[ -n "$line" ] || return 1
	_center_from_bounds "$line"
}

tap_by_id() {
	local c
	c="$(_bounds_of_id "$1")" || return 1
	# shellcheck disable=SC2086
	adb shell input tap $c
}

tap_by_text() {
	local c
	c="$(_bounds_of_text "$1")" || return 1
	# shellcheck disable=SC2086
	adb shell input tap $c
}

visible_id() { _bounds_of_id "$1" >/dev/null 2>&1; }
visible_text() { _bounds_of_text "$1" >/dev/null 2>&1; }

# Poll until <id> appears (returns 0) or the timeout elapses (returns 1).
wait_for_id() {
	local id="$1" i max
	max=$(( ${2:-${WAIT_TIMEOUT_SEC}} * 2 ))
	for ((i = 0; i < max; i++)); do
		_bounds_of_id "$id" >/dev/null 2>&1 && return 0
		sleep "${POLL_INTERVAL_SEC}"
	done
	return 1
}

# Poll until <id> disappears (returns 0) or the timeout elapses (returns 1).
wait_gone_id() {
	local id="$1" i max
	max=$(( ${2:-${WAIT_TIMEOUT_SEC}} * 2 ))
	for ((i = 0; i < max; i++)); do
		_bounds_of_id "$id" >/dev/null 2>&1 || return 0
		sleep "${POLL_INTERVAL_SEC}"
	done
	return 1
}

wait_for_text() {
	local text="$1" i max
	max=$(( ${2:-${WAIT_TIMEOUT_SEC}} * 2 ))
	for ((i = 0; i < max; i++)); do
		_bounds_of_text "$text" >/dev/null 2>&1 && return 0
		sleep "${POLL_INTERVAL_SEC}"
	done
	return 1
}

# --- launch / lifecycle ------------------------------------------------------

am_start_quickadd() { adb shell am start -n "$APP_ID/$KEYPAD_ACTIVITY" >/dev/null 2>&1; }
am_start_main() { adb shell am start -n "$APP_ID/$MAIN_ACTIVITY" >/dev/null 2>&1; }
deep_link() { adb shell am start -W -a android.intent.action.VIEW -d "${DEEP_LINK_SCHEME}://$1" >/dev/null 2>&1; }
go_home() { adb shell input keyevent KEYCODE_HOME >/dev/null 2>&1; }
press_back() { adb shell input keyevent KEYCODE_BACK >/dev/null 2>&1; }
force_stop_app() { adb shell am force-stop "$APP_ID" >/dev/null 2>&1; }

app_alive() { [ -n "$(adb shell pidof "$APP_ID" 2>/dev/null | tr -d '\r')" ]; }

# Package currently holding window focus (empty when the launcher is shown).
# Package currently holding window focus (empty on the launcher or mid-transition).
# Handles both legacy "mCurrentFocus=com.x/.Y" and newer Android 14+ /
# MIUI "mCurrentFocus=Window{.. u0 com.x/com.x.Y}" shapes.
current_focus_pkg() {
	local line
	line="$(adb shell dumpsys window 2>/dev/null | tr -d '\r' | grep 'mCurrentFocus=' | head -1)"
	# Transient / non-app focus states carry no package to compare against.
	case "$line" in
		*'null'*|*'pip'*|*'InputMethod'*|*'NotificationShade'*|*'Shell'*) return 0 ;;
	esac
	printf '%s' "$line" |
		grep -oE '[a-z0-9_]+(\.[a-z0-9_]+)+/[a-zA-Z0-9_.]+' |
		head -1 |
		cut -d/ -f1
}

# Wait until the app is no longer in the foreground (saved/cancel exits home).
wait_off_app() {
	local i pkg
	for ((i = 0; i < 40; i++)); do
		pkg="$(current_focus_pkg)"
		if [ -n "$pkg" ] && [ "$pkg" != "$APP_ID" ]; then return 0; fi
		sleep "${POLL_INTERVAL_SEC}"
	done
	return 1
}
