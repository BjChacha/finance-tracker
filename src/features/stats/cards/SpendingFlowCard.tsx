import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, QueryNotice } from '@/features/dashboard/components';
import { useTheme } from '@/theme';
import { SankeyChart } from '../charts/SankeyChart';
import { useMoneyFlow } from '../sankey';
import type { StatsRange } from '../repository';

/**
 * 资金流向卡片：周期内「账户 → 分类」的桑基图。
 *
 * 支出与收入共用同一张图（只是方向语义不同），所以用一个切换而不是两张卡。
 */
export function SpendingFlowCard({
  range,
  enabled = true,
}: {
  range: StatsRange;
  enabled?: boolean;
}) {
  const { colors } = useTheme();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const query = useMoneyFlow(range, type, enabled);

  return (
    <Card title="资金流向">
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['expense', 'income'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: type === value }}
            onPress={() => setType(value)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: type === value ? colors.primary : colors.card,
            }}
          >
            <Text
              style={{
                color: type === value ? colors.onPrimary : colors.text,
                fontSize: 13,
              }}
            >
              {value === 'expense' ? '支出' : '收入'}
            </Text>
          </Pressable>
        ))}
      </View>
      <QueryNotice queries={[query]} />
      {query.data && <SankeyChart flow={query.data} />}
    </Card>
  );
}
