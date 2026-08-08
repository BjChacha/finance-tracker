# shellcheck shell=bash
# Device discovery and environment setup shared by every suite.
#
# MSYS2 mangles arguments that look like paths (e.g. the URI passed to
# `adb shell am start -d finance-tracker://...`); neutralise it so the
# intent data survives intact. Safe because we pass no POSIX paths to adb.

export MSYS2_ARG_CONV_EXCL="*"
export MSYS_NO_PATHCONV=1

# Locate adb on PATH, or add the Android SDK platform-tools dir.
_resolve_adb() {
	if command -v adb >/dev/null 2>&1; then return 0; fi
	local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
	if [ -z "$sdk" ] && [ -n "$LOCALAPPDATA" ]; then
		sdk="$LOCALAPPDATA/Android/Sdk"
	fi
	local dir="$sdk/platform-tools"
	if [ -d "$dir" ]; then
		# cygpath converts a Windows path (C:\...\Sdk) to MSYS2 form (/c/.../Sdk).
		local unix_dir
		unix_dir="$(cygpath -u "$dir" 2>/dev/null || echo "$dir")"
		export PATH="$PATH:$unix_dir"
	fi
}

# Every adb call routes through here so $DEVICE_SERIAL is applied uniformly.
adb() {
	_resolve_adb
	if [ -n "${DEVICE_SERIAL:-}" ]; then
		command adb -s "$DEVICE_SERIAL" "$@"
	else
		command adb "$@"
	fi
}

# Pick the first online device if the caller did not pin DEVICE_SERIAL.
_pick_device() {
	if [ -n "${DEVICE_SERIAL:-}" ]; then return 0; fi
	_resolve_adb
	local serial
	serial="$(command adb devices 2>/dev/null | awk '/\t(device|emulator)/{print $1; exit}')"
	if [ -z "$serial" ]; then
		echo "No online device found. Run 'adb devices' to verify." >&2
		return 1
	fi
	export DEVICE_SERIAL="$serial"
}

# A UTF-8 locale is required so grep can match Chinese labels (保存/记一笔).
_utf8_locale() {
	local l
	for l in en_US.UTF-8 C.UTF-8 en_US.utf8 UTF-8; do
		if locale -a 2>/dev/null | grep -qiFx "$l"; then
			export LC_ALL="$l"
			return 0
		fi
	done
	return 0
}

_is_emulator() {
	[ -n "$(adb shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r')" ]
}

wake_unlock() {
	adb shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
	# Swipe up to dismiss a generic lock screen; no-op if already unlocked.
	adb shell input swipe 540 1600 540 400 200 >/dev/null 2>&1 || true
}

disable_animations_if_emulator() {
	if _is_emulator; then
		adb shell settings put global window_animation_scale 0 >/dev/null 2>&1 || true
		adb shell settings put global transition_animation_scale 0 >/dev/null 2>&1 || true
		adb shell settings put global animator_duration_scale 0 >/dev/null 2>&1 || true
	fi
}

device_setup() {
	_resolve_adb
	_pick_device || return 1
	_utf8_locale
	disable_animations_if_emulator
	wake_unlock
}
