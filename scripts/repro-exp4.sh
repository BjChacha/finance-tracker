#!/bin/bash
# Interactivity probe on the possibly-stuck sheet (symptom 2).
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
print(f'>>> $name: form_mounted={has_form} head={texts[:10]}')
"
}

dump_check "p0"
echo "=== tap scrim (top area 540,300) ==="
"$ADB" shell input tap 540 300
sleep 2
dump_check "p1"
echo "=== press BACK ==="
"$ADB" shell input keyevent KEYCODE_BACK
sleep 2
"$ADB" shell dumpsys window 2>/dev/null | grep mCurrentFocus | head -1
dump_check "p2"
echo "=== tap X header (70,507) ==="
"$ADB" shell input tap 70 507
sleep 2
dump_check "p3"
"$ADB" shell dumpsys window 2>/dev/null | grep mCurrentFocus | head -1
