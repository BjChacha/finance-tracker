#!/bin/bash
# Controlled experiment: does the quick-add form self-dismiss after OK without any input?
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
has_form = ('记一笔' in texts) or ('3.33' in texts) or ('保存' in texts)
marker = [t for t in texts if t in ('记一笔','保存','3.33','总览')]
print(f'>>> $name: form_visible={has_form} markers={marker[:6]} total_texts={len(texts)}')
"
}

echo "=== start keypad ==="
"$ADB" shell am start -a com.anonymous.financetracker.QUICK_ADD_TX -n com.anonymous.financetracker/expo.modules.quickkeypad.QuickKeypadActivity >/dev/null 2>&1
sleep 2.5

echo "=== type 3 . 3 3 ==="
"$ADB" shell input tap 674 1823; sleep 0.4   # 3
"$ADB" shell input tap 673 2285; sleep 0.4   # .
"$ADB" shell input tap 674 1823; sleep 0.4   # 3
"$ADB" shell input tap 674 1823; sleep 0.6   # 3
dump_check "k1"

echo "=== tap OK ==="
"$ADB" shell input tap 945 2207
sleep 1;   dump_check "f1"
sleep 1.5; dump_check "f2"
sleep 2.5; dump_check "f3"
sleep 3;   dump_check "f4"
sleep 4;   dump_check "f5"
"$ADB" shell dumpsys window 2>/dev/null | grep mCurrentFocus | head -1
