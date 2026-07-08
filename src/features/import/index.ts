export { adapterRegistry } from './adapters';
export {
  genericCsvAdapter,
  genericCsvConfigSchema,
  readCsvPreview,
  type CsvPreview,
  type GenericCsvConfig,
} from './adapters/generic-csv';
export { createFileContext, detectEncoding, withEncoding, type SupportedEncoding } from './core/encoding';
export { dedupe, type DedupeRow } from './core/dedupe';
export { fingerprintSource, markDuplicates, normalizeNote } from './core/fingerprint';
export {
  ImportSession,
  mappingKey,
  undoBatch,
  type AccountOption,
  type CategoryOption,
  type CommitResult,
  type ImportPreview,
  type MappingChoice,
  type MappingItem,
  type MappingPlan,
} from './core/pipeline';
export { createRegistry, type AdapterRegistry, type DetectionCandidate } from './core/registry';
export type {
  DetectResult,
  ImportAdapter,
  ImportFileContext,
  NormalizedTransaction,
  ParseIssue,
  ParseResult,
} from './core/types';
