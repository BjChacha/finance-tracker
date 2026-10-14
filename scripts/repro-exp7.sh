#!/bin/bash
# Full-tree verification: after the form "vanishes" to main screen,
# is the quick-add route still MOUNTED (invisible card + live scrim)?
ADB="/c/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe"
export MSYS_NO_PATHCONV=1

full_dump() {
  local name="$1"
  "$ADB" shell rm -f "/sdcard/$name.xml"
  "$ADB" shell uiautomator dump "/sdcard/$name.xml" >/dev/null 2>&1
  "$ADB" shell cat "/sdcard/$name.xml" 2>/dev/null | python -c "
import sys, re
xml = sys.stdin.read()
texts = [t for t in (re.findall(r'text=\"([^\"]+)\"', xml) + re.findall(r'content-desc=\"([^\"]+)\"', xml)) if t]
form_markers = [t for t in texts if t in ('记一笔','保存') or re.match(r'^[0-9]+\\.[0-9]{2}$', t)]
close_btns = len(re.findall(r'content-desc=\"关闭\"', xml))
print(f'>>> $name: total={len(texts)} form_markers={form_markers} close_buttons={close_btns}')
print(f'    head={texts[:6]}')
"
}

echo "=== fresh app ==="
"$ADB" shell am force-stop com.anonymous.financetracker
sleep 1
"$ADB" shell monkey -p com.anonymous.financetracker -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 9

echo "=== keypad, type 6.66, OK ==="
"$ADB" shell am start -a com.anonymous.financetracker.QUICK_ADD_TX -n com.anonymous.financetracker/expo.modules.quickkeypad.QuickKeypadActivity >/dev/null 2>&1
sleep 2.5
"$ADB" shell input tap 674 2131; sleep 0.4   # 6... wait btn6=(674,1977). use 6,.,6,6
"$ADB" shell input tap 674 1977; sleep 0.4
"$ADB" shell input tap 673 2285; sleep 0.4   # .
"$ADB" shell input tap 674 1977; sleep 0.4
"$ADB" shell input tap 674 1977; sleep 0.6
"$ADB" shell input tap 945 2207; sleep 2     # OK
full_dump "v1_2s"
sleep 3
full_dump "v2_5s"
sleep 4
full_dump "v3_9s"
sleep 6
full_dump "v4_15s"
