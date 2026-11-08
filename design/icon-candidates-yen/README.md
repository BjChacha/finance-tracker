# 花哪了 · 预算环 + ¥ 中心（第三轮）

按用户反馈迭代：**保留中心的货币符号**，但把中心元素重新设计好（上一轮的批评是"突兀、单调"）。基底统一为第二轮的**预算环**（一圈 = 一月预算：琥珀 `#F59E0B` 弧 = 已花掉的 72%，浅灰 `#D6D3D1` 轨道 = 剩余），纯白背景、纯扁平、无任何光效。

**先看对比图：[contact-sheet.png](contact-sheet.png)**（主图 / iOS 圆角 / Android 圆形 / Android 方圆 / 48px）

| 候选 | 中心 ¥ 方案 | 一句话 | 气质 |
| --- | --- | --- | --- |
| **4** [r4-yen-ink](r4-yen-ink/) | 墨笔 ¥ | 近黑 `#1C1917` 描边 ¥，与弧相同的圆头端点、比例化的笔画——用环自己的语言重画符号 | 账本 / 墨水，最克制 |
| **5** [r5-yen-coin](r5-yen-coin/) | 硬币 ¥ | 琥珀圆饼（r150）+ 白色镂空 ¥——货币成为一件"物"，圆中套圆 | 硬币 / 资产，最有工艺感 |
| **6** [r6-yen-amber](r6-yen-amber/) | 琥珀 ¥ | 与进度弧同色的粗笔画 ¥——"花掉的就是这些钱"，同色同故事 | 钱包 / 品牌，最醒目 |

三款共用同一套经过**系统字体校准**的 ¥ 字形（宽高比 0.80、双横约占字宽 84%、位于 56%/72% 高度、交汇点 40%），只是笔画粗细、颜色与"载体"不同。

## 精度数据（实测）

| 候选 | ¥ 墨团 | 宽高比 | 包围盒中心 | 距环内缘留白 | 48px |
| --- | --- | --- | --- | --- | --- |
| 4 墨笔 | 231×289 | 0.80 | (511.5, 511.5) | 37px | ¥ 清晰 |
| 5 硬币 | 159×199（盘内） | 0.80 | (511.5, 511.5) | 62px（盘到环） | 环+硬币清晰 |
| 6 琥珀 | 247×309 | 0.80 | (511.5, 511.5) | 25px | ¥ 清晰 |

左右镜像不对称像素 ≤0.005%；全部通过 flat-lint（无渐变/滤镜/阴影）与 iOS/Android 标准校验（[validation.json](validation.json)）。

## 重新生成

```bash
# 参数化生成 12 个 SVG（字形/笔画/颜色可调）
python scripts/icon/gen_yen_candidates.py

# 渲染全部预览 + 掩码 + 48px + 校验
python scripts/icon/build_candidates.py --dir design/icon-candidates-yen \
  --title "花哪了 · 预算环 + ¥ 中心 · 候选" \
  --subtitle "纯白底 / 纯扁平 / 预算环 + 三种中心 ¥ · iOS 1024 + Android adaptive"
```

## 选定后应用

```bash
python scripts/icon/apply_candidate.py r4-yen-ink --dir design/icon-candidates-yen --sync-android
EXPO_PUBLIC_DEEPSEEK_API_KEY=<key> npm run build:apk
```

（候选名换成 r5-yen-coin / r6-yen-amber 即可；背景色会自动写为 `#FFFFFF`。）

## 应用状态（2026-11-08）

**已选定 r5-yen-coin 并应用。** 应用分两层，保证"图标用矢量"：

1. `python scripts/icon/apply_candidate.py r5-yen-coin --dir design/icon-candidates-yen --sync-android`
   写入 `assets/` 六个 PNG（iOS 1024 图标按 App Store 要求必须是 PNG，由矢量 SVG 按 1:1 渲染）、更新 `app.json` / `colors.xml` 背景色为 `#FFFFFF`、重生成 legacy 位图兜底（API < 26 的 `ic_launcher*.webp` 与快捷方式 `add*.png`）。
2. `python scripts/icon/gen_android_vectors.py`
   **Android 8+ 启动器图标全部矢量化**：`drawable/ic_launcher_{foreground,background,monochrome}.xml` 为 VectorDrawable（与 SVG 完全相同的 pathData），`mipmap-anydpi-v26/ic_launcher{,_round}.xml` 与 `add{,_round}.xml` 指向矢量层。已通过 aapt2 compile 与 `gradlew :app:processReleaseResources` 校验。

> 注意：若以后运行 `npx expo prebuild`，android/ 会被重新生成（回到位图自适应图标），需要重跑上面第 2 步恢复矢量层。单色层（Android 13+ 主题图标）采用「进度弧 + ¥」剪影（非硬币负形），因为 VectorDrawable 不支持 mask，且染色后颜色语义消失、弧+¥ 的剪影更可读。

前两轮方案仍在 [../icon-candidates/](../icon-candidates/)（液态玻璃）与 [../icon-candidates-flat/](../icon-candidates-flat/)（无中心极简环），可随时对比或切回。
