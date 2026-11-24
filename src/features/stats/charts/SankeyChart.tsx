import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme';
import { formatCentsWithSymbol } from '@/lib/money';
import { ChartEmpty } from './ChartEmpty';
import { sankeyLayout } from './sankey-layout';
import { OTHER_NODE_ID, type MoneyFlow } from '../sankey-model';

type Props = { flow: MoneyFlow; height?: number };

/** 左右各留出的标签栏宽度：名称画在节点外侧 */
const LABEL_WIDTH = 78;
const NODE_WIDTH = 10;
const MAX_LABEL_CHARS = 6;
const LABEL_FONT_SIZE = 10;
/** 标签行高的一半，用于把标签垂直居中到节点上 */
const LABEL_HALF_LINE = 8;

function truncate(name: string, max = MAX_LABEL_CHARS): string {
  const chars = Array.from(name);
  return chars.length <= max ? name : `${chars.slice(0, max).join('')}…`;
}

/**
 * 资金流向桑基图。
 *
 * 缎带与节点条用 react-native-svg 画；**标签用 RN `<Text>` 叠加**而不是
 * SVG 文本：读屏能读到节点名、跟随系统字号缩放，也便于测试断言。
 * 几何计算全在 sankey-layout.ts。
 */
export function SankeyChart({ flow, height = 240 }: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  if (flow.total <= 0) return <ChartEmpty />;

  const containerWidth = Math.max(200, measuredWidth ?? windowWidth - 96);
  const layoutWidth = Math.max(1, containerWidth - LABEL_WIDTH * 2);
  const { nodes, ribbons } = sankeyLayout(
    { left: flow.left, right: flow.right, links: flow.links },
    layoutWidth,
    height,
    { nodeWidth: NODE_WIDTH, nodeGap: 8, paddingY: 10 },
  );

  const labelFor = (id: string, name: string, side: 'left' | 'right') => {
    if (id !== OTHER_NODE_ID) return truncate(name);
    const count = side === 'left' ? flow.truncatedLeft : flow.truncatedRight;
    return count > 0 ? `其他 ${count} 项` : '其他';
  };

  const labelStyle = (top: number, side: 'left' | 'right') => ({
    position: 'absolute' as const,
    top,
    fontSize: LABEL_FONT_SIZE,
    color: colors.textSecondary,
    ...(side === 'left'
      ? { left: 0, width: LABEL_WIDTH - 8, textAlign: 'right' as const }
      : { left: LABEL_WIDTH + layoutWidth + 8, width: LABEL_WIDTH - 8 }),
  });

  return (
    <View onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}>
      <View style={{ position: 'relative', height }}>
        {/* 图形整体作为一个可读元素；标签留在它外面，读屏可以逐个念出节点名 */}
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`资金流向：${flow.left.length} 个账户 → ${flow.right.length} 个分类，合计 ${formatCentsWithSymbol(flow.total)}`}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Svg width={containerWidth} height={height}>
            <G x={LABEL_WIDTH}>
              {ribbons.map((ribbon) => (
                <Path
                  key={ribbon.id}
                  d={ribbon.path}
                  fill={ribbon.color}
                  fillOpacity={ribbon.opacity}
                />
              ))}
              {nodes.map((node) => (
                <Rect
                  key={`${node.side}-${node.id}`}
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={2}
                  fill={node.color}
                />
              ))}
            </G>
          </Svg>
        </View>
        {nodes.map((node) => {
          // 节点太矮放不下文字，宁可不画也不要压到相邻节点
          if (node.height < 7) return null;
          return (
            <Text
              key={`label-${node.side}-${node.id}`}
              numberOfLines={1}
              style={labelStyle(node.y + node.height / 2 - LABEL_HALF_LINE, node.side)}
            >
              {labelFor(node.id, node.name, node.side)}
            </Text>
          );
        })}
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 6 }}>
        {`宽度表示金额 · 左：账户 ${flow.left.length} 个，右：分类 ${flow.right.length} 个 · 合计 ${formatCentsWithSymbol(flow.total)}`}
      </Text>
    </View>
  );
}
