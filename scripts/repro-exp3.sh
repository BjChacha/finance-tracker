#!/bin/bash
# HOME while quick-add form is open, then reopen via launcher icon.
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
has_form = ('记一笔' in texts) or ('保存' in texts)
print(f'>>> $name: form_visible={has_form} head={texts[:8]}')
"
}

echo "=== press HOME (form open) ==="
"$ADB" shell input keyevent KEYCODE_HOME
sleep 2
"$ADB" shell dumpsys window 2>/dev/null | grep mCurrentFocus | head -1

echo "=== reopen via icon tap ==="
"$ADB" shell input tap 910 1994
sleep 3
"$ADB" shell dumpsys window 2>/dev/null | grep mCurrentFocus | head -1
dump_check "r1"
sleep 2
dump_check "r2"
