import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import StoredImage from '../StoredImage';
import { parseJournalArray, triggerAnalysisIds, type JournalSessionTimelineItem } from '../../services/journalSessionService';
import { parseAnalysisFieldSelections, type JournalAnalysisFieldLabels } from '../../services/journalAnalysisFieldLabels';
import { classifyScenarioOutcome, SCENARIO_OUTCOME_TONE } from '../../lib/scenarioOutcome';
import type { JournalMedia, JournalOption, JournalSessionAnalysis, JournalTriggerEvent } from '../../db/database';

interface SessionTimelineProps {
  items: JournalSessionTimelineItem[];
  media: JournalMedia[];
  options: JournalOption[];
  analyses: JournalSessionAnalysis[];
  fieldLabels: JournalAnalysisFieldLabels;
  formatDate: (timestamp: number) => string;
}

type DetailRow = { label: string; value: string };

const RESULT_NAMES: Record<string, string> = {
  win: 'سود', 'partial-win': 'سود نسبی', loss: 'زیان', 'partial-loss': 'زیان نسبی',
  breakeven: 'سر به سر', open: 'باز', cancelled: 'لغوشده',
};

/** یک بلوک «عنوان: متن» که متن ثبت‌شده را کامل و بدون برش نشان می‌دهد. */
function DetailBlock({ label, value }: DetailRow) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <div className="text-[11px] font-medium text-primary/90">{label}</div>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 text-foreground/90">{value}</p>
    </div>
  );
}

function MediaGrid({ items, testId }: { items: JournalMedia[]; testId: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid={testId}>
      {items.map(item => (
        <div key={item.id} className="aspect-video overflow-hidden rounded-md border border-border/70 bg-background">
          {item.mimeType.startsWith('image/')
            ? <StoredImage source={item.blob} enableViewer showDownload filename={item.fileName} alt={item.caption || item.fileName} className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center p-2 text-center text-[11px] text-muted-foreground">{item.fileName}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * خط زمانی کامل سشن: همهٔ متن‌ها، گزینه‌ها و عکس‌های ثبت‌شده برای تحلیل، تریگر،
 * معامله و رویداد بدون معامله همین‌جا نمایش داده می‌شوند (فقط فیلدهای پرشده).
 */
export function SessionTimeline({ items, media, options, analyses, fieldLabels, formatDate }: SessionTimelineProps) {
  const label = (id: string | null | undefined, fallback = '') => options.find(option => option.id === id)?.label ?? fallback;
  const tradeLabel = (id: string | null | undefined) => {
    const item = items.find(entry => entry.kind === 'trade' && entry.id === id);
    return item && item.kind === 'trade' ? `${item.record.symbol} · ${formatDate(item.record.openedAt)}` : '';
  };

  const analysisRows = (record: JournalSessionAnalysis): DetailRow[] => {
    const rows: DetailRow[] = [];
    const add = (key: keyof JournalAnalysisFieldLabels, value: string | null | undefined) => {
      if (value && value.trim()) rows.push({ label: fieldLabels[key], value: value.trim() });
    };
    add('analysisText', record.analysisText);
    add('marketContext', record.marketContext);
    add('momentumText', record.momentumText);
    add('pricePositionText', record.pricePositionText);
    if (record.expectedDirectionOptionId) add('expectedDirectionOptionId', label(record.expectedDirectionOptionId, '—'));
    add('directionLogicText', record.directionLogicText);
    add('scenario', record.scenario);
    add('triggerContext', record.triggerContext);
    add('zones', record.zones);
    // فیلدهایی که کاربر آن‌ها را به‌صورت چک‌باکس تنظیم کرده است
    const selections = parseAnalysisFieldSelections(record.fieldSelections);
    for (const [key, ids] of Object.entries(selections)) {
      const names = (ids ?? []).map(id => label(id, '')).filter(Boolean);
      if (names.length > 0) rows.push({ label: fieldLabels[key as keyof JournalAnalysisFieldLabels] ?? key, value: names.join('، ') });
    }
    add('notes', record.notes);
    if (record.scenarioOutcomeNote?.trim()) rows.push({ label: 'توضیح نتیجهٔ سناریو', value: record.scenarioOutcomeNote.trim() });
    // مقادیر قدیمی
    if (record.directionOptionId) add('directionOptionId', label(record.directionOptionId, '—'));
    if (record.marketStructureOptionId) add('marketStructureOptionId', label(record.marketStructureOptionId, '—'));
    const liquidity = parseJournalArray(record.liquidityContextOptionIds).map(id => label(id, '')).filter(Boolean);
    if (liquidity.length > 0) rows.push({ label: fieldLabels.liquidityContextOptionIds, value: liquidity.join('، ') });
    const tags = parseJournalArray(record.tags);
    if (tags.length > 0) rows.push({ label: fieldLabels.tags, value: tags.join('، ') });
    if (record.previousTradeId && tradeLabel(record.previousTradeId)) rows.push({ label: fieldLabels.previousTradeId, value: tradeLabel(record.previousTradeId) });
    if (record.nextTradeId && tradeLabel(record.nextTradeId)) rows.push({ label: fieldLabels.nextTradeId, value: tradeLabel(record.nextTradeId) });
    return rows;
  };

  const triggerRows = (record: JournalTriggerEvent): DetailRow[] => {
    const rows: DetailRow[] = [];
    if (record.triggerTypeOptionId) rows.push({ label: 'نوع تریگر', value: label(record.triggerTypeOptionId, '—') });
    if (record.directionOptionId) rows.push({ label: 'جهت', value: label(record.directionOptionId, '—') });
    if (record.description.trim()) rows.push({ label: 'شرح تریگر', value: record.description.trim() });
    if (record.marketMovement.trim()) rows.push({ label: 'حرکت قیمت و واکنش بازار', value: record.marketMovement.trim() });
    if (record.notes.trim()) rows.push({ label: 'یادداشت تریگر', value: record.notes.trim() });
    const linked = triggerAnalysisIds(record)
      .map(id => analyses.find(analysis => analysis.id === id))
      .filter((analysis): analysis is JournalSessionAnalysis => Boolean(analysis))
      .map(analysis => label(analysis.timeframeOptionId, 'تحلیل'));
    if (linked.length > 0) rows.push({ label: 'تحلیل‌های مرتبط', value: linked.join('، ') });
    return rows;
  };

  if (items.length === 0) {
    return (
      <Card className="border-dashed"><div className="p-5 text-sm text-muted-foreground" data-testid="empty-session-timeline">هنوز رویدادی برای نمایش وجود ندارد.</div></Card>
    );
  }

  return (
    <Card className="tradermind-card overflow-hidden">
      <div className="divide-y divide-border/70">
        {items.map(item => {
          const kindLabel = item.kind === 'analysis' ? 'تحلیل' : item.kind === 'trigger' ? 'تریگر' : item.kind === 'trade' ? 'معامله' : 'بدون معامله';
          let title = '';
          let rows: DetailRow[] = [];
          let itemMedia: JournalMedia[] = [];
          let badge: ReactNode = null;

          if (item.kind === 'analysis') {
            title = label(item.record.timeframeOptionId, 'تایم‌فریم حذف‌شده');
            rows = analysisRows(item.record);
            itemMedia = media.filter(entry => entry.analysisId === item.id);
            if (item.record.scenarioOutcomeOptionId) {
              const outcome = label(item.record.scenarioOutcomeOptionId, 'نتیجه');
              badge = <span className={`rounded-full border px-2 py-0.5 text-[10px] ${SCENARIO_OUTCOME_TONE[classifyScenarioOutcome(outcome)]}`}>{outcome}</span>;
            }
          } else if (item.kind === 'trigger') {
            title = `${label(item.record.timeframeOptionId, 'تایم‌فریم حذف‌شده')} · ${item.record.description || label(item.record.triggerTypeOptionId, 'تریگر')}`;
            rows = triggerRows(item.record);
            itemMedia = media.filter(entry => entry.triggerId === item.id);
            badge = <Badge variant={item.record.status === 'converted' ? 'default' : 'secondary'} className="text-[10px]">
              {item.record.status === 'converted' ? 'متصل به معامله' : item.record.status === 'ignored' ? 'نادیده' : item.record.status === 'invalid' ? 'نامعتبر' : 'در انتظار'}
              {' · '}{item.record.confirmed ? 'تأییدشده' : 'تأییدنشده'}
            </Badge>;
          } else if (item.kind === 'trade') {
            title = `${item.record.symbol} · ${item.record.direction === 'long' ? 'خرید' : 'فروش'} · ${item.record.status === 'open' ? 'باز' : (RESULT_NAMES[item.record.result] ?? item.record.result)}`;
            if (item.record.profitLoss != null) rows.push({ label: 'سود/زیان', value: String(item.record.profitLoss) });
            if (item.record.rMultiple != null) rows.push({ label: 'R', value: `${item.record.rMultiple}R` });
          } else {
            title = label(item.record.typeOptionId, 'رویداد');
            if (item.record.notes?.trim()) rows.push({ label: 'یادداشت', value: item.record.notes.trim() });
          }

          return (
            <div key={`${item.kind}-${item.id}`} className="flex items-start gap-3 px-4 py-3" data-testid={`timeline-item-${item.kind}-${item.id}`}>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{kindLabel}</Badge>
                  {item.kind === 'trade'
                    ? <Link href={`/journal/trades/${item.record.id}`} className="min-w-0 break-words text-sm font-medium text-primary hover:underline" data-testid={`timeline-trade-link-${item.id}`}>{title}</Link>
                    : <span className="min-w-0 break-words text-sm font-medium">{title}</span>}
                  {badge}
                  <span className="text-[10px] text-muted-foreground">{formatDate(item.timestamp)}</span>
                </div>
                {rows.length > 0 && <div className="space-y-2" data-testid={`timeline-details-${item.kind}-${item.id}`}>
                  {rows.map(row => <DetailBlock key={`${row.label}-${row.value.slice(0, 12)}`} label={row.label} value={row.value} />)}
                </div>}
                <MediaGrid items={itemMedia} testId={`timeline-media-${item.kind}-${item.id}`} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
