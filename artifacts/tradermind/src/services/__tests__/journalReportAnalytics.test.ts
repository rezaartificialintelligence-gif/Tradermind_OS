import { describe, expect, it } from 'vitest';
import type { Account, JournalOption, Strategy, Trade } from '../../db/database';
import { DEFAULT_ANALYSIS_FIELD_LAYOUTS, JOURNAL_ANALYSIS_FIELD_LABELS } from '../journalAnalysisFieldLabels';
import { buildJournalReportParts } from '../journalWordReportBuilder';
import { computeJournalAnalytics } from '../journalReportAnalytics';
import type { ReportsCenterSource } from '../reportsCenterService';

const timeConfig = { mode: 'broker', brokerUtcOffsetMinutes: 0 } as const;
// شنبه ۲۰۲۶-۰۳-۰۷ UTC (روز هفتهٔ ۶)
const base = Date.UTC(2026, 2, 7, 0, 0, 0);
const hour = 3_600_000;
const day = 24 * hour;

function trade(id: string, offsetMs: number, pnl: number, extra: Partial<Trade> = {}): Trade {
  return {
    id, symbol: 'XAUUSD', market: 'forex', direction: 'long', status: 'closed',
    result: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
    profitLoss: pnl, rMultiple: pnl / 10, openedAt: base + offsetMs, closedAt: base + offsetMs + hour,
    accountId: 'a1', journalSessionId: null, entryPrice: 1, stopLoss: 1, takeProfit: 1, exitPrice: 1,
    ...extra,
  } as unknown as Trade;
}

const trades = [
  trade('t1', 9 * hour, 50),               // شنبه ۰۹
  trade('t2', 9 * hour + day, 30),         // یکشنبه ۰۹
  trade('t3', 14 * hour + 2 * day, -40),   // دوشنبه ۱۴
  trade('t4', 14 * hour + 3 * day, -20),   // سه‌شنبه ۱۴
  trade('t5', 9 * hour + 9 * day, 25),     // هفتهٔ بعد، ۰۹
];

function source(list: Trade[]): ReportsCenterSource {
  return {
    trades: list, dailyJournals: [], strategies: [{ id: 'st1', name: 'S' }] as unknown as Strategy[],
    accounts: [{ id: 'a1', name: 'Primary', currency: 'USD' }] as unknown as Account[], boxes: [],
    journalSessions: [], journalOptions: [] as JournalOption[], journalSessionAnalyses: [],
    journalTriggerEvents: [], journalTradeData: [],
  };
}

describe('computeJournalAnalytics', () => {
  const result = computeJournalAnalytics({ trades, source: source(trades), timeConfig, scopeLabel: 'Primary' });

  it('uses P&L as ranking basis for a single-currency account', () => {
    expect(result.basis).toBe('pnl');
    expect(result.closedCount).toBe(5);
    expect(result.sampleWarning).toBe(true);
  });

  it('finds best and worst hour, weekday, week and month', () => {
    const byId = Object.fromEntries(result.rankings.map(ranking => [ranking.id, ranking]));
    // ساعت ۹: +۱۰۵ (۳ معامله)، ساعت ۱۴: −۶۰ (۲ معامله)
    expect(byId.hour.best?.label).toContain('09:00');
    expect(byId.hour.best?.value).toBe(105);
    expect(byId.hour.worst?.label).toContain('14:00');
    expect(byId.hour.worst?.value).toBe(-60);
    expect(byId.weekday.best?.label).toBe('شنبه');
    // دوشنبه: −۴۰ + ۲۵ = −۱۵ ، سه‌شنبه: −۲۰ ← بدترین سه‌شنبه است
    expect(byId.weekday.worst?.label).toBe('سه‌شنبه');
    expect(byId.week.rows.length).toBe(2);
    expect(byId.week.best?.value).toBe(25);
    expect(byId.week.worst?.value).toBe(20);
    expect(byId.month.rows.length).toBe(1);
  });

  it('puts every reports-center section in the appendix and builds charts', () => {
    expect(result.sections.length).toBeGreaterThanOrEqual(14);
    expect(result.charts.map(chart => chart.key)).toEqual(expect.arrayContaining(['equity-USD', 'outcome', 'time-hour', 'time-weekday']));
  });

  it('does not throw for an account with no trades', () => {
    const empty = computeJournalAnalytics({ trades: [], source: source([]), timeConfig, scopeLabel: 'Empty' });
    expect(empty.closedCount).toBe(0);
    expect(empty.rankings.every(ranking => ranking.best === null)).toBe(true);
  });
});

describe('Word report appendix', () => {
  const analytics = computeJournalAnalytics({ trades, source: source(trades), timeConfig, scopeLabel: 'Primary' });
  const png = { fileName: 'chart-time-hour.png', bytes: new Uint8Array([137, 80, 78, 71]), width: 1400, height: 720 };

  function parts(extra: Record<string, unknown> = {}) {
    return buildJournalReportParts({
      generatedAt: base, sessions: [], options: [], strategies: [], accounts: [], analyses: [], triggers: [],
      trades, media: [], labels: JOURNAL_ANALYSIS_FIELD_LABELS, layouts: DEFAULT_ANALYSIS_FIELD_LAYOUTS,
      analytics, chartImages: { 'time-hour': png }, ...extra,
    });
  }

  it('appends best/worst, reports-center tables and the strengths/weaknesses block after all trades', () => {
    const xml = String(parts()['word/document.xml']);
    expect(xml).toContain('تحلیل جامع عملکرد');
    expect(xml).toContain('بهترین و بدترین ساعت معاملات');
    expect(xml).toContain('بهترین و بدترین روز هفته');
    expect(xml).toContain('بهترین و بدترین هفته');
    expect(xml).toContain('بهترین و بدترین ماه');
    expect(xml).toContain('نقاط قوت');
    expect(xml).toContain('نقاط ضعف');
    expect(xml).toContain('مشکلات روان‌شناختی');
    expect(xml).toContain('مشکلات معامله‌گری و اجرا');
    // بخش تحلیلی بعد از بخش معاملات روزانه می‌آید
    expect(xml.indexOf('تحلیل جامع عملکرد')).toBeGreaterThan(xml.indexOf('روز معاملاتی'));
  });

  it('embeds chart images as png parts', () => {
    const output = parts();
    expect(Object.keys(output).some(path => path.endsWith('.png'))).toBe(true);
    expect(String(output['[Content_Types].xml'])).toContain('image/png');
  });

  it('is unchanged when no analytics are supplied', () => {
    const xml = String(parts({ analytics: null })['word/document.xml']);
    expect(xml).not.toContain('تحلیل جامع عملکرد');
  });

  it('shows the account name in the header when scoped to one account', () => {
    expect(String(parts({ scopeLabel: 'Primary' })['word/document.xml'])).toContain('حساب: Primary');
  });
});
