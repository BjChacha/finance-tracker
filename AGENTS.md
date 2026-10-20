# Expo HAS CHANGED

Read the exact versioned docs at <https://docs.expo.dev/versions/v57.0.0/> before writing any code.

# 构建 (release)

本地构建是日常改动的默认验证通道,不 bump 版本、不碰 git/GitHub。改动后的默认验证为 `npm run typecheck` + `npm test`;需要真机验证时构建 APK 并 `adb install -r -d` 覆盖安装(versionCode 不变,`-d` 允许;同一 debug keystore 签名即可覆盖)。

一句话记账走线上 DeepSeek API,key 通过构建时环境变量内联进 JS bundle(`EXPO_PUBLIC_DEEPSEEK_API_KEY`,读取点在 `src/features/transactions/natural-language/deepseek.ts`)。`.env*` 不入库,构建前必须显式导出:

```bash
EXPO_PUBLIC_DEEPSEEK_API_KEY=<key> npm run build:apk
adb install -r -d build/release/finance-tracker-0.0.1.apk
```

`npm run build:apk`(`scripts/build-apk.mjs`)会先校验环境变量、删除 `android/app/build/generated/assets/react` 强制 Metro 重跑,再断言产物 bundle 里确实含 key。原因:Gradle 不把环境变量算作 task input,JS 未变时会复用旧 bundle,导致 APK 静默丢失 key。

缺 key 不会崩溃:识别会提示"识别服务未配置",仍可手动记账;若只需验证其他功能,可用 `ALLOW_MISSING_DEEPSEEK_KEY=1` 跳过。key 内联在 bundle 中可被反编译提取,分发前应改为服务端代理。

# 发布 (GitHub Release + 应用内自更新)

**发版是用户手动触发的显式动作**:AI 改动完成后不得自动执行 `npm run release`,也不要主动改 app.json/package.json 的版本号——版本与 versionCode 只随发布变更。仅当用户明确说"发版/release/发布新版本"时才走本流程。

发布一条命令完成版本 bump → 构建 → git commit/tag/push → 建 GitHub Release → 上传 APK:

```bash
EXPO_PUBLIC_DEEPSEEK_API_KEY=<key> GH_TOKEN=<token> npm run release
# 可选: -- --version 0.1.0 --notes "..." --prerelease --skip-bump --dry-run
```

两个凭据都可存到 `~/.finance-tracker/credentials.json`(`{"ghToken":"...","deepseekApiKey":"..."}`),`scripts/credentials.mjs` 会读它——之后直接 `npm run release` 即可,环境变量仍然优先。该文件故意放在仓库外:仓库路径下有 `*.env.*` 拦截规则,也避免明文凭据进入 git。

- `GH_TOKEN` 需 repo 权限(github.com/settings/tokens);要求 git 工作区干净,发布 commit 只含版本号变更(app.json/package.json,versionCode 随发布 +1)。
- 幂等重跑:Release/同名 asset 已存在时自动复用/替换;构建失败时不会碰 git。
- `--prerelease` 发测试版:prerelease 不会被 `/releases/latest` 返回,应用内更新检查会忽略它,适合发版前全链路验证。

应用内自更新(`src/features/update/`):启动后台静默查 GitHub `releases/latest`(6h 缓存,失败不打扰),有新版时「个人」页顶部弹卡片;「个人 → 检查更新」页展示 changelog、下载 APK(带进度)并调系统安装器覆盖安装。覆盖安装要求 debug keystore 不变。

## 侧载拦截(真机安装失败的真正原因)

本机 HyperOS 会在系统安装器里连拦两道,`installApk` 的 Intent 本身不会报错,所以应用内看不到任何失败提示——表现就是「更新失败了」:

1. 「未查询到此应用的 ICP 备案信息」页:**「退出」是蓝色主按钮**、「继续安装」是次要按钮,顺手一点就取消。
2. 「安全提醒:未经小米安全审核」页:必须先勾选「已了解此应用未经安全检测」,「继续更新」才从灰变可点。

应用已尽量降低摩擦(见 `app/update.tsx`):页面常驻这三步引导;安装包缓存在 `cache/finance-tracker-<version>.apk`,返回页面时 `findCachedApk` 命中就直接进「安装更新」(命中需字节数与 release 一致,避免拿半截包去装),不必重下 58MB;回前台时若版本仍未变则提示「这次没有装上」;安装失败原因会直接显示在页面上。

## api.github.com 403(检查更新失败的真因)

本机开着按应用分流的代理(157 条 `ip rule ... uidrange N lookup 1032` 把 app 流量导入 `tun0`),本应用就在分流名单里。结果是 **app 的所有请求从代理节点出口出去**,而 api.github.com 对数据中心 IP 回 `403 Request forbidden by administrative rules`;`adb shell` 的 curl(uid 2000)不走隧道所以是 200——**不要用 shell 能通就否定用户报障**。

排查手法:`ip rule show | grep <appuid>` 看是否被导入 `tun0`,`ip route get <ip>` 看出口,`adb shell curl` 与 app 行为不一致就查分流。

`checker.ts` 因此保留双路径:先 REST API(有 changelog 与体积);被拦时回退到 `github.com/<repo>/releases/latest` 的 302 最终地址取 tag,并按发布脚本的 `apkAssetName` 约定拼下载地址(此时无 changelog、`apkSize` 为 0)。两条都失败才报错。

用 adb 验证更新链路时不经过这些拦截,`adb install -r -d` 直接成功——所以真机问题不要用 adb 是否装得上去否定用户报障。

# 消费报告 (自动生成)

报告在周期**结束后**生成:上一个已结束的 月/季/年,由 `ReportsRunner`(`src/features/reports/ReportsRunner.tsx`)在启动后 12s 或回前台时触发 `runAutoReportsIfNeeded()`(`auto-generate.ts`)。规则:

- 只处理最近一个已结束周期,每类最多 1 份;**不回填更早历史**(控制调用费用)。
- 该周期无交易则跳过;已存在同契约版本的报告则跳过。
- 失败(缺 key/断网)退避 6 小时;同一天最多成功跑一次;并发互斥。
- 持久化在 `reports` 表,`analysis_version` 标识契约版本;契约升级后旧行视为缺失并重生成。
- 查看一律读存档,不调用模型;「重新生成」是显式计费动作。
- 契约与提示词:`src/features/reports/analysis-contract.ts`、`labels.ts` 的 `systemPrompt`;渲染在 `components/report-detail.tsx`。

# 工具链注记

`.pi-lens.json` 禁用了 kotlin LSP 并忽略 Android 原生目录:该 LSP 在本机没有 Android/Expo classpath,会对所有 `.kt` 报假的 `Unresolved reference: android/kotlin/androidx`(未改动的文件同样报几百条)。Android/Kotlin 的正确性以 `cd android && ./gradlew :quick-keypad:compileReleaseKotlin`(模块级)或完整 `npm run build:apk` 为准。

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
