import { describe, expect, it } from 'vitest';
import type { JournalOption, JournalSessionAnalysis, Trade } from '../../db/database';
import { JOURNAL_ANALYSIS_FIELD_LABELS } from '../../services/journalAnalysisFieldLabels';
import { buildJournalAnalysisSummary } from '../journalAnalysisSummary';

describe('buildJournalAnalysisSummary', () => {
  it('includes every populated analysis field, option selection, tag, and linked trade', () => {
    const analysis = {
      id: 'analysis-1',
      sessionId: 'session-1',
      timeframeOptionId: 'tf-15m',
      analysisText: 'حرکت از نقدینگی آغاز شد',
      marketContext: 'قیمت در محدودهٔ مقاومتی بود',
      momentumText: 'شتاب رو به کاهش',
      pricePositionText: 'نزدیک سقف روزانه',
      directionLogicText: 'منتظر تأیید نزولی',
      directionOptionId: 'direction-bearish',
      marketStructureOptionId: 'structure-range',
      liquidityContextOptionIds: '["liquidity-high"]',
      expectedDirectionOptionId: 'direction-bearish',
      scenario: 'پس از شکست وارد می‌شوم',
      triggerContext: 'ابطال در صورت حفظ سقف',
      zones: '',
      notes: 'یادداشت پایانی',
      tags: '["بازبینی","نقدینگی"]',
      fieldSelections: JSON.stringify({ zones: ['zone-high'], marketContext: ['liquidity-high'] }),
      scenarioOutcomeOptionId: 'outcome-matched',
      scenarioOutcomeNote: 'حرکت مطابق انتظار بود',
      previousTradeId: 'trade-previous',
      nextTradeId: 'trade-next',
      createdAt: 1,
      updatedAt: 1,
    } as JournalSessionAnalysis;
    const options = [
      { id: 'direction-bearish', label: 'نزولی' },
      { id: 'structure-range', label: 'محدوده' },
      { id: 'liquidity-high', label: 'نقدینگی سقف' },
      { id: 'zone-high', label: 'سقف روزانه' },
      { id: 'outcome-matched', label: 'مطابق سناریو' },
      { id: 'tf-15m', label: '۱۵ دقیقه' },
    ] as JournalOption[];
    const trades = [
      { id: 'trade-previous', symbol: 'EURUSD' },
      { id: 'trade-next', symbol: 'XAUUSD' },
    ] as Trade[];

    const summary = buildJournalAnalysisSummary(
      analysis,
      JOURNAL_ANALYSIS_FIELD_LABELS,
      options,
      trades,
    );
    const values = Object.fromEntries(summary.rows.map(row => [row.key, row.value]));

    expect(values.analysisText).toContain('حرکت از نقدینگی آغاز شد');
    expect(values.marketContext).toContain('قیمت در محدودهٔ مقاومتی بود');
    expect(values.marketContext).toContain('نقدینگی سقف');
    expect(values.momentumText).toContain('شتاب رو به کاهش');
    expect(values.pricePositionText).toContain('نزدیک سقف روزانه');
    expect(values.directionLogicText).toContain('منتظر تأیید نزولی');
    expect(values.directionOptionId).toBe('نزولی');
    expect(values.marketStructureOptionId).toBe('محدوده');
    expect(values.expectedDirectionOptionId).toBe('نزولی');
    expect(values.liquidityContextOptionIds).toBe('نقدینگی سقف');
    expect(values.scenario).toBe('پس از شکست وارد می‌شوم');
    expect(values.triggerContext).toBe('ابطال در صورت حفظ سقف');
    expect(values.zones).toContain('سقف روزانه');
    expect(values.notes).toBe('یادداشت پایانی');
    expect(values.scenarioOutcome).toContain('مطابق سناریو');
    expect(values.scenarioOutcome).toContain('حرکت مطابق انتظار بود');
    expect(values.previousTradeId).toBe('EURUSD');
    expect(values.nextTradeId).toBe('XAUUSD');
    expect(summary.tags).toEqual(['بازبینی', 'نقدینگی']);
  });
});
