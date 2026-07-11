import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopTabs } from 'expo-router/js-top-tabs';
import { zh } from '@/i18n/zh';
import { useTheme } from '@/theme';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
}

const TITLES: Record<string, string> = {
  index: zh.tabs.transactions,
  stats: zh.tabs.stats,
  budgets: zh.tabs.budgets,
  profile: zh.tabs.profile,
};

export default function TabLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState<string>(zh.tabs.transactions);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* material top tabs 没有 header，这里自绘标题栏并处理顶部安全区 */}
      <View style={[styles.header, { backgroundColor: theme.colors.card, paddingTop: insets.top }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>{title}</Text>
      </View>
      <TopTabs
        tabBarPosition="bottom"
        screenListeners={{
          state: (e: { data?: { state?: { index: number; routes: { name: string }[] } } }) => {
            const s = e.data?.state;
            const name = s?.routes[s.index]?.name;
            if (name && TITLES[name]) setTitle(TITLES[name]);
          },
        }}
        screenOptions={{
          lazy: true,
          tabBarShowIcon: true,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textSecondary,
          tabBarStyle: {
            backgroundColor: theme.colors.card,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.border,
            paddingBottom: insets.bottom,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarIndicatorStyle: { height: 0 },
          tabBarLabelStyle: { fontSize: 11, textTransform: 'none', margin: 0 },
          tabBarItemStyle: { paddingVertical: 6, minHeight: 52 },
          tabBarPressColor: `${theme.colors.primary}22`,
        }}
      >
        <TopTabs.Screen
          name="index"
          options={{
            title: zh.tabs.transactions,
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon emoji="📒" focused={focused} />,
          }}
        />
        <TopTabs.Screen
          name="stats"
          options={{
            title: zh.tabs.stats,
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon emoji="📊" focused={focused} />,
          }}
        />
        <TopTabs.Screen
          name="budgets"
          options={{
            title: zh.tabs.budgets,
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon emoji="🎯" focused={focused} />,
          }}
        />
        <TopTabs.Screen
          name="profile"
          options={{
            title: zh.tabs.profile,
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon emoji="👤" focused={focused} />,
          }}
        />
      </TopTabs>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
    minHeight: 44,
  },
  headerTitle: { fontSize: 17, fontWeight: '600' },
});
