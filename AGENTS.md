# Expo HAS CHANGED

Read the exact versioned docs at <https://docs.expo.dev/versions/v57.0.0/> before writing any code.

# 构建 (release)

一句话记账走线上 DeepSeek API,key 通过构建时环境变量内联进 JS bundle(`EXPO_PUBLIC_DEEPSEEK_API_KEY`,读取点在 `src/features/transactions/natural-language/deepseek.ts`)。`.env*` 不入库,构建前必须显式导出:

```bash
EXPO_PUBLIC_DEEPSEEK_API_KEY=<key> npm run build:apk
adb install -r -d build/release/finance-tracker-0.0.1.apk
```

`npm run build:apk`(`scripts/build-apk.mjs`)会先校验环境变量、删除 `android/app/build/generated/assets/react` 强制 Metro 重跑,再断言产物 bundle 里确实含 key。原因:Gradle 不把环境变量算作 task input,JS 未变时会复用旧 bundle,导致 APK 静默丢失 key。

缺 key 不会崩溃:识别会提示"识别服务未配置",仍可手动记账;若只需验证其他功能,可用 `ALLOW_MISSING_DEEPSEEK_KEY=1` 跳过。key 内联在 bundle 中可被反编译提取,分发前应改为服务端代理。

# 发布 (GitHub Release + 应用内自更新)

发布一条命令完成版本 bump → 构建 → git commit/tag/push → 建 GitHub Release → 上传 APK:

```bash
EXPO_PUBLIC_DEEPSEEK_API_KEY=<key> GH_TOKEN=<token> npm run release
# 可选: -- --version 0.1.0 --notes "..." --prerelease --skip-bump --dry-run
```

- `GH_TOKEN` 需 repo 权限(github.com/settings/tokens);要求 git 工作区干净,发布 commit 只含版本号变更(app.json/package.json,versionCode 随发布 +1)。
- 幂等重跑:Release/同名 asset 已存在时自动复用/替换;构建失败时不会碰 git。
- `--prerelease` 发测试版:prerelease 不会被 `/releases/latest` 返回,应用内更新检查会忽略它,适合发版前全链路验证。

应用内自更新(`src/features/update/`):启动后台静默查 GitHub `releases/latest`(6h 缓存,失败不打扰),有新版时「个人」页顶部弹卡片;「个人 → 检查更新」页展示 changelog、下载 APK(带进度)并调系统安装器覆盖安装。Android 8+ 首次点"安装"需授予「安装未知应用」权限(HyperOS 有二次确认),安装失败时页面提供「去授权」按钮。覆盖安装要求 debug keystore 不变。

# 真机调试 (adb)

允许且鼓励使用 adb 对真机进行调试、复现与性能观测。当前已连接设备:红米 M098FE (HyperOS 2),serial `57721e63`。

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

## HyperOS 触摸注入 (input 被拦时)

HyperOS 未开「USB 调试(安全设置)」时,`input tap/swipe`、`sendevent` 均被 SecurityException 拦截。**monkey 脚本模式可用**:

- 脚本格式:`DispatchPointer(downtime,eventTime,action,x,y,pressure,size,metaState,xPrecision,yPrecision,device,edgeFlags)` —— 必须恰好 12 个参数,少一个会静默注入 0 事件;action 0=down 1=up 2=move,`UserWait(ms)` 插入延时。
- 运行:`adb push x.mks /data/local/tmp/ && adb shell monkey -f /data/local/tmp/x.mks 1`。
- 现成助手:`debug/verify/mtap.py`(单击)与 `debug/verify/mswipe.py`(滑动),直接 `python mtap.py <x> <y>`。
- 定位控件坐标用 `uiautomator dump` + `adb pull`(记得 `export MSYS_NO_PATHCONV=1`)。

## 动画验证方法 (screenrecord 逐帧)

`screenrecord` 变帧率:静止段不编码,动画开始才出帧,首帧 pts 即动画近似起点。
流程:设备上后台起录 → monkey tap 触发 → `adb pull` mp4 → `ffmpeg -i in.mp4 -vsync 0 f_%04d.png` 逐帧提取(pts 用 `ffprobe -show_entries frame=pts_time`)→ PIL 按帧追踪特征(亮文本行 y、彩色图标质心 x 等)。
现成分析脚本:`debug/verify/shot.py`(整页 ASCII 渲染)、`debug/verify/donut_check.py`(环形图标签视口检查)。

# 性能调测 (smartperfetto / perfetto)

性能问题必须先用 trace/数据定位根因,禁止凭推测下结论。

- 本设备 (MIUI) 可用 smartperfetto (基于 perfetto)。抓 trace:
  `adb shell perfetto -o /data/misc/perfetto-traces/trace.pb -t <秒> sched freq idle am wm view gfx`,再 `adb pull`。
- 轻量替代用 atrace:`adb shell atrace -t <秒> -b 32768 view sched am wm gfx > trace.txt`。
- 代码里已有的 `android.os.Trace` 埋点 (如 `QuickAddHandoffController` 的 `QuickAdd/ConfirmToFirstVisible`、`QuickAdd/MainActivityHandoff` 等 async section) 会在 perfetto/atrace 里显示,优先复用它们读时序,不要重复埋点。
- trace 用 <https://ui.perfetto.dev> 或 smartperfetto 打开分析。
- 放慢系统动画便于观察过渡:`adb shell settings put global window_animation_scale 5` (以及 `transition_animation_scale`、`animator_duration_scale`),调测完恢复为 `1.0`。
- 注意 React Native 的 reanimated/worklet 动画不受系统 `animator_duration_scale` 影响,放慢动画只对系统级 Activity 过渡有效。
