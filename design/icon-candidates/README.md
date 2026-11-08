# 花哪了 · 应用图标候选

三种「扁平化 + 液态玻璃」风格的应用图标，均为纯矢量 SVG，符合 iOS / Android 自适应图标规范。

**先看对比图：[contact-sheet.png](contact-sheet.png)**（主图 / iOS 圆角 / Android 圆形 / Android 方圆 / 48px 可读性）

| 候选 | 概念 | 底色 | 主视觉 | 一句话定位 |
| --- | --- | --- | --- | --- |
| **A** [a-liquid-coin](a-liquid-coin/) | 液态金币 Liquid Coin | 暖米白 → 琥珀 | 蜂蜜玻璃金币 + 真镂空 ¥ + 右上玻璃珠 | 延续现有「金币+¥」识别度，3 个候选中小尺寸最易读 |
| **B** [b-glass-ring](b-glass-ring/) | 玻璃资产环 Glass Ring | 深暖黑 + 琥珀环境光 | 厚玻璃环（琥珀/收入绿/支出红三段弧）+ 缺口玻璃珠 + 中心哑光 ¥ | 最有「液态玻璃」高级感，深色桌面/暗色模式下最出挑 |
| **C** [c-glass-trend](c-glass-trend/) | 玻璃趋势卡 Glass Trend | 奶油 → 蜜桃 | 悬浮磨砂玻璃卡 + 极简趋势线 + 玻璃球徽章 | 最贴「消费历史 + 分析」定位，轻盈现代 |

每个候选目录内：

| 文件 | 用途 |
| --- | --- |
| `icon.svg` | **主图**，1024×1024 全出血不透明底色，无预切圆角（iOS / App Store / Expo `icon`） |
| `adaptive-foreground.svg` | Android 自适应图标前景层（透明底，主体在中心 660px 安全圆内） |
| `adaptive-background.svg` | Android 自适应图标背景层（全出血） |
| `adaptive-monochrome.svg` | Android 13+ 主题图标单色层（纯白剪影 + 关键镂空） |
| `notes.md` | 概念说明、色值、设计取舍、自评 |
| `preview-icon.png` | 主图 1024 渲染 |
| `preview-masks.png` | iOS / Android 四种裁切预览 |
| `preview-48.png` | 48×48 实际尺寸（小尺寸可读性检查） |
| `preview-monochrome-check.png` | 单色层在深色底上的预览（主题图标检查） |

## 规范符合性

- **iOS**：1024×1024、sRGB、无 alpha、无预切圆角；系统用连续曲率圆角裁切，重要内容在中心 819px 内。导出即 `assets/icon.png` 所需格式。
  - iOS 26 的 Liquid Glass 由系统在图标上叠加光学效果；本组图标本身以玻璃质感/高光设计，叠加后仍成立。上架仍使用标准 1024 平面图标（无需 Icon Composer 分层）。
- **Android**：自适应图标 108dp 画布，前景内容落在中心 72dp（66.7%）安全区；提供 foreground / background / monochrome 三层，兼容 Android 13+ 主题图标与各厂商裁切形状。
- **纯矢量**：只含 SVG 图形/渐变/滤镜，无位图、无外部字体、无文字，可无限缩放、无版权风险。

## 自动校验（[validation.json](validation.json)）

`python scripts/icon/build_candidates.py` 会渲染三套图层并检查：主图不透明（四角 alpha=255）、前景透明且内容半径 ≤ 330px（660 安全圆）、单色层纯白且合法、SVG 为独立合法 XML 且无 `<text>`/`<image>`/外链/字体/脚本。

| 候选 | 主图 alpha | 前景内容半径 | 单色层半径 | 结果 |
| --- | --- | --- | --- | --- |
| A | 255（全不透明） | 322.3px | 300.6px | ✅ 通过 |
| B | 255（全不透明） | 314.0px | 292.6px | ✅ 通过 |
| C | 255（全不透明） | 286.0px | 279.2px | ✅ 通过 |

## 重新生成预览

依赖：Windows + Edge（或 Chrome）、Python 3 + Pillow + numpy。

```bash
# 单个 SVG 渲染（任意尺寸）
python scripts/icon/render_svg.py design/icon-candidates/a-liquid-coin/icon.svg out.png --size 512

# 全部候选：渲染 1024 图层、生成掩码预览、48px 检查、单色检查、对比图、校验 JSON
python scripts/icon/build_candidates.py
```

## 选定后应用

```bash
# 0) 先看会写哪些文件（不落盘）
python scripts/icon/apply_candidate.py a-liquid-coin --dry-run

# 1) 写入 assets/ 六个 PNG，并同步 Android 启动器 mipmap（android/ 为本地生成目录，不入库）
python scripts/icon/apply_candidate.py a-liquid-coin --sync-android

# 2) 构建验证（真机覆盖安装需同一 debug keystore）
EXPO_PUBLIC_DEEPSEEK_API_KEY=<key> npm run build:apk
```

`apply_candidate.py` 会同时：

- 渲染 `assets/icon.png`、`android-icon-{foreground,background,monochrome}.png`、`favicon.png`、`splash-icon.png`；
- 把 `app.json` 中 `adaptiveIcon.backgroundColor` 与 `expo-quick-actions` 的 `add.backgroundColor` 更新为该候选背景层的主色；
- `--sync-android` 时按密度重写 `mipmap-*/ic_launcher*` 与快捷方式 `add*` 图标、更新 `values/colors.xml`（已在临时副本上完整验证：5 个密度 × 8 个资源 + 6 个 assets 全部正确）。

若不走 `--sync-android`，可改跑 `npx expo prebuild --platform android` 由 Expo 从 `app.json` + `assets/` 重新生成原生图标资源。

回滚：`git checkout -- assets app.json` 后重新执行 `--sync-android`（或重新 prebuild）。

## 备注

- `_build/`、`_apply/` 可随时由脚本重新生成，已加入 `.gitignore`。
- 设计迭代记录见各候选的 `notes.md`；三套方案均由纯 SVG 代码生成，无第三方素材。
