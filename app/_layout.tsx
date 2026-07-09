import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { db } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import { seedIfEmpty } from '@/db/seed';
import { runCatchUpIfNeeded } from '@/features/recurring';
import { invalidateTransactionData } from '@/features/transactions';
import { zh } from '@/i18n/zh';
import { useTheme } from '@/theme';

/** 全局错误边界：渲染异常时给出中文提示与重试，避免白屏 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.colors.background, padding: 24 }]}>
      <Text style={{ color: theme.colors.expense, fontSize: 16, fontWeight: '600' }}>
        {zh.common.error}
      </Text>
      <Text style={{ color: theme.colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
        {error.message}
      </Text>
      <Pressable
        onPress={retry}
        style={{
          marginTop: 16,
          paddingHorizontal: 24,
          paddingVertical: 10,
          borderRadius: 8,
          backgroundColor: theme.colors.primary,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>{zh.common.retry}</Text>
      </Pressable>
    </View>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, gcTime: 5 * 60 * 1000 } },
});

/** 数据库迁移门：迁移 + 播种完成前不渲染 app */
function DatabaseGate({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<Error | null>(null);

  useEffect(() => {
    if (!success) return;
    seedIfEmpty()
      .then(() => setSeeded(true))
      .catch((e: unknown) => setSeedError(e instanceof Error ? e : new Error(String(e))));
  }, [success]);

  if (error || seedError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.expense, fontSize: 16 }}>{zh.db.migrateError}</Text>
        <Text style={{ color: theme.colors.textSecondary, marginTop: 8 }}>
          {(error ?? seedError)?.message}
        </Text>
      </View>
    );
  }
  if (!success || !seeded) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ color: theme.colors.textSecondary, marginTop: 12 }}>{zh.db.migrating}</Text>
      </View>
    );
  }
  return <>{children}</>;
}

/** 周期记账补账：迁移+种子完成后跑一次，AppState 回前台再跑（同一天节流） */
function RecurringCatchUpRunner() {
  const qc = useQueryClient();

  useEffect(() => {
    const run = () => {
      void runCatchUpIfNeeded().then((result) => {
        if (!result) return;
        if (result.created > 0) void invalidateTransactionData(qc);
        void qc.invalidateQueries({ queryKey: ['recurring'] });
      });
    };
    run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, [qc]);

  return null;
}

export default function RootLayout() {
  const theme = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <DatabaseGate>
        <RecurringCatchUpRunner />
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.card },
            headerTintColor: theme.colors.text,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="add-transaction"
            options={{ presentation: 'modal', title: zh.tx.addTitle }}
          />
          <Stack.Screen name="backup/index" options={{ title: zh.backup.title }} />
          <Stack.Screen name="import/index" options={{ title: zh.imp.title }} />
          <Stack.Screen name="recurring/index" options={{ title: zh.recurring.title }} />
          <Stack.Screen name="recurring/edit" options={{ title: zh.recurring.add }} />
        </Stack>
      </DatabaseGate>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
