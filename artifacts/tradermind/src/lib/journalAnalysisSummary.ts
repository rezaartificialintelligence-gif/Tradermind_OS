import type { JournalOption, JournalSessionAnalysis, Trade } from '../db/database';
import {
  ANALYSIS_FLEXIBLE_FIELD_KEYS,
  parseAnalysisFieldSelections,
  type JournalAnalysisFieldLabels,
} from '../services/journalAnalysisFieldLabels';

export interface JournalAnalysisSummaryRow {
  key: string;
  label: string;
  value: string;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
    return typeof parsed === 'string' && parsed.trim() ? [parsed.trim()] : [];
  } catch {
    return [value.trim()];
  }
}

export function buildJournalAnalysisSummary(
  analysis: JournalSessionAnalysis,
  labels: JournalAnalysisFieldLabels,
  options: JournalOption[],
  trades: Trade[],
): { rows: JournalAnalysisSummaryRow[]; tags: string[] } {
  const rows: JournalAnalysisSummaryRow[] = [];
  const optionById = new Map(options.map(option => [option.id, option.label]));
  const tradeById = new Map(trades.map(trade => [trade.id, trade]));
  const selections = parseAnalysisFieldSelections(analysis.fieldSelections);
  const optionName = (id: string) => optionById.get(id) ?? 'گزینهٔ حذف‌شده';
  const add = (key: string, label: string, value: string | null | undefined) => {
    const normalized = value?.trim();
    if (normalized) rows.push({ key, label, value: normalized });
  };

  for (const key of ANALYSIS_FLEXIBLE_FIELD_KEYS) {
    const text = analysis[key]?.trim() ?? '';
    const picked = (selections[key] ?? []).map(optionName);
    const value = [
      text,
      picked.length > 0 ? `گزینه‌ها: ${picked.join('، ')}` : '',
    ].filter(Boolean).join('\n');
    add(key, labels[key], value);
  }

  add('directionOptionId', labels.directionOptionId, analysis.directionOptionId ? optionName(analysis.directionOptionId) : '');
  add('marketStructureOptionId', labels.marketStructureOptionId, analysis.marketStructureOptionId ? optionName(analysis.marketStructureOptionId) : '');
  add('expectedDirectionOptionId', labels.expectedDirectionOptionId, analysis.expectedDirectionOptionId ? optionName(analysis.expectedDirectionOptionId) : '');
  const liquidityIds = parseStringArray(analysis.liquidityContextOptionIds);
  add('liquidityContextOptionIds', labels.liquidityContextOptionIds, liquidityIds.map(optionName).join('، '));
  add('notes', labels.notes, analysis.notes);

  const outcome = analysis.scenarioOutcomeOptionId ? optionName(analysis.scenarioOutcomeOptionId) : '';
  add('scenarioOutcome', 'نتیجهٔ سناریو', [outcome, analysis.scenarioOutcomeNote].filter(Boolean).join(' · '));
  add('previousTradeId', labels.previousTradeId, analysis.previousTradeId
    ? tradeById.get(analysis.previousTradeId)?.symbol ?? 'معاملهٔ پیوندشده در دسترس نیست'
    : '');
  add('nextTradeId', labels.nextTradeId, analysis.nextTradeId
    ? tradeById.get(analysis.nextTradeId)?.symbol ?? 'معاملهٔ پیوندشده در دسترس نیست'
    : '');

  return {
    rows,
    tags: parseStringArray(analysis.tags),
  };
}
