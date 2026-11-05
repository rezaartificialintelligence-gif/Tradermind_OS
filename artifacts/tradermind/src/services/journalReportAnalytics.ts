/**
 * تحلیل جامع برای انتهای گزارش Word ژورنال.
 *
 * همهٔ اعداد از همان منابعی می‌آیند که صفحه‌های برنامه استفاده می‌کنند:
 *  - مرکز گزارشات (reportsCenterService) ← جدول‌های ۱۶ بخش
 *  - موتور واحد معیارها (core/metrics/engine) ← بهترین/بدترین ساعت، روز، هفته و ماه
 *  - پروفایل معامله‌گر و روان‌شناسی ← نقاط قوت، ضعف و مشکلات رفتاری
 * این فایل فقط محاسبه می‌کند (بدون DB و بدون رسم)؛ ساخت XML در journalWordReportAppendix.ts است.
 */
import type { DailyJournal, Trade } from '../db/database';
import { computeMetrics, computeMetricsBy, MIN_RELIABLE_SAMPLE, type TradeMetrics } from '../core/metrics/engine';
import { getNetPnl, isClosed } from '../lib/tradeHelpers';
import { getTradingDateKey, getTradingDateParts, type TradingTimeConfig } from '../lib/tradingTime';
import type { ChartSpec } from '../lib/reportCharts';
import {
  buildPnlCurves,
  buildReportTable,
  computeReportsCenterSummary,
  createReportsCenterIndex,
  formatReportNumber,
  getCurrencyCodeForTrade,
  REPORT_SECTION_DEFINITIONS,
  type ReportsCenterSource,
  type ReportTableData,
} from './reportsCenterService';
import { BEHAVIOR_TREND_FA, computeTraderProfile, PERF_TREND_FA, type BehavioralPattern } from './traderProfileService';
import { computeDisciplineScore, generateSmartReport } from './psychologyService';

export type RankingBasis = 'pnl' | 'r' | 'winRate';

export interface TimeBucketRow {
  key: string;
  label: string;
  trades: number;
  winRate: number | null;
  netPnl: number;
  totalR: number | null;
  /** مقداری که رتبه‌بندی بر اساس آن انجام شده (طبق basis). */
  value: number;
}

export interface TimeRanking {
  id: 'hour' | 'weekday' | 'week' | 'month';
  title: string;
  rows: TimeBucketRow[];
  best: TimeBucketRow | null;
  worst: TimeBucketRow | null;
  /** true اگر رتبه‌بندی فقط از بازه‌های دارای حداقل ۳ معامله انجام شده است. */
  reliableOnly: boolean;
}

export interface FindingItem {
  title: string;
  detail: string;
  evidence?: string;
}

export interface AnalyticsAppendix {
  scopeLabel: string;
  closedCount: number;
  sampleWarning: boolean;
  basis: RankingBasis;
  basisLabel: string;
  headline: Array<[string, string]>;
  rankings: TimeRanking[];
  sections: Array<{ id: string; table: ReportTableData }>;
  charts: ChartSpec[];
  discipline: { total: number; grade: string; label: string; components: Array<{ label: string; score: number; grade: string }>; suggestions: string[] } | null;
  health: { score: number; label: string; summary: string } | null;
  performanceTrend: string | null;
  strengths: FindingItem[];
  weaknesses: FindingItem[];
  psychologyProblems: FindingItem[];
  tradingProblems: FindingItem[];
  recommendations: FindingItem[];
}

export interface AnalyticsInput {
  trades: Trade[];
  source: ReportsCenterSource;
  timeConfig: TradingTimeConfig;
  scopeLabel: string;
}

const WEEKDAY_LABELS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
/** ترتیب هفتهٔ ایرانی: شنبه تا جمعه. */
const WEEKDAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
const MIN_BUCKET_TRADES = 3;
const PSYCHOLOGY_BEHAVIOR_IDS = new Set(['fomo', 'hesitation', 'fear', 'impatience', 'overconfidence', 'revenge-trading', 'uncertainty']);

const fa = (value: number, digits = 2) => formatReportNumber(value, digits);
const faInt = (value: number) => value.toLocaleString('fa-IR');
const pct = (value: number | null) => (value == null ? '—' : `${fa(value, 0)}٪`);

const jalaliDay = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
const jalaliMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', timeZone: 'UTC' });
const jalaliParts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });

function persianMonthKey(utcDate: Date): string {
  const parts = jalaliParts.formatToParts(utcDate);
  const year = parts.find(part => part.type === 'year')?.value ?? '0';
  const month = parts.find(part => part.type === 'month')?.value ?? '0';
  return `${year.replace(/\D/g, '')}-${month.padStart(2, '0')}`;
}

function pickBasis(trades: Trade[], index: ReturnType<typeof createReportsCenterIndex>): { basis: RankingBasis; label: string } {
  const closed = trades.filter(isClosed);
  const withPnl = closed.filter(trade => getNetPnl(trade) !== null);
  const currencies = [...new Set(withPnl.map(trade => getCurrencyCodeForTrade(trade, index)))];
  if (currencies.length === 1) return { basis: 'pnl', label: `سود/زیان خالص (${currencies[0]})` };
  const m = computeMetrics(closed);
  if (m.rCount > 0) {
    return { basis: 'r', label: currencies.length > 1 ? 'مجموع R (چون حساب‌ها ارز متفاوت دارند)' : 'مجموع R' };
  }
  return { basis: 'winRate', label: 'نرخ برد (٪)' };
}

function valueOf(metrics: TradeMetrics, basis: RankingBasis): number {
  if (basis === 'pnl') return Math.round(metrics.netPnl * 100) / 100;
  if (basis === 'r') return Math.round(metrics.totalR * 100) / 100;
  return metrics.winRate == null ? 0 : Math.round(metrics.winRate * 100);
}

function buildRanking(
  id: TimeRanking['id'],
  title: string,
  closed: Trade[],
  keyFn: (trade: Trade) => { key: string; label: string; order: number },
  basis: RankingBasis,
): TimeRanking {
  const meta = new Map<string, { label: string; order: number }>();
  const groups = computeMetricsBy(closed, trade => {
    const info = keyFn(trade);
    meta.set(info.key, { label: info.label, order: info.order });
    return info.key;
  });
  const rows: TimeBucketRow[] = groups
    .map(({ key, metrics }) => ({
      key,
      label: meta.get(key)?.label ?? key,
      trades: metrics.count,
      winRate: metrics.winRate == null ? null : Math.round(metrics.winRate * 100),
      netPnl: Math.round(metrics.netPnl * 100) / 100,
      totalR: metrics.rCount ? Math.round(metrics.totalR * 100) / 100 : null,
      value: valueOf(metrics, basis),
      order: meta.get(key)?.order ?? 0,
    }))
    .filter(row => row.trades > 0)
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...row }) => row);

  const reliable = rows.filter(row => row.trades >= MIN_BUCKET_TRADES);
  const pool = reliable.length >= 2 ? reliable : rows;
  const sorted = [...pool].sort((a, b) => b.value - a.value || b.trades - a.trades || a.key.localeCompare(b.key));
  const best = sorted[0] ?? null;
  const worstCandidate = sorted.length > 1 ? sorted[sorted.length - 1] : null;
  const worst = worstCandidate && best && worstCandidate.value !== best.value ? worstCandidate : null;
  return { id, title, rows, best, worst, reliableOnly: reliable.length >= 2 };
}

function buildRankings(closed: Trade[], timeConfig: TradingTimeConfig, basis: RankingBasis): TimeRanking[] {
  const hour = buildRanking('hour', 'ساعت معاملات', closed, trade => {
    const h = getTradingDateParts(trade.openedAt, timeConfig).hour;
    return { key: `h${h}`, label: `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`, order: h };
  }, basis);
  const weekday = buildRanking('weekday', 'روز هفته', closed, trade => {
    const d = getTradingDateParts(trade.openedAt, timeConfig).dayOfWeek;
    return { key: `d${d}`, label: WEEKDAY_LABELS[d], order: WEEKDAY_ORDER.indexOf(d) };
  }, basis);
  const week = buildRanking('week', 'هفته (شنبه تا جمعه)', closed, trade => {
    const p = getTradingDateParts(trade.openedAt, timeConfig);
    const sinceSaturday = p.dayOfWeek === 6 ? 0 : p.dayOfWeek + 1;
    const start = new Date(Date.UTC(p.year, p.month, p.day - sinceSaturday));
    const end = new Date(start.getTime() + 6 * 86_400_000);
    return { key: start.toISOString().slice(0, 10), label: `${jalaliDay.format(start)} تا ${jalaliDay.format(end)}`, order: start.getTime() };
  }, basis);
  const month = buildRanking('month', 'ماه (شمسی)', closed, trade => {
    const p = getTradingDateParts(trade.openedAt, timeConfig);
    const date = new Date(Date.UTC(p.year, p.month, p.day, 12));
    const key = persianMonthKey(date);
    return { key, label: jalaliMonth.format(date), order: Number(key.replace('-', '')) };
  }, basis);
  return [hour, weekday, week, month];
}

function cellText(value: string | number | null): string {
  if (value === null || value === undefined) return '—';
  return typeof value === 'number' ? fa(value) : value;
}

/** ستون‌های عددی جدول مرکز گزارشات را برای نمودار می‌خواند (نرخ برد = ستون ۳، میانگین R = ستون ۴). */
function chartFromTable(id: string, table: ReportTableData): ChartSpec | null {
  const standard = table.columns[3] === 'نرخ برد (%)' && table.columns[4] === 'میانگین R';
  if (!standard) return null;
  const rows = [...table.rows].sort((a, b) => Number(b.cells[1] ?? 0) - Number(a.cells[1] ?? 0)).slice(0, 10);
  if (rows.length < 2) return null;
  const hasR = rows.some(row => typeof row.cells[4] === 'number');
  const values = rows.map(row => Number(hasR ? row.cells[4] ?? 0 : row.cells[3] ?? 0));
  return {
    kind: 'bar',
    key: `section-${id}`,
    title: `${table.title} — ${hasR ? 'میانگین R' : 'نرخ برد (٪)'}`,
    yLabel: hasR ? 'میانگین R هر معامله' : 'نرخ برد (٪)',
    categories: rows.map(row => String(row.cells[0] ?? '')),
    values,
    colors: hasR ? undefined : values.map(() => '#2563EB'),
  };
}

function rankingChart(ranking: TimeRanking, basisLabel: string): ChartSpec | null {
  if (ranking.rows.length === 0) return null;
  // هفته‌ها و ماه‌های زیاد: فقط ۲۴ مورد آخر در نمودار
  const rows = ranking.rows.slice(-24);
  return {
    kind: 'bar',
    key: `time-${ranking.id}`,
    title: `نتیجه بر اساس ${ranking.title}`,
    yLabel: basisLabel,
    categories: rows.map(row => row.label),
    values: rows.map(row => row.value),
  };
}

function evidenceText(items: Array<{ label: string; value: string }>): string {
  return items.map(item => `${item.label}: ${item.value}`).join(' | ');
}

/** شواهد خود آیتم؛ اگر خالی بود، خلاصهٔ تعداد/نرخ برد/میانگین R. */
function itemEvidence(item: { evidence: Array<{ label: string; value: string }>; count: number; winRate: number; avgR: number | null }): string {
  const own = evidenceText(item.evidence);
  if (own) return own;
  return `${faInt(item.count)} معامله، نرخ برد ${fa(item.winRate, 0)}٪${item.avgR == null ? '' : `، میانگین ${fa(item.avgR)}R`}`;
}

function patternItem(pattern: BehavioralPattern): FindingItem {
  const impact = pattern.impactOnR == null ? 'نامشخص' : `${pattern.impactOnR > 0 ? '+' : ''}${fa(pattern.impactOnR)}R`;
  return {
    title: pattern.name,
    detail: `در ${faInt(pattern.frequency)} معامله از ${faInt(pattern.totalTrades)} معامله (${fa(pattern.rate, 0)}٪) ثبت شده است. روند: ${BEHAVIOR_TREND_FA[pattern.trend]}.`,
    evidence: `اثر روی میانگین R نسبت به معاملات بدون این رفتار: ${impact} | نرخ برد با این رفتار ${fa(pattern.winRateFlagged, 0)}٪ در برابر ${fa(pattern.winRateNotFlagged, 0)}٪ بدون آن`,
  };
}

function dedupe(items: FindingItem[]): FindingItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.title.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safely<T>(label: string, run: () => T, fallback: T): T {
  try {
    return run();
  } catch (error) {
    console.warn(`[JournalWordReport] ${label} failed`, error);
    return fallback;
  }
}

export function computeJournalAnalytics(input: AnalyticsInput): AnalyticsAppendix {
  const { trades, source, timeConfig } = input;
  const index = createReportsCenterIndex({ ...source, trades });
  const closed = trades.filter(isClosed);
  const { basis, label: basisLabel } = pickBasis(trades, index);
  const summary = computeReportsCenterSummary(trades, index);

  // ── خلاصهٔ کلی ──
  const headline: Array<[string, string]> = [
    ['تعداد کل معاملات', faInt(summary.totalTrades)],
    ['معاملات بسته‌شده', faInt(summary.closedTrades)],
    ['معاملات باز / لغوشده', `${faInt(summary.openTrades)} / ${faInt(summary.cancelledTrades)}`],
    ['برد / باخت / سر به سر', `${faInt(summary.wins)} / ${faInt(summary.losses)} / ${faInt(summary.breakeven)}`],
    ['نرخ برد', pct(summary.winRate)],
    ['مجموع R', summary.totalR == null ? '—' : `${fa(summary.totalR)}R`],
    ['میانگین R', summary.averageR == null ? '—' : `${fa(summary.averageR)}R`],
  ];
  for (const currency of summary.currencies) {
    headline.push([`سود/زیان خالص (${currency.currency})`, fa(currency.netPnl)]);
    headline.push([`Profit Factor (${currency.currency})`, currency.profitFactor == null ? '—' : fa(currency.profitFactor)]);
    headline.push([`حداکثر افت سرمایه (${currency.currency})`, currency.maxDrawdown == null ? '—' : fa(currency.maxDrawdown)]);
  }

  // ── بهترین و بدترین زمان‌ها ──
  const rankings = safely('rankings', () => buildRankings(closed, timeConfig, basis), []);

  // ── جدول‌های مرکز گزارشات ──
  const sections = REPORT_SECTION_DEFINITIONS.map(definition => ({
    id: definition.id as string,
    table: safely(`section ${definition.id}`, () => buildReportTable(definition.id, trades, { ...source, trades }, index, timeConfig), {
      title: definition.label, description: '', columns: [], rows: [],
    } as ReportTableData),
  })).filter(section => section.table.columns.length > 0);

  // ── نمودارها ──
  const charts: ChartSpec[] = [];
  const curves = safely('pnl curves', () => buildPnlCurves(trades, index), {});
  for (const [currency, points] of Object.entries(curves).slice(0, 3)) {
    if (points.length === 0) continue;
    charts.push({
      kind: 'line',
      key: `equity-${currency}`,
      title: `منحنی سود/زیان خالص تجمعی (${currency})`,
      yLabel: `${currency} — به ترتیب بسته‌شدن معاملات`,
      xLabels: points.map(point => `#${point.index}`),
      series: [{ name: currency, values: points.map(point => point.cumulativeNetPnl) }],
    });
  }
  if (summary.closedTrades > 0) {
    charts.push({
      kind: 'bar',
      key: 'outcome',
      title: 'نتیجهٔ معاملات بسته‌شده',
      yLabel: 'تعداد معامله',
      categories: ['برد', 'باخت', 'سر به سر'],
      values: [summary.wins, summary.losses, summary.breakeven],
      colors: ['#16A34A', '#DC2626', '#6B7280'],
    });
  }
  for (const ranking of rankings) {
    const chart = rankingChart(ranking, basisLabel);
    if (chart) charts.push(chart);
  }
  for (const section of sections) {
    if (!['sessions', 'strategies', 'direction', 'instruments', 'mistakes', 'psychology'].includes(section.id)) continue;
    const chart = chartFromTable(section.id, section.table);
    if (chart) charts.push(chart);
  }

  // ── پروفایل معامله‌گر، روان‌شناسی و انضباط ──
  const strategies = source.strategies.map(item => ({ id: item.id, name: item.name }));
  const profile = safely('trader profile', () => computeTraderProfile(trades, strategies, 0, {}), null);
  const tradeDays = new Set(trades.map(trade => getTradingDateKey(trade.openedAt, timeConfig)));
  const journals: DailyJournal[] = source.dailyJournals.filter(journal => tradeDays.has(journal.date));
  const smart = safely('smart report', () => generateSmartReport(trades, journals), null);
  const disciplineRaw = safely('discipline', () => computeDisciplineScore(trades), null);

  const strengths: FindingItem[] = [];
  const weaknesses: FindingItem[] = [];
  const psychologyProblems: FindingItem[] = [];
  const tradingProblems: FindingItem[] = [];
  const recommendations: FindingItem[] = [];

  if (profile) {
    for (const item of profile.strengths.filter(entry => !entry.isRejected && !entry.isIrrelevant)) {
      strengths.push({ title: item.title, detail: item.description, evidence: itemEvidence(item) });
    }
    for (const item of [...profile.weaknesses, ...profile.watchlist].filter(entry => !entry.isRejected && !entry.isIrrelevant)) {
      const finding = { title: item.title, detail: item.description, evidence: itemEvidence(item) };
      weaknesses.push(item.type === 'watchlist' ? { ...finding, title: `${item.title} (نیازمند توجه)` } : finding);
    }
    for (const pattern of profile.behavioralPatterns.filter(entry => entry.frequency > 0).sort((a, b) => b.rate - a.rate)) {
      (PSYCHOLOGY_BEHAVIOR_IDS.has(pattern.id) ? psychologyProblems : tradingProblems).push(patternItem(pattern));
    }
    for (const insight of profile.coachingInsights.filter(entry => !entry.isRejected && !entry.isIrrelevant)) {
      if (insight.type === 'improvement' || insight.type === 'warning') {
        recommendations.push({ title: insight.title, detail: insight.body, evidence: evidenceText(insight.evidence) || undefined });
      }
    }
  }

  if (smart) {
    for (const item of smart.positives) strengths.push({ title: item.title, detail: item.description, evidence: item.evidence });
    for (const item of smart.negatives) weaknesses.push({ title: item.title, detail: item.description, evidence: item.evidence });
    for (const item of smart.suggestions) recommendations.push({ title: item.title, detail: item.description, evidence: item.evidence });
  }

  // احساس‌ها و اشتباه‌های ثبت‌شده که عملکرد ضعیف دارند (از مرکز گزارشات)
  const weakGroups = (id: string) => (sections.find(section => section.id === id)?.table.rows ?? [])
    .filter(row => Number(row.cells[2] ?? 0) >= 2 && ((typeof row.cells[4] === 'number' && row.cells[4] < 0) || (typeof row.cells[3] === 'number' && row.cells[3] < 40)))
    .sort((a, b) => Number(a.cells[4] ?? 0) - Number(b.cells[4] ?? 0))
    .slice(0, 8);
  for (const row of weakGroups('psychology')) {
    psychologyProblems.push({
      title: `حالت ذهنی «${cellText(row.cells[0])}» همراه نتیجهٔ ضعیف`,
      detail: `وقتی این احساس/حالت ثبت شده، نتیجهٔ معاملات ضعیف بوده است.`,
      evidence: `${faInt(Number(row.cells[2]))} معامله بسته | نرخ برد ${cellText(row.cells[3])}٪ | میانگین R ${cellText(row.cells[4])} | سود/زیان ${cellText(row.cells[5])}`,
    });
  }
  const mistakeRows = (sections.find(section => section.id === 'mistakes')?.table.rows ?? [])
    .filter(row => Number(row.cells[1] ?? 0) > 0)
    .sort((a, b) => Number(b.cells[1] ?? 0) - Number(a.cells[1] ?? 0))
    .slice(0, 8);
  for (const row of mistakeRows) {
    tradingProblems.push({
      title: `اشتباه تکراری: ${cellText(row.cells[0])}`,
      detail: `این اشتباه در ${faInt(Number(row.cells[1]))} معامله ثبت شده است.`,
      evidence: `نرخ برد ${cellText(row.cells[3])}٪ | میانگین R ${cellText(row.cells[4])} | سود/زیان ${cellText(row.cells[5])}`,
    });
  }

  const discipline = disciplineRaw && disciplineRaw.components.length > 0
    ? {
      total: disciplineRaw.total,
      grade: disciplineRaw.grade,
      label: disciplineRaw.label,
      components: disciplineRaw.components.map(component => ({ label: component.labelFa || component.label, score: Math.round(component.score), grade: component.grade })),
      suggestions: disciplineRaw.suggestions,
    }
    : null;
  if (disciplineRaw) {
    for (const component of disciplineRaw.components.filter(item => item.score < 55)) {
      psychologyProblems.push({
        title: `انضباط ضعیف در «${component.labelFa || component.label}»`,
        detail: component.description,
        evidence: `امتیاز ${faInt(Math.round(component.score))} از ۱۰۰ (${component.grade})${component.details.length ? ` | ${component.details.join('، ')}` : ''}`,
      });
    }
    for (const suggestion of disciplineRaw.suggestions) recommendations.push({ title: 'پیشنهاد انضباطی', detail: suggestion });
  }

  const closedCount = summary.closedTrades;
  return {
    scopeLabel: input.scopeLabel,
    closedCount,
    sampleWarning: closedCount < MIN_RELIABLE_SAMPLE,
    basis,
    basisLabel,
    headline,
    rankings,
    sections,
    charts,
    discipline,
    health: smart ? { score: Math.round(smart.overallHealth), label: smart.healthLabel, summary: smart.summary } : null,
    performanceTrend: profile && profile.performanceTrend !== 'insufficient' ? `${PERF_TREND_FA[profile.performanceTrend]} — ${profile.performanceTrendDesc}` : null,
    strengths: dedupe(strengths),
    weaknesses: dedupe(weaknesses),
    psychologyProblems: dedupe(psychologyProblems),
    tradingProblems: dedupe(tradingProblems),
    recommendations: dedupe(recommendations),
  };
}
