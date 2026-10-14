#!/bin/bash
# Exact real-user path for symptom 2:
#   long-press shortcut -> keypad -> HOME -> long-press shortcut again (keypad reused)
#   -> type amount -> OK -> probe interactivity of the resulting sheet.
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
pkg_launcher = 'nexuslauncher' in xml[:2000] or ('App info' in texts and 'Pause app' in texts)
print(f'>>> $name: form={has_form} keypad={has_keypad} amounts={amts} head={texts[:8]}')
"
}

echo "=== fresh app ==="
"$ADB" shell am force-stop com.anonymous.financetracker
sleep 1
"$ADB" shell monkey -p com.anonymous.financetracker -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 9

echo "=== keypad #1 (shortcut intent), then HOME without confirming ==="
"$ADB" shell am start -a com.anonymous.financetracker.QUICK_ADD_TX -n com.anonymous.financetracker/expo.modules.quickkeypad.QuickKeypadActivity >/dev/null 2>&1
sleep 2.5
"$ADB" shell input keyevent KEYCODE_HOME
sleep 1.5

echo "=== keypad #2: same shortcut intent again (reuse path) ==="
"$ADB" shell am start -a com.anonymous.financetracker.QUICK_ADD_TX -n com.anonymous.financetracker/expo.modules.quickkeypad.QuickKeypadActivity >/dev/null 2>&1
sleep 2.5
dump_check "k_reused"

echo "=== type 4.44, OK ==="
"$ADB" shell input tap 134 1977; sleep 0.4   # 4
"$ADB" shell input tap 673 2285; sleep 0.4   # .
"$ADB" shell input tap 134 1977; sleep 0.4   # 4
"$ADB" shell input tap 134 1977; sleep 0.6   # 4
"$ADB" shell input tap 945 2207              # OK

echo "=== probe at +1.5s, +3s, +6.5s (before/around/after 5s timeout) ==="
sleep 1.5; dump_check "t1_1p5s"
sleep 1.5; dump_check "t2_3s"
sleep 3.5; dump_check "t3_6p5s"

echo "=== INTERACTIVITY PROBE: tap scrim ==="
"$ADB" shell input tap 540 300
sleep 2
dump_check "t4_after_scrim"
"$ADB" shell dumpsys window 2>/dev/null | grep mCurrentFocus | head -1
