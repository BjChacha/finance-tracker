# shellcheck shell=bash
# Application identifiers and tunables for the quick-add smoke suite.
# Edit only if the package name or DB changes.

APP_ID="com.anonymous.financetracker"
KEYPAD_ACTIVITY="expo.modules.quickkeypad.QuickKeypadActivity"
MAIN_ACTIVITY="com.anonymous.financetracker.MainActivity"
DB_NAME="finance.db"
DEEP_LINK_SCHEME="finance-tracker"

# Polling budget for waiting on UI elements (seconds).
WAIT_TIMEOUT_SEC="${WAIT_TIMEOUT_SEC:-15}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-0.5}"

# Target device serial (emulator or real). Empty => auto-pick first online device.
DEVICE_SERIAL="${DEVICE_SERIAL:-}"
