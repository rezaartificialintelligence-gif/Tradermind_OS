import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import ScreenshotManager from '../ScreenshotManager';
import { TradeReflectionForm } from './TradeReflectionForm';
import { tradeService } from '../../services/tradeService';
import { accountService, riskAmountFromPercent, riskPercentFromAmount } from '../../services/accountService';
import { journalSessionService } from '../../services/journalSessionService';
import { getTradingDateTimeInput, parseTradingDateTimeInput } from '../../lib/tradingTime';
import { finalizeTradeFields, normalizeDecimalText, parseDecimalText } from '../../lib/tradeFinalize';
import type { JournalSession, JournalTriggerEvent, Trade } from '../../db/database';

interface TriggerTradeFormProps {
  session: JournalSession;
  trigger: JournalTriggerEvent;
  /** جهت پیشنهادی از روی جهت تریگر (در صورت وجود) */
  suggestedDirection: Trade['direction'] | null;
  /** نمادهای سشن؛ اولین مورد پیش‌فرض است */
  defaultSymbol: string;
  onSaved: () => void | Promise<void>;
}

const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'entryPrice', label: 'قیمت ورود', required: true },
  { key: 'stopLoss', label: 'حد ضرر', required: true },
  { key: 'takeProfit', label: 'حد سود' },
  { key: 'exitPrice', label: 'قیمت خروج' },
  { key: 'positionSize', label: 'حجم (لات)' },
  { key: 'riskPercentage', label: 'درصد ریسک' },
  { key: 'riskAmount', label: 'مبلغ ریسک' },
  { key: 'profitLoss', label: 'سود/زیان' },
  { key: 'fees', label: 'سایر هزینه‌ها' },
  { key: 'commission', label: 'کمیسیون' },
  { key: 'spread', label: 'اسپرد' },
];

/**
 * ثبت معامله مستقیم زیر تریگر؛ بدون رفتن به صفحهٔ جدا.
 * معامله در همان جدول قبلی ذخیره می‌شود و وضعیت/نتیجه/R با همان قواعد فرم قدیمی محاسبه می‌شوند.
 */
export function TriggerTradeForm({ session, trigger, suggestedDirection, defaultSymbol, onSaved }: TriggerTradeFormProps) {
  const [direction, setDirection] = useState<Trade['direction']>(suggestedDirection ?? 'long');
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [values, setValues] = useState<Record<string, string>>({});
  const [openedAt, setOpenedAt] = useState(() => getTradingDateTimeInput(Date.now()));
  const [closedAt, setClosedAt] = useState('');
  const [reasonForExit, setReasonForExit] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // بالانس لحظه‌ای حساب سشن، برای محاسبهٔ خودکار درصد ریسک از مبلغ ریسک (و برعکس)
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const live = await accountService.getLiveBalance(session.accountId);
        const account = live === null ? await accountService.getById(session.accountId) : undefined;
        if (!cancelled) setBalance(live ?? account?.currentBalance ?? account?.initialBalance ?? null);
      } catch { if (!cancelled) setBalance(null); }
    })();
    return () => { cancelled = true; };
  }, [session.accountId]);

  const setValue = (key: string, text: string) => setValues(current => {
    const normalized = normalizeDecimalText(text);
    const next = { ...current, [key]: normalized };
    if (key === 'riskAmount') {
      const percent = riskPercentFromAmount(parseDecimalText(normalized), balance);
      if (percent !== null) next.riskPercentage = String(percent);
      else if (normalized === '') next.riskPercentage = '';
    } else if (key === 'riskPercentage') {
      const amount = riskAmountFromPercent(parseDecimalText(normalized), balance);
      if (amount !== null) next.riskAmount = String(amount);
      else if (normalized === '') next.riskAmount = '';
    }
    return next;
  });
  const num = (key: string) => parseDecimalText(values[key] ?? '');

  const previewPnl = useMemo(() => num('profitLoss'), [values]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const entryPrice = num('entryPrice');
    const stopLoss = num('stopLoss');
    if (!symbol.trim()) { toast.error('نماد معامله را وارد کنید.'); return; }
    if (entryPrice === null || entryPrice <= 0) { toast.error('قیمت ورود را وارد کنید.'); return; }
    if (stopLoss === null || stopLoss <= 0) { toast.error('حد ضرر را وارد کنید.'); return; }
    const opened = parseTradingDateTimeInput(openedAt);
    if (Number.isNaN(opened)) { toast.error('زمان ورود معتبر نیست.'); return; }
    const closed = closedAt ? parseTradingDateTimeInput(closedAt) : null;
    if (closed !== null && Number.isNaN(closed)) { toast.error('زمان خروج معتبر نیست.'); return; }
    if (closed !== null && closed < opened) { toast.error('زمان خروج نمی‌تواند قبل از زمان ورود باشد.'); return; }

    const base = {
      direction, entryPrice, stopLoss,
      exitPrice: num('exitPrice'), profitLoss: num('profitLoss'),
      fees: num('fees'), commission: num('commission'), spread: num('spread'),
      riskAmount: num('riskAmount'), closedAt: closed, openedAt: opened,
      status: 'open' as Trade['status'], result: 'open' as Trade['result'],
    };
    const derived = finalizeTradeFields(base);

    setSaving(true);
    let createdId: string | null = null;
    try {
      const trade = await tradeService.createTrade({
        symbol: symbol.trim(),
        direction, entryPrice, stopLoss,
        takeProfit: num('takeProfit'),
        positionSize: num('positionSize'),
        exitPrice: base.exitPrice, profitLoss: base.profitLoss,
        fees: base.fees, commission: base.commission, spread: base.spread,
        riskAmount: base.riskAmount,
        riskPercentage: num('riskPercentage'),
        tags: JSON.stringify(tags),
        openedAt: opened,
        reasonForExit: reasonForExit.trim() || null,
        notes: notes.trim() || null,
        journalSessionId: session.id,
        journalTriggerEventId: trigger.id,
        ...derived,
      });
      createdId = trade.id;
      // همان مسیر فرم قدیمی: ثبت رویداد «خروج» و نسخهٔ معامله برای معاملهٔ بسته‌شده
      if (derived.status === 'closed') {
        await tradeService.updateTrade(trade.id, { ...derived, exitPrice: base.exitPrice, profitLoss: base.profitLoss });
      }
      await journalSessionService.linkTriggerToTrade(trigger.id, trade.id, { applyTriggerDirection: false });
      toast.success('معامله زیر تریگر ثبت شد.');
      await onSaved();
    } catch (cause) {
      // اگر پیوند به تریگر ناموفق بود، معاملهٔ نیمه‌کاره باقی نماند.
      if (createdId) { try { await tradeService.deleteTrade(createdId); } catch { /* خطای اصلی حفظ شود */ } }
      toast.error(cause instanceof Error ? cause.message : 'ثبت معامله انجام نشد.');
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-3" data-testid={`form-trigger-trade-${trigger.id}`}>
      <h4 className="text-sm font-semibold">ثبت معامله</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label className="text-xs">نماد</Label>
          <Input value={symbol} onChange={event => setSymbol(event.target.value)} dir="ltr" data-testid={`input-trade-symbol-${trigger.id}`} /></div>
        <div className="space-y-1.5"><Label className="text-xs">جهت</Label>
          <div className="grid grid-cols-2 gap-2">
            {(['long', 'short'] as const).map(item => (
              <Button key={item} type="button" size="sm" variant={direction === item ? 'default' : 'outline'} onClick={() => setDirection(item)} data-testid={`button-trade-direction-${item}-${trigger.id}`}>{item === 'long' ? 'خرید' : 'فروش'}</Button>
            ))}
          </div></div>
        {FIELDS.map(field => (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-xs">{field.label}{field.required ? ' *' : ''}</Label>
            <Input type="text" inputMode="decimal" dir="ltr" value={values[field.key] ?? ''} onChange={event => setValue(field.key, event.target.value)} data-testid={`input-trade-${field.key}-${trigger.id}`} />
          </div>
        ))}
        <div className="space-y-1.5"><Label className="text-xs">زمان ورود</Label>
          <Input type="datetime-local" value={openedAt} onChange={event => setOpenedAt(event.target.value)} data-testid={`input-trade-opened-${trigger.id}`} /></div>
        <div className="space-y-1.5"><Label className="text-xs">زمان خروج</Label>
          <Input type="datetime-local" value={closedAt} onChange={event => setClosedAt(event.target.value)} data-testid={`input-trade-closed-${trigger.id}`} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">دلیل خروج</Label>
          <Input value={reasonForExit} onChange={event => setReasonForExit(event.target.value)} data-testid={`input-trade-exit-reason-${trigger.id}`} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">یادداشت معامله</Label>
          <Textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} data-testid={`input-trade-notes-${trigger.id}`} /></div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">برچسب‌های معامله</Label>
        <Input
          placeholder="با Enter برچسب اضافه کنید (مثلاً FVG، اسکالپ)"
          onKeyDown={event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const value = event.currentTarget.value.trim();
            if (value && !tags.includes(value)) { setTags(current => [...current, value]); event.currentTarget.value = ''; }
          }}
          data-testid={`input-trade-tags-${trigger.id}`}
        />
        {tags.length > 0 && <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">
              {tag}
              <button type="button" aria-label={`حذف برچسب ${tag}`} onClick={() => setTags(current => current.filter(item => item !== tag))}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>}
      </div>
      {balance !== null && <p className="text-[11px] leading-5 text-muted-foreground" data-testid={`text-account-balance-${trigger.id}`}>
        بالانس حساب: <span className="font-mono" dir="ltr">{balance.toLocaleString()}</span> — با وارد کردن مبلغ ریسک، درصد ریسک خودکار محاسبه می‌شود (و برعکس).
      </p>}
      <p className="text-[11px] leading-5 text-muted-foreground">
        {previewPnl !== null ? 'با ثبت سود/زیان، معامله «بسته‌شده» و نتیجه (برد/باخت) و R خودکار محاسبه می‌شود.' : 'اگر سود/زیان یا قیمت خروج خالی باشد، معامله «باز» ثبت می‌شود.'}
      </p>
      <Button type="button" onClick={() => void save()} disabled={saving} className="gap-2" data-testid={`button-save-trigger-trade-${trigger.id}`}><Save className="h-4 w-4" />{saving ? 'در حال ثبت…' : 'ثبت کامل معامله'}</Button>
    </div>
  );
}

/** خلاصهٔ فقط‌خواندنی معامله‌ای که قبلاً به تریگر وصل شده است. */
export function TriggerTradeSummary({ trade, onChanged }: { trade: Trade; onChanged?: () => void | Promise<void> }) {
  const [showShots, setShowShots] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const rows: [string, string][] = [
    ['نماد', trade.symbol],
    ['جهت', trade.direction === 'long' ? 'خرید' : 'فروش'],
    ['ورود', String(trade.entryPrice)],
    ['حد ضرر', String(trade.stopLoss)],
    ['حد سود', trade.takeProfit != null ? String(trade.takeProfit) : '—'],
    ['خروج', trade.exitPrice != null ? String(trade.exitPrice) : '—'],
    ['سود/زیان', trade.profitLoss != null ? String(trade.profitLoss) : '—'],
    ['R', trade.rMultiple != null ? `${trade.rMultiple}R` : '—'],
  ];
  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-3" data-testid={`summary-trigger-trade-${trade.id}`}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {rows.map(([label, value]) => <div key={label} className="min-w-0"><span className="text-muted-foreground">{label}: </span><span className="font-mono" dir="ltr">{value}</span></div>)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowReflection(value => !value)} data-testid={`button-trade-reflection-${trade.id}`}>{showReflection ? 'بستن روانشناسی و مرور' : 'روانشناسی و مرور'}</button>
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowShots(value => !value)} data-testid={`button-trade-screenshots-${trade.id}`}>{showShots ? 'بستن اسکرین‌شات معامله' : 'اسکرین‌شات معامله'}</button>
        <Link href={`/journal/trades/${trade.id}`} className="text-xs text-primary hover:underline" data-testid={`link-edit-trade-${trade.id}`}>ویرایش کامل معامله</Link>
      </div>
      {showReflection && <TradeReflectionForm trade={trade} onSaved={async () => { await onChanged?.(); }} />}
      {showShots && <div className="mt-3" data-testid={`screenshots-trade-${trade.id}`}>
        <ScreenshotManager
          trade={trade}
          onChange={async screenshots => {
            try {
              await tradeService.updateTrade(trade.id, { screenshots: JSON.stringify(screenshots) });
              await onChanged?.();
            } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ اسکرین‌شات انجام نشد.'); }
          }}
        />
      </div>}
    </div>
  );
}
