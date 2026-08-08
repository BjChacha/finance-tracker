# Expo HAS CHANGED

Read the exact versioned docs at <https://docs.expo.dev/versions/v57.0.0/> before writing any code.

# 真机调试 (adb)

允许且鼓励使用 adb 对真机进行调试、复现与性能观测。当前已连接设备:红米 marble (23049RAD8C),serial `946d37c0`。

## adb 路径

adb 不在 PATH 中,需用完整路径:

- MSYS2 bash: `/c/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe`
- Windows: `C:\Users\bjcha\AppData\Local\Android\Sdk\platform-tools\adb.exe`

脚本里建议 `ADB="/c/Users/bjcha/AppData/Local/Android/Sdk/platform-tools/adb.exe"`。

## adb 使用准则 (Windows / MSYS2 踩过的坑)

- 截图必须用 `adb exec-out screencap -p > file.png`(`exec-out` 二进制安全)。不要用 `adb shell screencap -p > file`,Windows shell 的 CRLF 转换会损坏 PNG。
- 命令里出现设备路径 (`/sdcard/...`) 时,先 `export MSYS_NO_PATHCONV=1`,否则 MSYS2 会把它转成 Windows 路径导致 "No such file"。
- `screenrecord` 是变帧率录制:画面静止时不编码、Activity/Surface 切换瞬间会丢帧。需要逐帧不丢时改用 `screencap` 连拍 (burst),或临时放慢系统动画 (见下) 再录。
- 较长的命令序列写进 `.sh` 脚本文件执行,避免内联命令触发长度限制或引号转义问题。
- 临时改系统设置 (动画缩放等) 后,务必用 `trap` 或显式命令恢复原值。

# 性能调测 (smartperfetto / perfetto)

性能问题必须先用 trace/数据定位根因,禁止凭推测下结论。

- 本设备 (MIUI) 可用 smartperfetto (基于 perfetto)。抓 trace:
  `adb shell perfetto -o /data/misc/perfetto-traces/trace.pb -t <秒> sched freq idle am wm view gfx`,再 `adb pull`。
- 轻量替代用 atrace:`adb shell atrace -t <秒> -b 32768 view sched am wm gfx > trace.txt`。
- 代码里已有的 `android.os.Trace` 埋点 (如 `QuickAddHandoffController` 的 `QuickAdd/ConfirmToFirstVisible`、`QuickAdd/MainActivityHandoff` 等 async section) 会在 perfetto/atrace 里显示,优先复用它们读时序,不要重复埋点。
- trace 用 <https://ui.perfetto.dev> 或 smartperfetto 打开分析。
- 放慢系统动画便于观察过渡:`adb shell settings put global window_animation_scale 5` (以及 `transition_animation_scale`、`animator_duration_scale`),调测完恢复为 `1.0`。
- 注意 React Native 的 reanimated/worklet 动画不受系统 `animator_duration_scale` 影响,放慢动画只对系统级 Activity 过渡有效。
