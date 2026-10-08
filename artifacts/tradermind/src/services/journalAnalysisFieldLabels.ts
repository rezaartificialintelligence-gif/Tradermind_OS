import { kvStore } from './storageService';

export const JOURNAL_ANALYSIS_FIELD_LABELS = {
  analysisText: 'تحلیل بازار',
  marketContext: 'زمینهٔ بازار',
  directionOptionId: 'جهت بازار',
  marketStructureOptionId: 'ساختار بازار',
  expectedDirectionOptionId: 'جهت مورد انتظار',
  liquidityContextOptionIds: 'زمینهٔ نقدینگی',
  scenario: 'سناریوی مورد انتظار',
  triggerContext: 'شرط فعال‌شدن یا لغو',
  zones: 'مناطق قیمت و سطوح',
  notes: 'یادداشت تحلیل',
  previousTradeId: 'معاملهٔ قبلی مرتبط',
  nextTradeId: 'معاملهٔ بعدی مرتبط',
  tags: 'برچسب‌های تحلیل',
} as const;

export type JournalAnalysisFieldKey = keyof typeof JOURNAL_ANALYSIS_FIELD_LABELS;
export type JournalAnalysisFieldLabels = Record<JournalAnalysisFieldKey, string>;

export const JOURNAL_ANALYSIS_FIELD_LABELS_STORAGE_KEY = 'tradermind-journal-analysis-field-labels';
const STORAGE_KEY = JOURNAL_ANALYSIS_FIELD_LABELS_STORAGE_KEY.slice('tradermind-'.length);

export function getJournalAnalysisFieldLabels(): JournalAnalysisFieldLabels {
  const saved = kvStore.get<Partial<JournalAnalysisFieldLabels>>(STORAGE_KEY) ?? {};
  return Object.fromEntries(
    Object.entries(JOURNAL_ANALYSIS_FIELD_LABELS).map(([key, defaultLabel]) => {
      const value = saved[key as JournalAnalysisFieldKey];
      return [key, typeof value === 'string' && value.trim() ? value.trim().slice(0, 100) : defaultLabel];
    }),
  ) as JournalAnalysisFieldLabels;
}

export function saveJournalAnalysisFieldLabels(labels: JournalAnalysisFieldLabels): void {
  const normalized = Object.fromEntries(
    Object.entries(JOURNAL_ANALYSIS_FIELD_LABELS).map(([key, defaultLabel]) => {
      const value = labels[key as JournalAnalysisFieldKey]?.trim();
      return [key, value ? value.slice(0, 100) : defaultLabel];
    }),
  ) as JournalAnalysisFieldLabels;
  kvStore.set(STORAGE_KEY, normalized);
}
