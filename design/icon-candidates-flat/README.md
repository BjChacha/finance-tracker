# 花哪了 · 极简环候选（第二轮）

按新要求重做：**纯白背景、纯扁平、移除所有光效/渐变/阴影**；以「资产环」为基础，让环本身承载一个概念，环心留白（不放货币符号）。

**先看对比图：[contact-sheet.png](contact-sheet.png)**（主图 / iOS 圆角 / Android 圆形 / Android 方圆 / 48px）

| 候选 | 概念 | 环代表什么 | 配色 |
| --- | --- | --- | --- |
| **1** [r1-allocation](r1-allocation/) | 配置环 Allocation Ring | 环被分成三段 = **资产构成比例**（现金/投资/其他）；缺口是份额分割线，不是装饰 | 琥珀 `#F59E0B` + 近黑 `#1C1917` + 中性灰 `#A8A29E` |
| **2** [r2-budget](r2-budget/) | 预算环 Budget Ring | 一圈 = 一个月预算：**琥珀弧 = 已花掉的预算（72%）**，浅灰轨道 = 剩余；弧长即进度 | 琥珀 `#F59E0B` + 暖石灰 `#D6D3D1` |
| **3** [r3-history](r3-history/) | 年轮环 History Rings | 三层同心环 = **年轮 = 消费历史一层层累积**，越外越近，表达历史纵深 | 琥珀实色深浅（≤3 色） |

三个候选共用一套语言：白底、琥珀主色、环的粗细级别接近；差异只在「环怎么被分割 / 打断 / 叠加」，用户看到的是同一产品的三个方向。中心全部留白。

> 说明：候选 2 最初是「流动环（缺口 + 三角箭头）」，但箭头接缝在 48px 下会读成断环，故改为预算环——概念同样对应产品的预算/消费建议能力。设计过程见 [r2-budget/notes.md](r2-budget/notes.md)。

## 本轮硬性规则

- **纯白背景**：`#FFFFFF` 全出血，不透明，无背景装饰。
- **纯扁平**：只允许实色填充/描边；禁止渐变、滤镜、模糊、发光、投影、3D、低透明度叠色。
- **极简**：≤2 个视觉元素；≤3 种颜色；环心留白（无货币符号/圆点/文字）。
- **可读**：环描边 ≥80px（1024 画布），外径 560–640px；48px 下仍是清晰的环。
- **标准**：iOS 1024×1024 无 alpha 无预切圆角；Android adaptive 前景 / 纯白背景 / monochrome 三层齐全，前景内容在中心 660px 安全圆内。
- **纯矢量**：独立合法 SVG，无位图、外链、字体、文字、脚本。

## 自动校验（[validation.json](validation.json)）

`python scripts/icon/build_candidates.py --dir design/icon-candidates-flat --title "花哪了 · 极简环 · 候选" --subtitle "纯白底 / 纯扁平 / 环承载概念 · iOS 1024 + Android adaptive"`

除常规标准检查外，本轮额外做 **flat-lint**：SVG 里出现 `<filter>`、`feGaussianBlur`、`feDropShadow`、`<linearGradient>`、`<radialGradient>`、`<pattern>` 等直接判失败。

| 候选 | 主图 alpha | 前景内容半径 | 单色层半径 | 结果 |
| --- | --- | --- | --- | --- |
| 1 配置环 | 255（全不透明） | 308.5px | 308.5px | ✅ 通过 |
| 2 预算环 | 255（全不透明） | 308.5px | 308.5px | ✅ 通过 |
| 3 年轮环 | 255（全不透明） | 316.7px | 316.7px | ✅ 通过 |

三套候选均满足：前景在 660px 安全圆内（半径 ≤330）、纯白背景不透明、单色层纯白、SVG 无滤镜/渐变/文字/外链。

## 重新生成预览

```bash
python scripts/icon/render_svg.py design/icon-candidates-flat/r1-allocation/icon.svg out.png --size 512

python scripts/icon/build_candidates.py --dir design/icon-candidates-flat \
  --title "花哪了 · 极简环 · 候选" \
  --subtitle "纯白底 / 纯扁平 / 环承载概念 · iOS 1024 + Android adaptive"
```

## 选定后应用

```bash
python scripts/icon/apply_candidate.py r1-allocation --dir design/icon-candidates-flat --dry-run
python scripts/icon/apply_candidate.py r1-allocation --dir design/icon-candidates-flat --sync-android
EXPO_PUBLIC_DEEPSEEK_API_KEY=<key> npm run build:apk
```

`--sync-android` 会按密度重写 Android 启动器 mipmap（5 个密度 × 8 个资源）并把 `app.json` / `colors.xml` 的图标背景色更新为该候选的白色。上一轮的玻璃方案仍保留在 `design/icon-candidates/`，可随时切回。
