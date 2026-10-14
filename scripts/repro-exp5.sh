#!/bin/bash
# Deterministic repro: keypad REUSE (second shortcut entry while keypad task alive).
# Real-world user path: open shortcut keypad, back/home out, press shortcut again.
ADB="/c/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe"
export MSYS_NO_PATHCONV=1

dump_check() {
  local name="$1"
  "$ADB" shell rm -f "/sdcard/$name.xml"
  "$ADB" shell uiautomator dump "/sdcard/$name.xml" >/dev/null 2>&1
  "$ADB" shell cat "/sdcard/$name.xml" 2>/dev/null | python -c "
import sys, re
xml = sys.stdin.read()
texts = [t for t in (re.findall(r'text=\"([^\"]+)\"', xml) + re.findall(r'content-desc=\"([^\"]+)\"', xml)) if t]
amts = [t for t in texts if re.match(r'^[0-9]+\\.[0-9]{2}$', t)]
has_form = ('记一笔' in texts) or ('保存' in texts)
has_keypad = any('OK' == t for t in texts)
print(f'>>> $name: form={has_form} keypad={has_keypad} amounts={amts} head={texts[:8]}')
"
}

echo "=== step 1: fresh app to main screen ==="
"$ADB" shell am force-stop com.anonymous.financetracker
sleep 1
"$ADB" shell monkey -p com.anonymous.financetracker -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 9

echo "=== step 2: keypad #1 (fresh), type 1.11, OK ==="
"$ADB" shell am start -a com.anonymous.financetracker.QUICK_ADD_TX -n com.anonymous.financetracker/expo.modules.quickkeypad.QuickKeypadActivity >/dev/null 2>&1
sleep 2.5
"$ADB" shell input tap 674 1823; sleep 0.4   # 1
"$ADB" shell input tap 673 2285; sleep 0.4   # .
"$ADB" shell input tap 674 1823; sleep 0.4   # 1
"$ADB" shell input tap 674 1823; sleep 0.6   # 1
"$ADB" shell input tap 945 2207; sleep 3     # OK
dump_check "s2"

echo "=== step 3: HOME, then keypad #2 (reuse via shortcut intent) ==="
"$ADB" shell input keyevent KEYCODE_HOME
sleep 1.5
"$ADB" shell am start -a com.anonymous.financetracker.QUICK_ADD_TX -n com.anonymous.financetracker/expo.modules.quickkeypad.QuickKeypadActivity >/dev/null 2>&1
sleep 2.5
dump_check "s3_keypad"

echo "=== step 4: type 2.22, OK ==="
"$ADB" shell input tap 404 1823; sleep 0.4   # 2
"$ADB" shell input tap 673 2285; sleep 0.4   # .
"$ADB" shell input tap 404 1823; sleep 0.4   # 2
"$ADB" shell input tap 404 1823; sleep 0.6   # 2
"$ADB" shell input tap 945 2207; sleep 3     # OK
dump_check "s4"
sleep 3
dump_check "s5"
echo "=== handoff log ==="
grep -E "QuickAddPerf" /tmp/qa-repro/logcat3.txt | tail -10
