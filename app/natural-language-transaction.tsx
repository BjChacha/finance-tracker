import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Icon } from "@/components/Icon";
import { SecondarySheetScreen } from "@/components/navigation/secondary-sheet-screen";
import {
  TransactionForm,
  type TransactionFormHandle,
  type TxFormInitialValues,
} from "@/features/transactions/components/TransactionForm";
import { useCreateTransaction } from "@/features/transactions/hooks";
import { ParseError, type ParseFailure } from "@/features/transactions/natural-language/deepseek";
import copy from "@/features/transactions/natural-language/labels.json";
import { loadNaturalLanguageContext } from "@/features/transactions/natural-language/load-context";
import { naturalLanguagePreviewValues } from "@/features/transactions/natural-language/preview-values";
import { parseTransactionText } from "@/features/transactions/natural-language/remote-parser";
import { newId } from "@/lib/id";
import { useTheme } from "@/theme";

const MAX_CHARACTERS = 200;

type Phase =
  | { kind: "input" }
  | { kind: "parsing"; text: string }
  | { kind: "clarify"; text: string }
  | { kind: "failure"; text: string; failure: ParseFailure }
  | {
      kind: "preview";
      text: string;
      values: Partial<TxFormInitialValues>;
      dateRequired: boolean;
      /** One-shot idempotency key: unique per parse so saves never collapse into an
       *  earlier transaction, stable within one preview so a double submit stays a no-op. */
      tag: string;
    };

export default function NaturalLanguageTransactionScreen() {
  const { source: param } = useLocalSearchParams<{ source?: string | string[] }>();
  const source = param === "launcher" ? "launcher" : "app";
  return <NaturalLanguageEntry source={source} />;
}

function NaturalLanguageEntry({ source }: { source: "app" | "launcher" }) {
  const router = useRouter();
  const { colors } = useTheme();
  const create = useCreateTransaction();
  const inputRef = useRef<TextInput>(null);
  const form = useRef<TransactionFormHandle>(null);
  const request = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );

  const parse = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPhase({ kind: "parsing", text: trimmed });
    try {
      const { context } = await loadNaturalLanguageContext();
      if (controller.signal.aborted) return;
      const result = await parseTransactionText(trimmed, context, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const values = naturalLanguagePreviewValues(result.preview);
      if (!values) {
        setPhase({ kind: "clarify", text: trimmed });
        return;
      }
      setPhase({
        kind: "preview",
        text: trimmed,
        values,
        dateRequired: result.preview.dateMs === null,
        tag: `natural-language:${newId()}`,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({
        kind: "failure",
        text: trimmed,
        failure: error instanceof ParseError ? error.failure : "invalid_response",
      });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, []);

  const exit = useCallback(() => {
    if (source === "launcher" && Platform.OS === "android") {
      BackHandler.exitApp();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router, source]);

  const beforeDismiss = useCallback(
    async () => (form.current ? form.current.prepareDismiss() : true),
    [],
  );

  const edit = useCallback(() => {
    const text = "text" in phase ? phase.text : draft;
    setPhase({ kind: "input" });
    setDraft(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [draft, phase]);

  const manual = useCallback(() => {
    void (async () => {
      if (!(await beforeDismiss())) return;
      router.replace("/add-transaction");
    })();
  }, [beforeDismiss, router]);

  const focusComposer = useCallback(() => {
    if (phase.kind === "input") inputRef.current?.focus();
  }, [phase.kind]);

  if (phase.kind === "preview")
    return (
      <SecondarySheetScreen
        title={copy.title}
        onBeforeDismiss={beforeDismiss}
        onDismiss={exit}
        initialScrimOpacity={source === "launcher" ? 0.38 : 0}
      >
        <View style={styles.previewRoot}>
          <View style={styles.previewHeader}>
            <View style={[styles.banner, { backgroundColor: colors.card }]}>
              <Icon name="sparkles" size={16} color={colors.primary} />
              <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
                {phase.dateRequired ? copy.dateReview : copy.review}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.editText}
                hitSlop={8}
                onPress={edit}
              >
                <Text style={[styles.bannerAction, { color: colors.primary }]}>
                  {copy.editText}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.formHost}>
            <TransactionForm
              ref={form}
              mode="create"
              prefillPolicy="suggest"
              initialValues={phase.values}
              sessionKey={`natural-language:${phase.text}`}
              clientTag={phase.tag}
              dateSelectionRequiredMessage={
                phase.dateRequired ? copy.dateReview : undefined
              }
              submitting={create.isPending}
              onSubmit={async (input) => {
                await create.mutateAsync(input);
              }}
              onSaved={exit}
            />
          </View>
        </View>
      </SecondarySheetScreen>
    );

  return (
    <SecondarySheetScreen
      title={copy.title}
      onDismiss={exit}
      onEntered={focusComposer}
      initialScrimOpacity={source === "launcher" ? 0.38 : 0}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {phase.kind === "input" ? (
            <>
              <View
                style={[
                  styles.composer,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <TextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={MAX_CHARACTERS}
                  placeholder={copy.placeholder}
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel={copy.title}
                  textAlignVertical="top"
                  style={[styles.input, { color: colors.text }]}
                />
                <View style={styles.composerFooter}>
                  <Text style={[styles.counter, { color: colors.textSecondary }]}>
                    {Array.from(draft).length}/{MAX_CHARACTERS}
                  </Text>
                  <SubmitButton
                    disabled={!draft.trim()}
                    onPress={() => void parse(draft)}
                  />
                </View>
              </View>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {copy.hint}
              </Text>
              <View style={styles.examples}>
                <Text style={[styles.examplesLabel, { color: colors.textSecondary }]}>
                  {copy.examplesLabel}
                </Text>
                <View style={styles.chips}>
                  {copy.examples.map((example) => (
                    <Pressable
                      key={example}
                      accessibilityRole="button"
                      onPress={() => {
                        setDraft(example);
                        inputRef.current?.focus();
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: pressed ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.chipLabel, { color: colors.text }]}>
                        {example}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <>
              <View
                style={[
                  styles.quote,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.quoteLabel, { color: colors.textSecondary }]}>
                  {copy.quote}
                </Text>
                <Text selectable style={[styles.quoteText, { color: colors.text }]}>
                  {phase.text}
                </Text>
              </View>
              {phase.kind === "parsing" ? <ParsingCard /> : null}
              {phase.kind === "clarify" ? (
                <MessageCard
                  icon="circle-question-mark"
                  tone="warning"
                  title={copy.clarifyTitle}
                  message={copy.clarify}
                />
              ) : null}
              {phase.kind === "failure" ? (
                <MessageCard
                  icon="circle-question-mark"
                  tone="expense"
                  title={copy.failureTitle}
                  message={copy.failures[phase.failure] ?? copy.failures.invalid_response}
                />
              ) : null}
              {phase.kind !== "parsing" ? (
                <View style={styles.actions}>
                  {phase.kind === "failure" ? (
                    <SecondaryAction
                      icon="rotate-ccw"
                      label={copy.retry}
                      onPress={() => void parse(phase.text)}
                    />
                  ) : null}
                  <SecondaryAction
                    icon="file-text"
                    label={copy.editText}
                    onPress={edit}
                  />
                  <SecondaryAction
                    icon="plus"
                    label={copy.manual}
                    onPress={manual}
                  />
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SecondarySheetScreen>
  );
}

function SubmitButton({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.submit}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.submit,
        {
          backgroundColor: colors.primary,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Icon name="sparkles" size={18} color={colors.onPrimary} />
      <Text style={[styles.submitLabel, { color: colors.onPrimary }]}>
        {copy.submit}
      </Text>
    </Pressable>
  );
}

function ParsingCard() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.cardRow}>
        <ActivityIndicator color={colors.primary} />
        <View style={styles.cardText}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {copy.parsing}
          </Text>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            {copy.parsingHint}
          </Text>
        </View>
      </View>
    </View>
  );
}

function MessageCard({
  icon,
  tone,
  title,
  message,
}: {
  icon: "circle-question-mark";
  tone: "warning" | "expense";
  title: string;
  message: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.cardRow}>
        <Icon name={icon} size={18} color={colors[tone]} />
        <View style={styles.cardText}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            {message}
          </Text>
        </View>
      </View>
    </View>
  );
}

function SecondaryAction({
  icon,
  label,
  onPress,
}: {
  icon: "rotate-ccw" | "file-text" | "plus";
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryAction,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Icon name={icon} size={16} color={colors.textSecondary} />
      <Text style={[styles.secondaryLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  composer: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  input: { minHeight: 84, fontSize: 16, lineHeight: 24, padding: 0 },
  composerFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counter: { fontSize: 12 },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  submitLabel: { fontSize: 15, fontWeight: "700" },
  hint: { fontSize: 13, lineHeight: 20, paddingHorizontal: 2 },
  examples: { gap: 8, paddingTop: 4 },
  examplesLabel: { fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  chipLabel: { fontSize: 13 },
  quote: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4 },
  quoteLabel: { fontSize: 12 },
  quoteText: { fontSize: 15, lineHeight: 22 },
  card: { borderRadius: 16, padding: 14 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardBody: { fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 2 },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryLabel: { fontSize: 13, fontWeight: "600" },
  previewRoot: { flex: 1 },
  previewHeader: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  bannerAction: { fontSize: 12, fontWeight: "700" },
  formHost: { flex: 1 },
});
