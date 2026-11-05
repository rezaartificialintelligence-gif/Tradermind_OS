/**
 * VisualFeatureEditor — ویژگی‌های بصری کاملاً قابل ویرایش
 * ─────────────────────────────────────────────────────────
 * - هر ویژگی (پیشنهادی یا دستی): تأیید / رد / ویرایش نام، دسته، اطمینان و توضیح / حذف
 * - افزودن ویژگی از فهرست آماده یا با نام دلخواه
 */

import { useState } from 'react';
import {
  VisualFeature,
  FEATURE_LABELS,
  FEATURE_CATEGORIES,
  VisualFeatureCategory,
  ConfidenceLevel,
} from '../types/screenshot';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Check, X, Plus, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

function uid() { return crypto.randomUUID(); }

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  low: 'کم', medium: 'متوسط', high: 'بالا',
};

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  low: 'border-orange-500/40 text-orange-400',
  medium: 'border-amber-500/40 text-amber-400',
  high: 'border-green-500/40 text-green-400',
};

const CATEGORY_LABELS: Record<VisualFeatureCategory, string> = {
  'price-action': 'پرایس اکشن',
  'structure': 'ساختار',
  'retracement': 'پولبک',
  'range': 'رفتار رنج',
  'reaction': 'واکنش',
  'fibonacci': 'فیبوناچی',
};

/** نام فارسی را به کد ویژگی استاندارد برمی‌گرداند؛ اگر نبود خود متن، ویژگی دلخواه است */
function valueForName(name: string): string {
  const entry = Object.entries(FEATURE_LABELS).find(([, label]) => label === name);
  return entry ? entry[0] : name;
}

interface Props {
  features: VisualFeature[];
  userAddedFeatures: VisualFeature[];
  onChange: (extracted: VisualFeature[], userAdded: VisualFeature[]) => void;
}

interface EditDraft {
  name: string;
  category: VisualFeatureCategory;
  confidence: ConfidenceLevel;
  notes: string;
}

export default function VisualFeatureEditor({ features, userAddedFeatures, onChange }: Props) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addCategory, setAddCategory] = useState<VisualFeatureCategory>('price-action');
  const [addValue, setAddValue] = useState('');
  const [customName, setCustomName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const isUserFeature = (id: string) => userAddedFeatures.some(f => f.id === id);
  const displayName = (f: VisualFeature) =>
    f.correctedValue ? FEATURE_LABELS[f.correctedValue] ?? f.correctedValue : f.label;

  const updateFeature = (id: string, patch: Partial<VisualFeature>) => {
    onChange(
      features.map(f => (f.id === id ? { ...f, ...patch } : f)),
      userAddedFeatures.map(f => (f.id === id ? { ...f, ...patch } : f)),
    );
  };

  const removeFeature = (id: string) => {
    onChange(features.filter(f => f.id !== id), userAddedFeatures.filter(f => f.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const addFeature = () => {
    const name = customName.trim() || (addValue ? FEATURE_LABELS[addValue] ?? addValue : '');
    if (!name) return;
    const feature: VisualFeature = {
      id: uid(),
      category: addCategory,
      label: name,
      value: customName.trim() ? valueForName(name) : addValue,
      confidence: 'high',
      notes: null,
      source: 'user',
      confirmed: true,
      correctedValue: null,
      correctionNote: null,
    };
    onChange(features, [...userAddedFeatures, feature]);
    setAddValue('');
    setCustomName('');
    setShowAddPanel(false);
  };

  const startEdit = (f: VisualFeature) => {
    setEditingId(f.id);
    setDraft({
      name: displayName(f),
      category: f.category,
      confidence: f.confidence,
      notes: (isUserFeature(f.id) ? f.notes : f.correctionNote ?? f.notes) ?? '',
    });
  };

  const saveEdit = (f: VisualFeature) => {
    if (!draft) return;
    const name = draft.name.trim() || displayName(f);
    const notes = draft.notes.trim() || null;
    if (isUserFeature(f.id)) {
      updateFeature(f.id, {
        label: name, value: valueForName(name),
        category: draft.category, confidence: draft.confidence, notes,
      });
    } else {
      // برای ویژگی پیشنهادی، مقدار اصلی حفظ می‌شود و اصلاح کاربر جدا ثبت می‌شود
      const renamed = name !== f.label;
      updateFeature(f.id, {
        correctedValue: renamed ? valueForName(name) : null,
        correctionNote: notes,
        category: draft.category,
        confidence: draft.confidence,
      });
    }
    setEditingId(null);
    setDraft(null);
  };

  const availableFeatures = FEATURE_CATEGORIES.find(c => c.id === addCategory)?.features ?? [];
  const all = [...features, ...userAddedFeatures];
  const confirmedCount = all.filter(f => f.confirmed === true).length;
  const rejectedCount = all.filter(f => f.confirmed === false).length;
  const pendingCount = all.filter(f => f.confirmed === null).length;

  const renderEditPanel = (f: VisualFeature) => {
    if (editingId !== f.id || !draft) return null;
    return (
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">نام ویژگی (هر متنی بنویسید یا از فهرست انتخاب کنید):</p>
          <Input
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
            className="h-8 text-xs"
            aria-label="نام ویژگی"
          />
          <Select value="" onValueChange={v => setDraft({ ...draft, name: FEATURE_LABELS[v] ?? v })}>
            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="انتخاب از فهرست آماده" /></SelectTrigger>
            <SelectContent>
              {Object.entries(FEATURE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Select value={draft.category} onValueChange={v => setDraft({ ...draft, category: v as VisualFeatureCategory })}>
            <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FEATURE_CATEGORIES.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={draft.confidence} onValueChange={v => setDraft({ ...draft, confidence: v as ConfidenceLevel })}>
            <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CONFIDENCE_LABELS) as ConfidenceLevel[]).map(c => (
                <SelectItem key={c} value={c} className="text-xs">اطمینان: {CONFIDENCE_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          value={draft.notes}
          onChange={e => setDraft({ ...draft, notes: e.target.value })}
          placeholder="توضیح یا مشاهده‌ی شما"
          className="h-8 text-xs"
          aria-label="توضیح"
        />
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(f)}>ذخیره</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingId(null); setDraft(null); }}>لغو</Button>
        </div>
      </div>
    );
  };

  const renderRow = (f: VisualFeature) => {
    const user = isUserFeature(f.id);
    return (
      <div
        key={f.id}
        className={cn(
          'rounded-lg border p-3 transition-all',
          f.confirmed === true && 'border-green-500/30 bg-green-500/5',
          f.confirmed === false && 'border-red-500/20 bg-red-500/5 opacity-60',
          f.confirmed === null && 'border-white/10 bg-white/3',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{displayName(f)}</span>
            {f.correctedValue && f.correctedValue !== f.value && (
              <span className="text-xs text-muted-foreground line-through">{f.label}</span>
            )}
            <span className={cn('rounded border px-1.5 py-0.5 text-xs', CONFIDENCE_COLORS[f.confidence])}>
              {CONFIDENCE_LABELS[f.confidence]}
            </span>
            <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[f.category]}</span>
            <span className={cn('text-xs', user ? 'text-blue-400' : 'text-violet-400')}>{user ? 'دستی' : 'AI'}</span>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            {f.confirmed === false ? (
              <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => updateFeature(f.id, { confirmed: null })}>
                بازگردانی
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost" size="sm"
                  className={cn('h-6 w-6 p-0', f.confirmed === true && 'text-green-400')}
                  onClick={() => updateFeature(f.id, { confirmed: f.confirmed === true ? null : true })}
                  title="تأیید"
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                  onClick={() => updateFeature(f.id, { confirmed: false })}
                  title="رد"
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
            <Button
              variant="ghost" size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-blue-400"
              onClick={() => (editingId === f.id ? (setEditingId(null), setDraft(null)) : startEdit(f))}
              title="ویرایش"
              aria-label="ویرایش ویژگی"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
              onClick={() => removeFeature(f.id)}
              title="حذف"
              aria-label="حذف ویژگی"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {editingId !== f.id && (user ? f.notes : f.correctionNote) && (
          <p className="mt-1 text-xs italic text-blue-400">{user ? f.notes : f.correctionNote}</p>
        )}
        {renderEditPanel(f)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-green-500/30 bg-green-500/15 px-2 py-0.5 text-green-400">✓ {confirmedCount} تأیید</span>
        <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-red-400">✗ {rejectedCount} رد</span>
        {pendingCount > 0 && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-amber-400">⏳ {pendingCount} در انتظار بررسی</span>
        )}
      </div>

      {features.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">ویژگی‌های پیشنهادی (تأیید، رد، ویرایش یا حذف کنید):</p>
          <div className="space-y-2">{features.map(renderRow)}</div>
        </div>
      )}

      {userAddedFeatures.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">ویژگی‌های اضافه‌شده توسط شما:</p>
          <div className="space-y-2">{userAddedFeatures.map(renderRow)}</div>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-white/20">
        <button
          type="button"
          className="flex w-full items-center justify-between p-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setShowAddPanel(v => !v)}
        >
          <span className="flex items-center gap-2"><Plus className="h-4 w-4" />افزودن ویژگی بصری</span>
          {showAddPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showAddPanel && (
          <div className="space-y-2 border-t border-white/10 px-3 pb-3">
            <div className="flex gap-2 pt-2">
              <Select value={addCategory} onValueChange={v => { setAddCategory(v as VisualFeatureCategory); setAddValue(''); }}>
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FEATURE_CATEGORIES.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={addValue} onValueChange={setAddValue}>
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="ویژگی" /></SelectTrigger>
                <SelectContent>
                  {availableFeatures.map(v => (
                    <SelectItem key={v} value={v} className="text-xs">{FEATURE_LABELS[v] ?? v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="یا نام ویژگی دلخواه را بنویسید"
              className="h-8 text-xs"
              aria-label="ویژگی دلخواه"
            />
            <Button size="sm" className="h-7 w-full text-xs" onClick={addFeature} disabled={!addValue && !customName.trim()}>
              افزودن
            </Button>
          </div>
        )}
      </div>

      {all.length === 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">هیچ ویژگی بصری ثبت نشده — از بخش بالا اضافه کنید</p>
      )}
    </div>
  );
}
