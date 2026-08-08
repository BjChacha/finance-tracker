import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { SingleLineTextInput } from '@/components/single-line-text-input';
import {
  adapterRegistry,
  ImportSession,
  mappingKey,
  readCsvPreview,
  undoBatch,
  type CommitResult,
  type CsvPreview,
  type DetectionCandidate,
  type GenericCsvConfig,
  type ImportPreview,
  type MappingChoice,
  type MappingItem,
  type MappingPlan,
  type SupportedEncoding,
} from '@/features/import';
import { invalidateTransactionData } from '@/features/transactions';
import { zh } from '@/i18n/zh';
import { pickDocument } from '@/lib/fs';
import { formatCentsWithSymbol } from '@/lib/money';
import { useTheme, type AppTheme } from '@/theme';

const t = zh.imp;

const DIRECTION_LABEL = {
  expense: zh.tx.expense,
  income: zh.tx.income,
  transfer: zh.tx.transfer,
} as const;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type EncodingChoice = 'auto' | SupportedEncoding;

export default function ImportScreen() {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const qc = useQueryClient();

  const [session] = useState(() => new ImportSession(adapterRegistry));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // 步骤 1：候选格式
  const [candidates, setCandidates] = useState<DetectionCandidate[]>([]);
  const [adapterId, setAdapterId] = useState<string | null>(null);

  // 步骤 2：列映射（generic-csv）
  const [encoding, setEncoding] = useState<EncodingChoice>('auto');
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [dateColumn, setDateColumn] = useState('');
  const [amountColumn, setAmountColumn] = useState('');
  const [directionMode, setDirectionMode] = useState<'sign' | 'column'>('sign');
  const [directionColumn, setDirectionColumn] = useState('');
  const [incomeLabelsText, setIncomeLabelsText] = useState('收入');
  const [transferLabelsText, setTransferLabelsText] = useState('');
  const [categoryColumn, setCategoryColumn] = useState('');
  const [accountColumn, setAccountColumn] = useState('');
  const [toAccountColumn, setToAccountColumn] = useState('');
  const [noteColumn, setNoteColumn] = useState('');
  const [dateFormat, setDateFormat] = useState('');

  // 步骤 3：分类/账户映射
  const [mappingPlan, setMappingPlan] = useState<MappingPlan | null>(null);
  const [choices, setChoices] = useState<Map<string, MappingChoice>>(new Map());
  const [pickerItem, setPickerItem] = useState<MappingItem | null>(null);

  // 步骤 4：预览
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  // 步骤 5：完成
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [undone, setUndone] = useState(false);

  async function invalidateAfterWrite() {
    await Promise.all([
      invalidateTransactionData(qc),
      qc.invalidateQueries({ queryKey: ['categories'] }),
      qc.invalidateQueries({ queryKey: ['accounts'] }),
    ]);
  }

  /* ---------------- 步骤 0：选文件 ---------------- */

  async function handlePickFile() {
    setBusy(true);
    try {
      const picked = await pickDocument(['.csv', '.json', '.txt']);
      if (!picked) return;
      session.pickFile(picked);
      setEncoding('auto');
      const found = await session.detect();
      if (found.length === 0) {
        Alert.alert(zh.common.error, t.noAdapter);
        return;
      }
      setCandidates(found);
      setAdapterId(found[0]!.adapter.id);
      setStep(1);
    } catch (e) {
      Alert.alert(zh.common.error, errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- 步骤 1 → 2/3：选格式 ---------------- */

  async function handleAdapterNext() {
    if (!adapterId) return;
    setBusy(true);
    try {
      if (adapterId === 'generic-csv') {
        setCsvPreview(await readCsvPreview(session.ctx));
        setStep(2);
      } else {
        session.setAdapter(adapterId);
        await parseAndPlan();
      }
    } catch (e) {
      Alert.alert(zh.common.error, errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- 步骤 2：编码 + 列映射 ---------------- */

  async function handleEncodingChange(next: EncodingChoice) {
    setEncoding(next);
    session.setEncoding(next === 'auto' ? null : next);
    setBusy(true);
    try {
      setCsvPreview(await readCsvPreview(session.ctx));
    } catch (e) {
      Alert.alert(zh.common.error, errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleParseCsv() {
    if (!dateColumn || !amountColumn) {
      Alert.alert(zh.common.error, t.needDateAmount);
      return;
    }
    if (directionMode === 'column' && !directionColumn) {
      Alert.alert(zh.common.error, t.needDirectionColumn);
      return;
    }
    const splitLabels = (s: string) =>
      s
        .split(/[,，、]/)
        .map((x) => x.trim())
        .filter(Boolean);
    const config: GenericCsvConfig = {
      dateColumn,
      amountColumn,
      directionMode,
      directionColumn: directionMode === 'column' ? directionColumn : undefined,
      incomeLabels: directionMode === 'column' ? splitLabels(incomeLabelsText) : undefined,
      transferLabels: directionMode === 'column' ? splitLabels(transferLabelsText) : undefined,
      categoryColumn: categoryColumn || undefined,
      accountColumn: accountColumn || undefined,
      toAccountColumn: toAccountColumn || undefined,
      noteColumn: noteColumn || undefined,
      dateFormat: dateFormat.trim() || undefined,
    };
    setBusy(true);
    try {
      session.setAdapter('generic-csv', config);
      await parseAndPlan();
    } catch (e) {
      Alert.alert(t.parseFailed, errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /** parse → 空结果拦截 → 生成映射计划 → 步骤 3 */
  async function parseAndPlan() {
    const result = await session.parse();
    if (result.transactions.length === 0) {
      Alert.alert(t.parseFailed, t.emptyParse);
      return;
    }
    const plan = await session.buildMappingPlan();
    setMappingPlan(plan);
    setChoices(
      new Map([...plan.categories, ...plan.accounts].map((i) => [mappingKey(i), i.suggestion])),
    );
    setStep(3);
  }

  /* ---------------- 步骤 3 → 4：应用映射 + 去重 ---------------- */

  async function handleMappingNext() {
    setBusy(true);
    try {
      session.applyMapping(choices);
      await session.dedupe();
      setPreview(session.preview());
      setIncludeDuplicates(false);
      setStep(4);
    } catch (e) {
      Alert.alert(zh.common.error, errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- 步骤 4 → 5：提交 ---------------- */

  async function handleCommit() {
    setBusy(true);
    try {
      const result = await session.commit({ includeDuplicates });
      await invalidateAfterWrite();
      setCommitResult(result);
      setUndone(false);
      setStep(5);
    } catch (e) {
      Alert.alert(zh.common.error, errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- 步骤 5：撤销 ---------------- */

  function handleUndo() {
    if (!commitResult) return;
    Alert.alert(t.undo, t.undoConfirm, [
      { text: zh.common.cancel, style: 'cancel' },
      {
        text: zh.common.confirm,
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const removed = await undoBatch(commitResult.batchId);
            await invalidateAfterWrite();
            setUndone(true);
            Alert.alert(t.undo, t.undoDone(removed));
          } catch (e) {
            Alert.alert(zh.common.error, errorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  /* ---------------- 渲染 ---------------- */

  function renderStepBar() {
    return (
      <View style={styles.stepBar}>
        {t.steps.map((label, i) => (
          <View key={label} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                { backgroundColor: i <= step ? colors.primary : colors.border },
              ]}
            >
              <Text style={{ color: colors.onPrimary, fontSize: 11, fontWeight: '600' }}>{i + 1}</Text>
            </View>
            <Text
              style={{
                color: i === step ? colors.primary : colors.textSecondary,
                fontSize: 10,
                marginTop: 3,
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  function renderChipSelect(
    value: string,
    onChange: (v: string) => void,
    options: string[],
    allowNone: boolean,
  ) {
    return (
      <View style={styles.chipWrap}>
        {allowNone && (
          <Chip label={t.colNone} selected={value === ''} onPress={() => onChange('')} theme={theme} />
        )}
        {options.map((h) => (
          <Chip key={h} label={h} selected={value === h} onPress={() => onChange(h)} theme={theme} />
        ))}
      </View>
    );
  }

  function renderStep0() {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.pickFile}</Text>
        <Text style={styles.cardDesc}>{t.pickFileDesc}</Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          disabled={busy}
          onPress={handlePickFile}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>{t.pickFile}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  function renderStep1() {
    return (
      <>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.candidateTitle}</Text>
          <Text style={styles.cardDesc}>{session.pickedFile?.name}</Text>
          {candidates.map((c) => {
            const selected = adapterId === c.adapter.id;
            return (
              <Pressable
                key={c.adapter.id}
                style={[styles.candidateRow, selected && { borderColor: colors.primary }]}
                onPress={() => setAdapterId(c.adapter.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                    {c.adapter.displayName}
                  </Text>
                  {c.reason ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {c.reason}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontSize: 12 }}>
                  {t.confidence} {Math.round(c.confidence * 100)}%
                </Text>
              </Pressable>
            );
          })}
        </View>
        {renderFooter(
          () => setStep(0),
          handleAdapterNext,
          t.next,
          !adapterId,
        )}
      </>
    );
  }

  function renderStep2() {
    const headers = csvPreview?.headers ?? [];
    return (
      <>
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t.encoding}</Text>
          <View style={styles.segment}>
            {(
              [
                ['auto', t.encodingAuto],
                ['utf-8', 'UTF-8'],
                ['gbk', 'GBK'],
              ] as [EncodingChoice, string][]
            ).map(([key, label]) => (
              <Pressable
                key={key}
                style={[styles.segmentItem, encoding === key && { backgroundColor: colors.primary }]}
                onPress={() => handleEncodingChange(key)}
              >
                <Text
                  style={{
                    color: encoding === key ? colors.onPrimary : colors.textSecondary,
                    fontSize: 13,
                    fontWeight: '600',
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6 }}>
            {t.encodingHint}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t.csvPreviewTitle}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.previewRow}>
                {headers.map((h) => (
                  <Text key={h} style={[styles.previewCell, styles.previewHead, { color: colors.text }]}>
                    {h}
                  </Text>
                ))}
              </View>
              {(csvPreview?.rows ?? []).map((row, i) => (
                <View key={i} style={styles.previewRow}>
                  {headers.map((h) => (
                    <Text
                      key={h}
                      style={[styles.previewCell, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {row[h] ?? ''}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            {t.colDate}
            {t.required}
          </Text>
          {renderChipSelect(dateColumn, setDateColumn, headers, false)}
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
            {t.colAmount}
            {t.required}
          </Text>
          {renderChipSelect(amountColumn, setAmountColumn, headers, false)}

          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>{t.colDirection}</Text>
          <View style={styles.segment}>
            {(
              [
                ['sign', t.dirBySign],
                ['column', t.dirByColumn],
              ] as ['sign' | 'column', string][]
            ).map(([key, label]) => (
              <Pressable
                key={key}
                style={[
                  styles.segmentItem,
                  directionMode === key && { backgroundColor: colors.primary },
                ]}
                onPress={() => setDirectionMode(key)}
              >
                <Text
                  style={{
                    color: directionMode === key ? colors.onPrimary : colors.textSecondary,
                    fontSize: 13,
                    fontWeight: '600',
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          {directionMode === 'column' && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
                {t.colDirectionColumn}
                {t.required}
              </Text>
              {renderChipSelect(directionColumn, setDirectionColumn, headers, false)}
              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>{t.incomeLabels}</Text>
              <SingleLineTextInput
                style={styles.textInput}
                value={incomeLabelsText}
                onChangeText={setIncomeLabelsText}
                placeholder={t.incomeLabelsPlaceholder}
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={[styles.sectionLabel, { marginTop: 12 }]}>{t.transferLabels}</Text>
              <SingleLineTextInput
                style={styles.textInput}
                value={transferLabelsText}
                onChangeText={setTransferLabelsText}
                placeholder={t.transferLabelsPlaceholder}
                placeholderTextColor={colors.textSecondary}
              />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t.colCategory}</Text>
          {renderChipSelect(categoryColumn, setCategoryColumn, headers, true)}
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>{t.colAccount}</Text>
          {renderChipSelect(accountColumn, setAccountColumn, headers, true)}
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>{t.colToAccount}</Text>
          {renderChipSelect(toAccountColumn, setToAccountColumn, headers, true)}
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>{t.colNote}</Text>
          {renderChipSelect(noteColumn, setNoteColumn, headers, true)}
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>{t.dateFormat}</Text>
          <SingleLineTextInput
            style={styles.textInput}
            value={dateFormat}
            onChangeText={setDateFormat}
            placeholder={t.dateFormatPlaceholder}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
          />
        </View>

        {renderFooter(() => setStep(1), handleParseCsv, t.parse, false)}
      </>
    );
  }

  function choiceLabel(item: MappingItem, choice: MappingChoice): string {
    if (choice.action === 'create') {
      return t.createNewNamed(
        item.sourceLabel || (item.kind === 'category' ? '未分类' : '导入账户'),
      );
    }
    if (!mappingPlan) return '';
    const name =
      item.kind === 'category'
        ? mappingPlan.categoryOptions.find((o) => o.id === choice.targetId)?.displayName
        : mappingPlan.accountOptions.find((o) => o.id === choice.targetId)?.name;
    return name ?? '';
  }

  function renderMappingItem(item: MappingItem) {
    const key = mappingKey(item);
    const choice = choices.get(key) ?? item.suggestion;
    const via =
      choice.action === 'existing' && choice.via === 'memory'
        ? t.viaMemory
        : choice.action === 'existing' && choice.via === 'similar'
          ? t.viaSimilar
          : null;
    return (
      <Pressable key={key} style={styles.mappingRow} onPress={() => setPickerItem(item)}>
        <Text style={{ color: colors.text, fontSize: 14, flex: 1 }} numberOfLines={1}>
          {item.sourceLabel || t.unspecified}
          {item.kind === 'category' && item.categoryType
            ? `（${DIRECTION_LABEL[item.categoryType]}）`
            : ''}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>→</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={{ color: colors.primary, fontSize: 14 }} numberOfLines={1}>
            {choiceLabel(item, choice)}
          </Text>
          {via ? (
            <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 1 }}>{via}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  function renderStep3() {
    if (!mappingPlan) return null;
    return (
      <>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.mappingTitle}</Text>
          <Text style={styles.cardDesc}>{t.mappingDesc}</Text>
        </View>
        {mappingPlan.categories.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{t.mappingCategory}</Text>
            {mappingPlan.categories.map(renderMappingItem)}
          </View>
        )}
        {mappingPlan.accounts.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{t.mappingAccount}</Text>
            {mappingPlan.accounts.map(renderMappingItem)}
          </View>
        )}
        {renderFooter(
          () => setStep(adapterId === 'generic-csv' ? 2 : 1),
          handleMappingNext,
          t.next,
          false,
        )}
      </>
    );
  }

  function renderStep4() {
    if (!preview) return null;
    const shown = preview.rows.slice(0, 50);
    return (
      <>
        <View style={[styles.card, { flexDirection: 'row', gap: 8 }]}>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: colors.income }]}>{preview.newCount}</Text>
            <Text style={styles.statLabel}>{t.previewNew(preview.newCount)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: colors.primary }]}>
              {preview.duplicateCount}
            </Text>
            <Text style={styles.statLabel}>{t.previewDup(preview.duplicateCount)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: colors.expense }]}>{preview.errorCount}</Text>
            <Text style={styles.statLabel}>{t.previewErr(preview.errorCount)}</Text>
          </View>
        </View>

        {preview.duplicateCount > 0 && (
          <Pressable
            style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
            onPress={() => setIncludeDuplicates((v) => !v)}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: includeDuplicates ? colors.primary : colors.border,
                  backgroundColor: includeDuplicates ? colors.primary : 'transparent',
                },
              ]}
            >
              {includeDuplicates ? (
                <Icon name="check" size={14} color={colors.onPrimary} />
              ) : null}
            </View>
            <Text style={{ color: colors.text, fontSize: 14 }}>{t.includeDuplicates}</Text>
          </Pressable>
        )}

        {preview.issues.length > 0 && (
          <View style={styles.card}>
            <Pressable
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
              onPress={() => setShowIssues((v) => !v)}
            >
              <Text style={styles.sectionLabel}>
                {t.issuesTitle}（{preview.issues.length}）
              </Text>
              <Text style={{ color: colors.primary, fontSize: 13 }}>
                {showIssues ? t.hideIssues : t.showIssues}
              </Text>
            </Pressable>
            {showIssues &&
              preview.issues.slice(0, 30).map((issue, i) => (
                <Text
                  key={i}
                  style={{
                    color: issue.severity === 'error' ? colors.expense : colors.primary,
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  {issue.message}
                </Text>
              ))}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t.rowsTitle}</Text>
          {shown.map(({ row, duplicate }, i) => (
            <View key={i} style={styles.previewTxRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                  {row.date.slice(0, 10)} · {DIRECTION_LABEL[row.direction]}
                  {row.rawCategory ? ` · ${row.rawCategory}` : ''}
                </Text>
                {row.note ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                    {row.note}
                  </Text>
                ) : null}
              </View>
              <Text
                style={{
                  color: row.direction === 'income' ? colors.income : colors.text,
                  fontSize: 13,
                  fontWeight: '600',
                }}
              >
                {formatCentsWithSymbol(row.amountCents, row.currency)}
              </Text>
              {duplicate ? (
                <View style={[styles.dupBadge, { backgroundColor: `${colors.expense}22` }]}>
                  <Text style={{ color: colors.expense, fontSize: 10 }}>{t.dupBadge}</Text>
                </View>
              ) : null}
            </View>
          ))}
          {preview.rows.length > shown.length && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>
              {t.moreRows(preview.rows.length)}
            </Text>
          )}
        </View>

        {renderFooter(() => setStep(3), handleCommit, busy ? t.importing : t.confirmImport, busy)}
      </>
    );
  }

  function renderStep5() {
    if (!commitResult) return null;
    return (
      <View style={styles.card}>
        <Icon name={undone ? 'rotate-ccw' : 'circle-check-big'} size={40} color={colors.primary} style={{ alignSelf: 'center' }} />
        <Text style={[styles.cardTitle, { textAlign: 'center', marginTop: 8 }]}>
          {undone ? t.undoDone(commitResult.inserted) : t.doneTitle}
        </Text>
        {!undone && (
          <Text style={[styles.cardDesc, { textAlign: 'center' }]}>
            {t.doneSummary(commitResult.inserted, commitResult.skipped)}
          </Text>
        )}
        {!undone && (
          <Pressable
            style={[styles.secondaryBtn, { borderColor: colors.expense }]}
            disabled={busy}
            onPress={handleUndo}
          >
            <Text style={{ color: colors.expense, fontSize: 15, fontWeight: '600' }}>{t.undo}</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>{t.finish}</Text>
        </Pressable>
      </View>
    );
  }

  function renderFooter(
    onPrev: () => void,
    onNext: () => void,
    nextLabel: string,
    nextDisabled: boolean,
  ) {
    return (
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Pressable
          style={[styles.secondaryBtn, { borderColor: colors.border, flex: 1, marginTop: 0 }]}
          disabled={busy}
          onPress={onPrev}
        >
          <Text style={{ color: colors.text, fontSize: 15 }}>{t.prev}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.primaryBtn,
            { backgroundColor: colors.primary, flex: 2, marginTop: 0, opacity: nextDisabled || busy ? 0.5 : 1 },
          ]}
          disabled={nextDisabled || busy}
          onPress={onNext}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>{nextLabel}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  /** 映射目标选择弹窗 */
  function renderPickerModal() {
    if (!pickerItem || !mappingPlan) return null;
    const key = mappingKey(pickerItem);
    const options =
      pickerItem.kind === 'category'
        ? mappingPlan.categoryOptions
            .filter((o) => o.type === pickerItem.categoryType)
            .map((o) => ({ id: o.id, name: o.displayName }))
        : mappingPlan.accountOptions;
    const current = choices.get(key) ?? pickerItem.suggestion;

    const select = (choice: MappingChoice) => {
      setChoices((prev) => new Map(prev).set(key, choice));
      setPickerItem(null);
    };

    return (
      <Modal transparent animationType="fade" onRequestClose={() => setPickerItem(null)}>
        <Pressable style={styles.modalMask} onPress={() => setPickerItem(null)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={[styles.cardTitle, { marginBottom: 4 }]}>
              {pickerItem.sourceLabel || t.unspecified} · {t.pickTarget}
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <Pressable
                style={[styles.modalOption, current.action === 'create' && { backgroundColor: `${colors.primary}18` }]}
                onPress={() => select({ action: 'create' })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="plus" size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 15 }}>
                    {t.createNewNamed(
                      pickerItem.sourceLabel ||
                        (pickerItem.kind === 'category' ? '未分类' : '导入账户'),
                    )}
                  </Text>
                </View>
              </Pressable>
              {options.map((o) => {
                const selected = current.action === 'existing' && current.targetId === o.id;
                return (
                  <Pressable
                    key={o.id}
                    style={[styles.modalOption, selected && { backgroundColor: `${colors.primary}18` }]}
                    onPress={() => select({ action: 'existing', targetId: o.id })}
                  >
                    <Text style={{ color: selected ? colors.primary : colors.text, fontSize: 15 }}>
                      {o.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {renderStepBar()}
      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      {step === 5 && renderStep5()}
      {renderPickerModal()}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
  theme,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: AppTheme;
}) {
  const { colors } = theme;
  return (
    <Pressable
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primary : 'transparent',
      }}
      onPress={onPress}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function makeStyles({ colors }: AppTheme) {
  return StyleSheet.create({
    stepBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    stepItem: { alignItems: 'center', flex: 1 },
    stepDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 12 },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    cardDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 4, marginBottom: 8, lineHeight: 17 },
    sectionLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
    primaryBtn: {
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
    },
    primaryBtnText: { fontSize: 15, fontWeight: '600' },
    secondaryBtn: {
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      marginTop: 12,
    },
    candidateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 4,
    },
    segmentItem: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    textInput: {
      height: 40,
      color: colors.text,
      fontSize: 14,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
    },
    previewRow: { flexDirection: 'row' },
    previewCell: {
      width: 96,
      fontSize: 11,
      paddingVertical: 4,
      paddingRight: 8,
    },
    previewHead: { fontWeight: '600' },
    mappingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    statBox: { flex: 1, alignItems: 'center', paddingVertical: 6 },
    statNum: { fontSize: 22, fontWeight: '700' },
    statLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewTxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    dupBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
    modalMask: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    modalSheet: { borderRadius: 14, padding: 16 },
    modalOption: {
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
  });
}
