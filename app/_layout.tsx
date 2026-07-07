import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { db } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import { seedIfEmpty } from '@/db/seed';
import { zh } from '@/i18n/zh';
import { useTheme } from '@/theme';

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

export default function RootLayout() {
  const theme = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <DatabaseGate>
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
        </Stack>
      </DatabaseGate>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
