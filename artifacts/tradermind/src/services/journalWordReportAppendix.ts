/**
 * بخش پایانی گزارش Word: تمام گزارش‌ها و نمودارهای «مرکز گزارشات» به‌علاوهٔ
 * بهترین/بدترین زمان‌ها و نقاط قوت، ضعف و مشکلات معامله‌گر.
 */
import { CONTENT_WIDTH, LABEL_FILL, paragraph, table, type TableCell } from '../lib/ooxml';
import { formatReportNumber } from './reportsCenterService';
import type { ReportImage } from './journalWordReportBuilder';
import type { AnalyticsAppendix, FindingItem, TimeBucketRow, TimeRanking } from './journalReportAnalytics';

const BEST_FILL = 'DCFCE7';
const WORST_FILL = 'FEE2E2';
const MUTED = '6B7280';

const faNumber = (value: number | null, digits = 2) => (value == null ? '—' : formatReportNumber(value, digits));
const faInt = (value: number) => value.toLocaleString('fa-IR');

export type AppendixImageWriter = (image: ReportImage) => string;

function describeRow(row: TimeBucketRow, appendix: AnalyticsAppendix): string {
  const currency = /\(([^)]+)\)/.exec(appendix.basisLabel)?.[1] ?? '';
  const value = appendix.basis === 'winRate'
    ? `${faNumber(row.value, 0)}٪`
    : appendix.basis === 'r' ? `${faNumber(row.value)}R` : `${faNumber(row.value)} ${currency}`.trim();
  return `${row.label} (${value} با ${faInt(row.trades)} معامله، نرخ برد ${row.winRate == null ? '—' : `${faNumber(row.winRate, 0)}٪`})`;
}

function rankingBlock(ranking: TimeRanking, appendix: AnalyticsAppendix, charts: Record<string, ReportImage>, image: AppendixImageWriter): string[] {
  const body: string[] = [];
  body.push(paragraph(`بهترین و بدترین ${ranking.title}`, { style: 'Heading3', keepNext: true }));
  if (ranking.rows.length === 0) {
    body.push(paragraph('معامله بسته‌شده‌ای برای این تحلیل وجود ندارد.'));
    return body;
  }
  body.push(paragraph(`بهترین: ${ranking.best ? describeRow(ranking.best, appendix) : '—'}`, { bold: true, color: '15803D' }));
  body.push(paragraph(ranking.worst
    ? `بدترین: ${describeRow(ranking.worst, appendix)}`
    : 'بدترین: به‌دلیل کمبود تنوع در داده (تنها یک بازه یا نتیجهٔ برابر) قابل تعیین نیست.', { bold: true, color: 'B91C1C' }));
  if (!ranking.reliableOnly && ranking.rows.length > 1) {
    body.push(paragraph('توجه: برخی بازه‌ها کمتر از ۳ معامله دارند؛ این رتبه‌بندی نشانهٔ اولیه است.', { size: 18, color: MUTED }));
  }
  const head: TableCell[] = [ranking.title, 'تعداد معامله', 'نرخ برد', 'مجموع R', 'سود/زیان خالص'].map(text => ({ text, bold: true }));
  const rows: TableCell[][] = ranking.rows.map(row => {
    const fill = row.key === ranking.best?.key ? BEST_FILL : row.key === ranking.worst?.key ? WORST_FILL : undefined;
    return [
      { text: row.label, fill }, { text: faInt(row.trades), fill },
      { text: row.winRate == null ? '—' : `${faNumber(row.winRate, 0)}٪`, fill },
      { text: faNumber(row.totalR), fill }, { text: faNumber(row.netPnl), fill },
    ];
  });
  body.push(table([head, ...rows], [3400, 1500, 1500, 1500, CONTENT_WIDTH - 7900], { headerRows: 1, fontSize: 18 }));
  const chart = charts[`time-${ranking.id}`];
  if (chart) body.push(image(chart));
  return body;
}

function widthsFor(columns: string[]): number[] {
  if (columns.includes('درس ثبت‌شده')) {
    return [1400, 1700, CONTENT_WIDTH - 1400 - 1700 - 1700, 1700];
  }
  const first = columns.length <= 3 ? Math.round(CONTENT_WIDTH * 0.4) : 2600;
  const rest = Math.floor((CONTENT_WIDTH - first) / Math.max(1, columns.length - 1));
  return columns.map((_, index) => (index === 0 ? first : index === columns.length - 1 ? CONTENT_WIDTH - first - rest * (columns.length - 2) : rest));
}

function findings(title: string, items: FindingItem[], emptyText: string, color?: string): string[] {
  const body: string[] = [paragraph(title, { style: 'Heading3', keepNext: true, before: 240 })];
  if (items.length === 0) {
    body.push(paragraph(emptyText, { color: MUTED }));
    return body;
  }
  items.forEach((item, index) => {
    body.push(paragraph(`${faInt(index + 1)}. ${item.title}`, { bold: true, color, keepNext: true, before: 100, after: 20 }));
    if (item.detail) body.push(paragraph(item.detail, { after: 20 }));
    if (item.evidence) body.push(paragraph(`شواهد: ${item.evidence}`, { size: 18, color: MUTED }));
  });
  return body;
}

/** همهٔ پاراگراف‌ها و جدول‌های بخش پایانی را برمی‌گرداند. */
export function renderAnalyticsAppendix(
  appendix: AnalyticsAppendix,
  charts: Record<string, ReportImage>,
  image: AppendixImageWriter,
): string[] {
  const body: string[] = [];
  body.push(paragraph('تحلیل جامع عملکرد (مرکز گزارشات)', { style: 'Heading1', pageBreakBefore: true }));
  body.push(paragraph(`دامنهٔ گزارش: ${appendix.scopeLabel}`, { bold: true }));
  body.push(paragraph(`مبنای رتبه‌بندی بهترین و بدترین‌ها: ${appendix.basisLabel}`));
  if (appendix.closedCount === 0) {
    body.push(paragraph('در این دامنه معامله بسته‌شده‌ای وجود ندارد؛ بخش‌های تحلیلی خالی‌اند.', { bold: true, color: 'B91C1C' }));
  } else if (appendix.sampleWarning) {
    body.push(paragraph(`تعداد معاملات بسته‌شده (${faInt(appendix.closedCount)}) کمتر از ۲۰ است؛ نتایج این بخش نشانهٔ اولیه‌اند و هنوز از نظر آماری قطعی نیستند.`, { bold: true, color: 'B45309' }));
  }

  body.push(paragraph('خلاصهٔ کلی', { style: 'Heading2' }));
  body.push(table(appendix.headline.map(([name, value]) => [{ text: name, bold: true, fill: LABEL_FILL }, { text: value }]), [3600, CONTENT_WIDTH - 3600], { fontSize: 20 }));
  if (appendix.performanceTrend) body.push(paragraph(`روند عملکرد: ${appendix.performanceTrend}`, { before: 80 }));
  for (const key of Object.keys(charts).filter(name => name.startsWith('equity-') || name === 'outcome')) body.push(image(charts[key]));

  body.push(paragraph('بهترین و بدترین زمان‌های معامله', { style: 'Heading2' }));
  const summaryLines = appendix.rankings
    .filter(ranking => ranking.best)
    .map(ranking => `${ranking.title} — بهترین: ${ranking.best!.label}${ranking.worst ? ` | بدترین: ${ranking.worst.label}` : ''}`);
  for (const line of summaryLines) body.push(paragraph(`• ${line}`));
  for (const ranking of appendix.rankings) body.push(...rankingBlock(ranking, appendix, charts, image));

  body.push(paragraph('گزارش‌های مرکز گزارشات', { style: 'Heading2', before: 360 }));
  for (const section of appendix.sections) {
    const { table: data } = section;
    body.push(paragraph(data.title, { style: 'Heading3', keepNext: true }));
    if (data.description) body.push(paragraph(data.description, { size: 18, color: MUTED, keepNext: true }));
    if (data.rows.length === 0) {
      body.push(paragraph('داده‌ای برای این بخش ثبت نشده است.'));
    } else {
      const head: TableCell[] = data.columns.map(text => ({ text, bold: true }));
      const rows: TableCell[][] = data.rows.map(row => row.cells.map(cell => ({
        text: cell === null || cell === undefined ? '—' : typeof cell === 'number' ? formatReportNumber(cell) : String(cell),
      })));
      body.push(table([head, ...rows], widthsFor(data.columns), { headerRows: 1, fontSize: 17 }));
      if (data.multiAttributed) body.push(paragraph('هر معامله ممکن است در چند ردیف بیاید؛ بنابراین جمع ردیف‌ها از تعداد معاملات بیشتر می‌شود.', { size: 17, color: MUTED }));
    }
    const chart = charts[`section-${section.id}`];
    if (chart) body.push(image(chart));
  }

  if (appendix.discipline || appendix.health) {
    body.push(paragraph('انضباط و سلامت معاملاتی', { style: 'Heading2', before: 360 }));
    if (appendix.health) body.push(paragraph(`امتیاز سلامت معاملاتی: ${faInt(appendix.health.score)} از ۱۰۰ — ${appendix.health.label}`, { bold: true }));
    if (appendix.health?.summary) body.push(paragraph(appendix.health.summary));
    if (appendix.discipline) {
      body.push(paragraph(`امتیاز انضباط: ${faInt(appendix.discipline.total)} از ۱۰۰ (${appendix.discipline.grade}) — ${appendix.discipline.label}`, { bold: true, before: 80 }));
      body.push(table([
        [{ text: 'مؤلفه', bold: true }, { text: 'امتیاز', bold: true }, { text: 'درجه', bold: true }],
        ...appendix.discipline.components.map(component => [{ text: component.label }, { text: faInt(component.score) }, { text: component.grade }]),
      ], [CONTENT_WIDTH - 3600, 1800, 1800], { headerRows: 1, fontSize: 18 }));
    }
  }

  body.push(paragraph('نقاط قوت، نقاط ضعف و مشکلات من', { style: 'Heading2', before: 360 }));
  body.push(paragraph('این بخش فقط از روی داده‌هایی ساخته شده که خودت در برنامه ثبت کرده‌ای. هرچه معاملات و مرور‌های بیشتری ثبت کنی، دقیق‌تر می‌شود. توصیهٔ مالی نیست.', { size: 18, color: MUTED }));
  body.push(...findings('نقاط قوت', appendix.strengths, 'هنوز نقطهٔ قوت قابل‌اتکایی از داده‌ها استخراج نشده است (معمولاً به‌خاطر کمبود نمونه).', '15803D'));
  body.push(...findings('نقاط ضعف', appendix.weaknesses, 'نقطهٔ ضعف مشخصی از داده‌ها استخراج نشده است.', 'B91C1C'));
  body.push(...findings('مشکلات روان‌شناختی', appendix.psychologyProblems, 'مشکل روان‌شناختی تکرارشونده‌ای در داده‌های ثبت‌شده دیده نشد؛ اگر احساسات و پرچم‌های رفتاری را در معاملات ثبت نکرده‌ای، این بخش خالی می‌ماند.', 'B91C1C'));
  body.push(...findings('مشکلات معامله‌گری و اجرا', appendix.tradingProblems, 'مشکل اجرایی تکرارشونده‌ای در داده‌های ثبت‌شده دیده نشد؛ برای دقیق‌تر شدن، اشتباه‌های هر معامله را در مرور معامله ثبت کن.', 'B91C1C'));
  body.push(...findings('پیشنهادهای اصلاحی بر پایهٔ داده‌ها', appendix.recommendations, 'پیشنهاد مشخصی ساخته نشد.'));
  return body;
}
