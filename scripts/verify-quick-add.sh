#!/bin/bash
# Post-fix regression: loops the originally-failing scenarios and asserts outcomes.
#  A) keypad-reuse handoff (was: stale 7.97 form / timeout)
#  B) plain quick-add form stays mounted with correct amount (was: form vanished)
#  C) save -> reopen -> transaction appears exactly once (was: duplicate/lost)
ADB="/c/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe"
export MSYS_NO_PATHCONV=1
PKG=com.anonymous.financetracker
PASS=0; FAIL=0

ui_texts() {
  "$ADB" shell rm -f /sdcard/rg.xml
  "$ADB" shell uiautomator dump /sdcard/rg.xml >/dev/null 2>&1
  "$ADB" shell cat /sdcard/rg.xml 2>/dev/null | python -c "
import sys, re
xml = sys.stdin.read()
print('\n'.join(t for t in (re.findall(r'text=\"([^\"]+)\"', xml) + re.findall(r'content-desc=\"([^\"]+)\"', xml)) if t))
"
}

keypad_type() {  # $1 = digits like "9.99"
  local keys
  keys=$(echo "$1" | fold -w1)
  for k in $keys; do
    case "$k" in
      1) "$ADB" shell input tap 134 1823;; 2) "$ADB" shell input tap 404 1823;;
      3) "$ADB" shell input tap 674 1823;; 4) "$ADB" shell input tap 134 1977;;
      5) "$ADB" shell input tap 404 1977;; 6) "$ADB" shell input tap 674 1977;;
      7) "$ADB" shell input tap 134 2131;; 8) "$ADB" shell input tap 404 2131;;
      9) "$ADB" shell input tap 674 2131;; 0) "$ADB" shell input tap 270 2285;;
      .) "$ADB" shell input tap 673 2285;;
    esac
    sleep 0.35
  done
}

form_amount_ok() {  # $1 expected amount string
  ui_texts | grep -qx "$1"
}

select_and_save() {
  "$ADB" shell input tap 424 1254; sleep 1      # 餐饮 (first visible category cell area)
  "$ADB" shell input tap 220 1998; sleep 1      # 广发多利卡 (first account)
  "$ADB" shell input tap 540 2210; sleep 2      # 保存
}

echo "###### C0: cold start"
"$ADB" shell am force-stop $PKG; sleep 1
"$ADB" shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 9

run_case() {
  local name="$1" amount="$2"
  echo "###### $name (amount $amount)"
  "$ADB" shell am start -a $PKG.QUICK_ADD_TX -n $PKG/expo.modules.quickkeypad.QuickKeypadActivity >/dev/null 2>&1
  sleep 2.5
  keypad_type "$amount"
  "$ADB" shell input tap 945 2207; sleep 3
  if form_amount_ok "$amount"; then echo "PASS: form shows $amount"; PASS=$((PASS+1));
  else echo "FAIL: form missing $amount"; FAIL=$((FAIL+1)); fi
  sleep 7
  if form_amount_ok "$amount"; then echo "PASS: form still mounted after 10s"; PASS=$((PASS+1));
  else echo "FAIL: form vanished within 10s"; FAIL=$((FAIL+1)); fi
}

# B) three consecutive quick-adds incl. keypad-reuse interleave
"$ADB" shell input keyevent KEYCODE_HOME; sleep 1.5
run_case "B1 fresh" "9.11"
select_and_save
sleep 2
echo "--- after save, app should be backgrounded ---"
"$ADB" shell input keyevent KEYCODE_HOME; sleep 1.5
run_case "B2 after-reuse" "2.33"   # keypad task still alive? force fresh via am start (reuse path)
select_and_save
sleep 2
"$ADB" shell input keyevent KEYCODE_HOME; sleep 1.5
run_case "B3 third" "5.67"
select_and_save
sleep 2

echo "###### C: reopen and count saved rows"
"$ADB" shell input keyevent KEYCODE_HOME; sleep 1.5
"$ADB" shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 5
UI=$(ui_texts)
for amt in 9.11 2.33 5.67; do
  CNT=$(echo "$UI" | grep -cx -- "-$amt" || true)
  CNT=$(echo "$UI" | grep -cx -- "-$amt")
  if [ "$CNT" -eq 1 ]; then echo "PASS: $amt appears exactly once"; PASS=$((PASS+1));
  else echo "FAIL: $amt count=$CNT (expected 1)"; FAIL=$((FAIL+1)); fi
done

echo "###### RESULT: PASS=$PASS FAIL=$FAIL"
