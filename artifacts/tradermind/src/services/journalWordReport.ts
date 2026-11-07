import JSZip from 'jszip';
import { db } from '../db/database';
import { compressImage } from '../lib/imageCompression';
import { getHiddenAnalysisFields, getJournalAnalysisFieldLabels, getJournalAnalysisFieldLayouts } from './journalAnalysisFieldLabels';
import { journalSessionService } from './journalSessionService';
import { buildJournalReportParts, type ReportImage, type ReportMedia } from './journalWordReportBuilder';
import { computeJournalAnalytics } from './journalReportAnalytics';
import { renderChartPng } from '../lib/reportCharts';
import { getTradingTimeConfig } from '../lib/tradingTime';

export interface JournalReportRange {
  /** ابتدای بازه (timestamp، شامل). */
  from?: number;
  /** انتهای بازه (timestamp، شامل). */
  to?: number;
  /** فقط معاملات و سشن‌های همین حساب؛ خالی یعنی همهٔ حساب‌ها. */
  accountId?: string | null;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * گزارش Word ژورنال: به‌ازای هر روز معاملاتی، جدول معاملات، تحلیل‌های چندبازه‌ای
 * همراه عکس، و معاملات به‌همراه تریگرشان (عکس تریگر بعد از جدول).
 */
export async function buildJournalWordReport(range: JournalReportRange = {}): Promise<{ blob: Blob; sessionCount: number }> {
  const allSessions = await db.journalSessions.toArray();
  const accountId = range.accountId || null;
  const sessions = allSessions.filter(session =>
    (range.from == null || session.startTime >= range.from) && (range.to == null || session.startTime <= range.to)
    && (!accountId || session.accountId === accountId));
  const sessionIds = sessions.map(session => session.id);

  await journalSessionService.hydrateAnalysisFieldConfig();
  const inRange = (timestamp: number) =>
    (range.from == null || timestamp >= range.from) && (range.to == null || timestamp <= range.to);
  const sessionIdSet = new Set(sessionIds);
  // گزارش فقط دادهٔ معاملاتی متصل به سشن‌های همین بازه را شامل می‌شود.
  const allTrades = await db.trades.toArray();
  const trades = allTrades.filter(trade =>
    Boolean(trade.journalSessionId) && sessionIdSet.has(trade.journalSessionId!));
  const tradeIdSet = new Set(trades.map(trade => trade.id));

  const [options, strategies, accounts, analyses, triggers, allTradeData, sessionMedia, tradeMedia] = await Promise.all([
    db.journalOptions.toArray(),
    db.strategies.toArray(),
    db.accounts.toArray(),
    db.journalSessionAnalyses.where('sessionId').anyOf(sessionIds).toArray(),
    db.journalTriggerEvents.where('sessionId').anyOf(sessionIds).toArray(),
    db.journalTradeData.toArray(),
    db.journalMedia.where('sessionId').anyOf(sessionIds).toArray(),
    tradeIdSet.size
      ? db.journalMedia.where('tradeId').anyOf([...tradeIdSet]).toArray()
      : Promise.resolve([]),
  ]);

  const tradeData = allTradeData.filter(item => tradeIdSet.has(item.tradeId));
  const mediaById = new Map([...sessionMedia, ...tradeMedia].map(record => [record.id, record]));
  const mediaRecords = [...mediaById.values()];

  // عکس‌ها یکی‌یکی به JPEG تبدیل می‌شوند (Word از WebP پشتیبانی نمی‌کند) تا حافظهٔ گوشی پر نشود.
  const media: ReportMedia[] = [];
  for (const record of mediaRecords.sort((a, b) => a.createdAt - b.createdAt)) {
    if (!record.mimeType.startsWith('image/') || (!record.analysisId && !record.triggerId && !record.tradeId)) continue;
    try {
      const converted = await compressImage(record.blob, { maxWidth: 1600, maxHeight: 1600, quality: 0.85, mimeType: 'image/jpeg' });
      media.push({
        id: record.id,
        analysisId: record.analysisId ?? null,
        triggerId: record.triggerId ?? null,
        tradeId: record.tradeId ?? null,
        image: {
          fileName: `${record.id}.jpg`,
          bytes: new Uint8Array(await converted.blob.arrayBuffer()),
          width: converted.width,
          height: converted.height,
        },
      });
    } catch {
      // تصویر نامعتبر یا ناخوانا؛ از گزارش حذف می‌شود و بقیهٔ گزارش ساخته می‌شود.
    }
  }

  // تحلیل جامع انتهای گزارش؛ اگر به هر دلیلی شکست بخورد، بقیهٔ گزارش همچنان ساخته می‌شود.
  const scopeLabel = accountId
    ? accounts.find(account => account.id === accountId)?.name ?? 'حساب انتخاب‌شده'
    : 'همهٔ حساب‌ها';
  let analytics: ReturnType<typeof computeJournalAnalytics> | null = null;
  const chartImages: Record<string, ReportImage> = {};
  try {
    const [dailyJournals, boxes] = await Promise.all([db.dailyJournals.toArray(), db.tradingBoxes.toArray()]);
    analytics = computeJournalAnalytics({
      trades,
      timeConfig: getTradingTimeConfig(),
      scopeLabel,
      source: {
        trades, dailyJournals, strategies, accounts, boxes,
        journalSessions: sessions, journalOptions: options, journalSessionAnalyses: analyses,
        journalTriggerEvents: triggers, journalTradeData: tradeData,
      },
    });
    for (const spec of analytics.charts) {
      const image = await renderChartPng(spec);
      if (image) chartImages[spec.key] = image;
    }
  } catch (error) {
    console.error('[JournalWord] analytics appendix failed', error);
    analytics = null;
  }

  const parts = buildJournalReportParts({
    sessions, options, strategies, accounts, analyses, triggers, trades, tradeData, media,
    analytics, chartImages, scopeLabel: accountId ? scopeLabel : undefined,
    labels: getJournalAnalysisFieldLabels(),
    hiddenFields: getHiddenAnalysisFields(),
    layouts: getJournalAnalysisFieldLayouts(),
    generatedAt: Date.now(),
  });

  const zip = new JSZip();
  for (const [path, content] of Object.entries(parts)) {
    // تصویرها از قبل فشرده‌اند؛ فقط XMLها DEFLATE می‌شوند.
    zip.file(path, content, { compression: typeof content === 'string' ? 'DEFLATE' : 'STORE' });
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
  return { blob, sessionCount: sessions.length };
}
