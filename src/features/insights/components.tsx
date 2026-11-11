import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import type { Insight } from '@/db/schema';
import { QueryNotice } from '@/features/dashboard/components';
import { useActiveInsights, useAcknowledgeInsight } from './hooks';
import { insightsCopy, insightsText } from './labels';
import { useTheme } from '@/theme';

/** 卡片最多展示条数（Sure FEED_LIMIT 同款：主动信息流要克制） */
const FEED_LIMIT = 3;

const TYPE_TONE: Record<Insight['type'], 'warning' | 'expense' | 'primary'> = {
  budget_risk: 'warning',
  spending_anomaly: 'expense',
  subscription_audit: 'primary',
  savings_rate_change: 'primary',
  upcoming_recurring: 'primary',
};

/**
 * 首页洞察流：active 洞察的紧凑卡片（图标 + 标题 + 一行正文 + 跳转 + 知道了）。
 * 无 active 洞察时整个区块不渲染（空态不占位）。
 */
export function InsightsSection() {
  const { colors } = useTheme();
  const router = useRouter();
  const query = useActiveInsights();
  const acknowledge = useAcknowledgeInsight();
  const items = query.data?.slice(0, FEED_LIMIT) ?? [];
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <QueryNotice queries={[query]} />
      {items.map((insight) => {
        const meta = insightsText[insight.type];
        const tone = TYPE_TONE[insight.type];
        const accent =
          tone === 'warning'
            ? colors.warning
            : tone === 'expense'
              ? colors.expense
              : colors.primary;
        return (
          <View
            key={insight.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: colors.card,
              borderRadius: 12,
              paddingLeft: 0,
              overflow: 'hidden',
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${insight.title}，${insight.body}`}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 12,
                paddingLeft: 12,
              }}
              onPress={() => {
                if (insight.actionRoute) router.push(insight.actionRoute as never);
              }}
            >
              <View
                style={{
                  width: 3,
                  alignSelf: 'stretch',
                  backgroundColor: accent,
                  borderRadius: 2,
                }}
              />
              <Icon name={meta.icon as never} size={16} color={accent} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                  {insight.title}
                </Text>
                <Text
                  style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}
                  numberOfLines={2}
                >
                  {insight.body}
                </Text>
              </View>
              <Icon name="chevron-right" size={14} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={insightsCopy.ack}
              onPress={() => acknowledge.mutate(insight.id)}
              style={{ padding: 12, paddingLeft: 4 }}
              hitSlop={4}
            >
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
                {insightsCopy.ack}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
