#!/bin/bash
# Post-fix: replay the exact originally-failing scenarios.
ADB="/c/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe"
export MSYS_NO_PATHCONV=1
PKG=com.anonymous.financetracker

ui_texts() {
  "$ADB" shell rm -f /sdcard/rg2.xml
  "$ADB" shell uiautomator dump /sdcard/rg2.xml >/dev/null 2>&1
  "$ADB" shell cat /sdcard/rg2.xml 2>/dev/null | python -c "
import sys, re
xml = sys.stdin.read()
print('\n'.join(t for t in (re.findall(r'text=\"([^\"]+)\"', xml) + re.findall(r'content-desc=\"([^\"]+)\"', xml)) if t))
"
}

echo "###### S1: keypad reuse race (was timeout + stale 7.97)"
"$ADB" shell am force-stop $PKG; sleep 1
"$ADB" shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 9
# keypad #1, leave without confirm
"$ADB" shell am start -a $PKG.QUICK_ADD_TX -n $PKG/expo.modules.quickkeypad.QuickKeypadActivity >/dev/null 2>&1; sleep 2.5
"$ADB" shell input keyevent KEYCODE_HOME; sleep 1.5
# keypad #2 via same intent (reuse path: START_DELIVERED_TO_TOP)
"$ADB" shell am start -a $PKG.QUICK_ADD_TX -n $PKG/expo.modules.quickkeypad.QuickKeypadActivity >/dev/null 2>&1; sleep 2.5
# type 8.88: 8=(404,2131) .=(673,2285) 8 8
"$ADB" shell input tap 404 2131; sleep 0.35
"$ADB" shell input tap 673 2285; sleep 0.35
"$ADB" shell input tap 404 2131; sleep 0.35
"$ADB" shell input tap 404 2131; sleep 0.5
"$ADB" shell input tap 945 2207; sleep 3.5
T=$(ui_texts)
if echo "$T" | grep -qx "8.88"; then echo "PASS: form shows 8.88 (no stale amount)"; else echo "FAIL: no 8.88 on form"; echo "$T" | head -6; fi
sleep 3
T=$(ui_texts)
if echo "$T" | grep -qx "8.88"; then echo "PASS: form still mounted"; else echo "FAIL: form vanished"; fi

echo "###### S2: HOME during open form -> icon reopen (was 7.97 revival / trap)"
"$ADB" shell input keyevent KEYCODE_HOME; sleep 2
"$ADB" shell input tap 910 1994; sleep 4
T=$(ui_texts)
if echo "$T" | grep -qx "8.88"; then echo "INFO: form restored with 8.88 (correct amount)"; else echo "INFO: form not present after icon reopen"; fi

echo "###### S3: interactivity probe on whatever is shown (back must not trap)"
"$ADB" shell input keyevent KEYCODE_BACK; sleep 2
FOCUS=$("$ADB" shell dumpsys window 2>/dev/null | grep mCurrentFocus | head -1)
echo "focus after BACK: $FOCUS"
if echo "$FOCUS" | grep -q "financetracker"; then
  echo "INFO: app still focused (form handles back -> exit)"
else
  echo "INFO: app backgrounded by back (expected when form absent)"
fi

echo "###### handoff phase summary (any timeout = regression)"
grep -E "QuickAddPerf" /tmp/qa-repro/logcat-postfix2.txt | grep -c "phase=timeout" || echo "0 timeouts"
grep -E "QuickAddPerf" /tmp/qa-repro/logcat-postfix2.txt | tail -6
