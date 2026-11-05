import { useState, type ReactNode } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { tradeService } from '../../services/tradeService';
import type { Trade } from '../../db/database';

/**
 * مقادیر دقیقاً همانی است که فرم قدیمی ثبت معامله ذخیره می‌کرد
 * (شناسه‌های احساسات، rating پایبندی، ساختار JSON مرور، فلگ‌های مدیریت)،
 * تا گزارش‌های روانشناسی و عملکرد بدون هیچ تغییری از همین فیلدها بخوانند.
 */
const EMOTIONS = [
  { id: 'Calm', label: 'آرام' }, { id: 'Confident', label: 'مطمئن' }, { id: 'Uncertain', label: 'نامطمئن' },
  { id: 'Fearful', label: 'ترسیده' }, { id: 'Anxious', label: 'مضطرب' }, { id: 'Excited', label: 'هیجان‌زده' },
  { id: 'Frustrated', label: 'ناکام' }, { id: 'FOMO', label: 'ترس از دست دادن' },
  { id: 'Revenge Trading', label: 'معامله انتقامی' }, { id: 'Overconfident', label: 'بیش از حد مطمئن' },
  { id: 'Tired', label: 'خسته' }, { id: 'Distracted', label: 'حواس‌پرت' },
];
const ADHERENCE = [
  { v: 'fully', l: 'کاملاً طبق قوانین' }, { v: 'mostly', l: 'تقریباً طبق قوانین' },
  { v: 'partially', l: 'تا حدی' }, { v: 'not', l: 'طبق قوانین نبود' },
] as const;
const MANAGEMENT = [
  { key: 'slMoved', label: 'جابجایی حد ضرر' }, { key: 'tpMoved', label: 'جابجایی حد سود' },
  { key: 'partialClose', label: 'بستن بخشی از پوزیشن' }, { key: 'addedToPosition', label: 'افزودن به پوزیشن' },
  { key: 'reducedPosition', label: 'کاهش پوزیشن' }, { key: 'manualExit', label: 'خروج دستی' },
] as const;
type ManagementKey = typeof MANAGEMENT[number]['key'];
type ReviewData = { didWell?: string; didWrong?: string; wouldTakeAgain?: string; validSetup?: string };

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try { return value ? (JSON.parse(value) as T) : fallback; } catch { return fallback; }
}

function Choice({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${active ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted'}`}>
      {children}
    </button>
  );
}

export function TradeReflectionForm({ trade, onSaved }: { trade: Trade; onSaved: () => void | Promise<void> }) {
  const [emotions, setEmotions] = useState<string[]>(() => parseJson<string[]>(trade.emotions, []));
  const [emotionNotes, setEmotionNotes] = useState(trade.emotionNotes ?? '');
  const [adherenceRating, setAdherenceRating] = useState<Trade['adherenceRating']>(trade.adherenceRating ?? null);
  const [adherenceNotes, setAdherenceNotes] = useState(trade.adherenceNotes ?? '');
  const [review, setReview] = useState<ReviewData>(() => parseJson<ReviewData>(trade.review, {}));
  const [flags, setFlags] = useState<Record<ManagementKey, boolean | null>>(() => ({
    slMoved: trade.slMoved ?? null, tpMoved: trade.tpMoved ?? null, partialClose: trade.partialClose ?? null,
    addedToPosition: trade.addedToPosition ?? null, reducedPosition: trade.reducedPosition ?? null, manualExit: trade.manualExit ?? null,
  }));
  const [managementReason, setManagementReason] = useState(trade.managementReason ?? '');
  const [saving, setSaving] = useState(false);

  const toggleEmotion = (id: string) => setEmotions(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const cycleFlag = (key: ManagementKey) => setFlags(current => ({ ...current, [key]: current[key] === true ? false : current[key] === false ? null : true }));

  const save = async () => {
    setSaving(true);
    try {
      await tradeService.updateTrade(trade.id, {
        emotions: JSON.stringify(emotions),
        emotionNotes: emotionNotes.trim() || null,
        adherenceRating,
        adherenceNotes: adherenceNotes.trim() || null,
        review: JSON.stringify(review),
        managementReason: managementReason.trim() || null,
        ...flags,
      });
      toast.success('روانشناسی و مرور معامله ذخیره شد.');
      await onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ مرور انجام نشد.');
    } finally { setSaving(false); }
  };

  const setReviewField = (key: keyof ReviewData, value: string) => setReview(current => ({ ...current, [key]: value }));

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-border/70 bg-muted/10 p-3" data-testid={`form-trade-reflection-${trade.id}`}>
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">وضعیت احساسی</h4>
        <div className="flex flex-wrap gap-2">
          {EMOTIONS.map(item => <Choice key={item.id} active={emotions.includes(item.id)} onClick={() => toggleEmotion(item.id)} testId={`choice-emotion-${item.id}-${trade.id}`}>{item.label}</Choice>)}
        </div>
        <Textarea rows={2} placeholder="یادداشت احساسات (اختیاری)" value={emotionNotes} onChange={event => setEmotionNotes(event.target.value)} data-testid={`input-emotion-notes-${trade.id}`} />
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">پایبندی به قوانین استراتژی</h4>
        <div className="flex flex-wrap gap-2">
          {ADHERENCE.map(item => <Choice key={item.v} active={adherenceRating === item.v} onClick={() => setAdherenceRating(current => current === item.v ? null : item.v)} testId={`choice-adherence-${item.v}-${trade.id}`}>{item.l}</Choice>)}
        </div>
        <Textarea rows={2} placeholder="اگر از قوانین منحرف شدید، چرا؟" value={adherenceNotes} onChange={event => setAdherenceNotes(event.target.value)} data-testid={`input-adherence-notes-${trade.id}`} />
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">مدیریت معامله</h4>
        <p className="text-[11px] text-muted-foreground">هر ضربه: بله ← خیر ← نامشخص</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MANAGEMENT.map(item => {
            const value = flags[item.key];
            return (
              <button key={item.key} type="button" onClick={() => cycleFlag(item.key)} data-testid={`toggle-${item.key}-${trade.id}`}
                className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-right text-sm ${value === true ? 'border-primary bg-primary/10 text-primary' : value === false ? 'border-border text-muted-foreground/60' : 'border-border hover:border-primary/40'}`}>
                <span>{item.label}</span>
                <span className="text-[11px]">{value === true ? 'بله' : value === false ? 'خیر' : '—'}</span>
              </button>
            );
          })}
        </div>
        <Textarea rows={2} placeholder="دلیل تصمیم‌های مدیریتی (مثلاً چرا حد ضرر را جابجا کردید؟)" value={managementReason} onChange={event => setManagementReason(event.target.value)} data-testid={`input-management-reason-${trade.id}`} />
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold">مرور معامله</h4>
        <div className="space-y-1.5"><Label className="text-xs">چه کار خوبی انجام دادم؟</Label>
          <Textarea rows={2} value={review.didWell ?? ''} onChange={event => setReviewField('didWell', event.target.value)} data-testid={`input-review-did-well-${trade.id}`} /></div>
        <div className="space-y-1.5"><Label className="text-xs">چه اشتباهی کردم؟</Label>
          <Textarea rows={2} value={review.didWrong ?? ''} onChange={event => setReviewField('didWrong', event.target.value)} data-testid={`input-review-did-wrong-${trade.id}`} /></div>
        <div className="space-y-1.5"><Label className="text-xs">دوباره این معامله را می‌گرفتم؟</Label>
          <div className="flex gap-2">{([['yes', 'بله'], ['no', 'خیر'], ['maybe', 'شاید']] as const).map(([value, label]) =>
            <Choice key={value} active={review.wouldTakeAgain === value} onClick={() => setReviewField('wouldTakeAgain', value)} testId={`choice-again-${value}-${trade.id}`}>{label}</Choice>)}</div></div>
        <div className="space-y-1.5"><Label className="text-xs">ستاپ معتبر بود؟</Label>
          <div className="flex gap-2">{([['yes', 'بله'], ['no', 'خیر'], ['unclear', 'نامشخص']] as const).map(([value, label]) =>
            <Choice key={value} active={review.validSetup === value} onClick={() => setReviewField('validSetup', value)} testId={`choice-valid-${value}-${trade.id}`}>{label}</Choice>)}</div></div>
      </section>

      <Button type="button" onClick={() => void save()} disabled={saving} className="gap-2" data-testid={`button-save-reflection-${trade.id}`}><Save className="h-4 w-4" />{saving ? 'در حال ذخیره…' : 'ذخیرهٔ روانشناسی و مرور'}</Button>
    </div>
  );
}
