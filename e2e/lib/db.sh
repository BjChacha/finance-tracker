# shellcheck shell=bash
# Read-only row count via host-side Python.
#
# The device has no sqlite3 binary, so we pull the DB plus its WAL sidecars
# through `run-as` and query on the host. Python applies the sibling -wal/-shm
# automatically, so WAL-mode writes that have not been checkpointed still count.
# Requires a debuggable build (expo debug build is debuggable by default).

_E2E_TMP_DIR="${E2E_TMP_DIR:-/tmp/ft-e2e}"

_db_pull() {
	mkdir -p "$_E2E_TMP_DIR"
	adb exec-out run-as "$APP_ID" cat "files/SQLite/$DB_NAME" > "$_E2E_TMP_DIR/$DB_NAME" 2>/dev/null
	adb exec-out run-as "$APP_ID" cat "files/SQLite/$DB_NAME-wal" > "$_E2E_TMP_DIR/$DB_NAME-wal" 2>/dev/null
	adb exec-out run-as "$APP_ID" cat "files/SQLite/$DB_NAME-shm" > "$_E2E_TMP_DIR/$DB_NAME-shm" 2>/dev/null
}

db_tx_count() {
	_db_pull || return 1
	local db_unix="$_E2E_TMP_DIR/$DB_NAME" db_win
	# Windows Python cannot open MSYS2 paths (/tmp/...); cygpath converts.
	# Falls back to the unix path on non-MSYS2 hosts (Linux/mac Python accepts it).
	db_win="$(cygpath -w "$db_unix" 2>/dev/null || echo "$db_unix")"
	py -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('SELECT COUNT(*) FROM transactions').fetchone()[0])" "$db_win" 2>/dev/null |
		tr -d '\r'
}
