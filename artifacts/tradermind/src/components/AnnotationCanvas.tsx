/**
 * AnnotationCanvas — ابزار ترسیم روی اسکرین‌شات‌ها
 * ─────────────────────────────────────────────────
 * ابزارها: مربع، دایره، خط عمودی، خط افقی، خط زاویه‌دار (+ حالت انتخاب/ویرایش).
 * «نقش» (نقطه ورود، حد ضرر، حد سود، حمایت، مقاومت، ...) فقط عنوان و رنگ پیش‌فرض شکل را تعیین می‌کند
 * و روی هر شکلی قابل اعمال است. همه‌ی شکل‌ها بعد از رسم قابل جابه‌جایی، تغییر اندازه،
 * تغییر عنوان/رنگ/ضخامت، کپی و حذف هستند. تصویر اصلی هرگز تغییر نمی‌کند.
 */

import { useRef, useEffect, useState, useCallback, useLayoutEffect, memo } from 'react';
import {
  ScreenshotAnnotation,
  AnnotationType,
  AnnotationPoint,
  ANNOTATION_LABELS,
  ANNOTATION_SHAPE_LABELS,
} from '../types/screenshot';
import {
  DrawableShape,
  HandleId,
  drawAnnotation,
  dragHandle,
  hitBody,
  hitHandle,
  isFilled,
  isTooSmall,
  pointsForShape,
  resolveShape,
  toHexColor,
  translateAnnotation,
  clamp01,
} from '../lib/annotationGeometry';
import { Button } from './ui/button';
import { VoiceTypingButton } from './ui/VoiceTypingButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { MousePointer2, Undo2, Trash2, Copy, X, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';

export const ANNOTATION_COLORS: Record<string, string> = {
  entry: '#22c55e',
  'stop-loss': '#ef4444',
  'take-profit': '#3b82f6',
  support: '#10b981',
  resistance: '#f59e0b',
  liquidity: '#a855f7',
  fibonacci: '#ec4899',
  'impulse-start': '#06b6d4',
  'impulse-end': '#0891b2',
  'range-high': '#f59e0b',
  'range-low': '#f59e0b',
  'important-candle': '#f97316',
  zone: '#fbbf24',
  arrow: '#94a3b8',
  label: '#e2e8f0',
  custom: '#e2e8f0',
};

const defaultColor = (type: AnnotationType) => ANNOTATION_COLORS[type] ?? '#94a3b8';

type Tool = 'select' | DrawableShape;

/** آیکن‌های ساده‌ی ابزارها (هم‌سبک و بدون وابستگی) */
function ShapeIcon({ shape }: { shape: DrawableShape }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      {shape === 'rect' && <rect x="4" y="6" width="16" height="12" rx="1" {...common} />}
      {shape === 'ellipse' && <ellipse cx="12" cy="12" rx="8" ry="6.5" {...common} />}
      {shape === 'vline' && <line x1="12" y1="3" x2="12" y2="21" {...common} />}
      {shape === 'hline' && <line x1="3" y1="12" x2="21" y2="12" {...common} />}
      {shape === 'line' && <line x1="4" y1="19" x2="20" y2="5" {...common} />}
    </svg>
  );
}

const DRAW_TOOLS: DrawableShape[] = ['rect', 'ellipse', 'vline', 'hline', 'line'];

const TOOL_HINT: Record<Tool, string> = {
  select: 'روی شکل بزنید تا انتخاب شود؛ بکشید تا جابه‌جا شود؛ با دایره‌های سفید اندازه را تغییر دهید',
  rect: 'بکشید تا مربع رسم شود',
  ellipse: 'بکشید تا دایره رسم شود',
  vline: 'لمس کنید تا خط عمودی قرار گیرد (می‌توانید همان‌جا بکشید)',
  hline: 'لمس کنید تا خط افقی قرار گیرد (می‌توانید همان‌جا بکشید)',
  line: 'از نقطه شروع تا پایان بکشید',
};

const STROKE_WIDTHS = [1, 2, 3, 5];

type Gesture =
  | { kind: 'draw'; shape: DrawableShape; start: AnnotationPoint }
  | {
      kind: 'move' | 'handle';
      id: string;
      handle?: HandleId;
      last: AnnotationPoint;
      before: ScreenshotAnnotation[];
      working: ScreenshotAnnotation[];
      moved: boolean;
      recorded: boolean; // قبلاً در تاریخچه ثبت شده (مثلاً شکل تازه‌ساخته)
    };

interface Props {
  imageDataUrl: string;
  annotations: ScreenshotAnnotation[];
  onChange: (annotations: ScreenshotAnnotation[]) => void;
  readOnly?: boolean;
}

function uid(): string {
  return crypto.randomUUID();
}

function AnnotationCanvas({ imageDataUrl, annotations, onChange, readOnly = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const historyRef = useRef<ScreenshotAnnotation[][]>([]);
  const lastEditRef = useRef<{ key: string; at: number } | null>(null);

  const [tool, setTool] = useState<Tool>('select');
  const [role, setRole] = useState<AnnotationType>('entry');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScreenshotAnnotation | null>(null);
  const [live, setLive] = useState<ScreenshotAnnotation[] | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ w: 1000, h: 600 });
  const [imageReady, setImageReady] = useState(false);
  const [historyLength, setHistoryLength] = useState(0);
  const [resizeTick, setResizeTick] = useState(0);

  const current = live ?? annotations;
  const selected = current.find(a => a.id === selectedId) ?? null;

  // وقتی مقدار جدید از والد رسید، نسخه‌ی موقت کشیدن را کنار بگذار
  useEffect(() => {
    setLive(null);
  }, [annotations]);

  // بارگذاری تصویر و تنظیم اندازه‌ی canvas بر اساس ابعاد واقعی تصویر (بدون کشیدگی)
  useEffect(() => {
    setImageReady(false);
    if (!imageDataUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      imgRef.current = img;
      setCanvasSize({
        w: Math.max(1, Math.round(img.naturalWidth * scale)),
        h: Math.max(1, Math.round(img.naturalHeight * scale)),
      });
      setImageReady(true);
    };
    img.src = imageDataUrl;
    return () => { cancelled = true; };
  }, [imageDataUrl]);

  // با تغییر اندازه‌ی نمایش، ضخامت‌ها دوباره محاسبه شوند
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setResizeTick(t => t + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imageReady) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    const displayWidth = canvas.getBoundingClientRect().width;
    const k = displayWidth > 0 ? w / displayWidth : 1;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    if (!showAnnotations) return;
    for (const ann of current) {
      drawAnnotation(ctx, ann, w, h, { k, selected: !readOnly && ann.id === selectedId });
    }
    if (draft) drawAnnotation(ctx, draft, w, h, { k, selected: false });
  }, [current, draft, selectedId, showAnnotations, imageReady, readOnly]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas, canvasSize, resizeTick]);

  // ── کمکی‌ها ──────────────────────────────────────────────────────

  const getPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = { w: rect.width || 1, h: rect.height || 1 };
    const pt = {
      x: clamp01((e.clientX - rect.left) / size.w),
      y: clamp01((e.clientY - rect.top) / size.h),
    };
    return { pt, size, tol: e.pointerType === 'touch' ? 20 : 10 };
  };

  const pushHistory = (snapshot: ScreenshotAnnotation[]) => {
    historyRef.current = [...historyRef.current.slice(-49), snapshot];
    setHistoryLength(historyRef.current.length);
  };

  const commit = (next: ScreenshotAnnotation[], before: ScreenshotAnnotation[] = annotations) => {
    pushHistory(before);
    onChange(next);
  };

  const makeAnnotation = (shape: DrawableShape, points: AnnotationPoint[]): ScreenshotAnnotation => ({
    id: uid(),
    type: role,
    label: ANNOTATION_LABELS[role],
    points,
    color: defaultColor(role),
    createdAt: Date.now(),
    shape,
    strokeWidth: 2,
    filled: shape === 'rect' || shape === 'ellipse' ? true : undefined,
  });

  // ── ژست‌ها (ماوس و لمس با Pointer Events) ─────────────────────────

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { pt, size, tol } = getPointer(e);

    if (tool === 'select') {
      const sel = current.find(a => a.id === selectedId);
      if (sel) {
        const handle = hitHandle(sel, pt, size, tol + 6);
        if (handle) {
          gestureRef.current = {
            kind: 'handle', id: sel.id, handle, last: pt,
            before: current, working: current, moved: false, recorded: false,
          };
          return;
        }
      }
      for (let i = current.length - 1; i >= 0; i -= 1) {
        if (hitBody(current[i], pt, size, tol)) {
          setSelectedId(current[i].id);
          gestureRef.current = {
            kind: 'move', id: current[i].id, last: pt,
            before: current, working: current, moved: false, recorded: false,
          };
          return;
        }
      }
      setSelectedId(null);
      return;
    }

    if (tool === 'vline' || tool === 'hline') {
      // خط بلافاصله قرار می‌گیرد و می‌شود همان‌جا کشیدش
      const ann = makeAnnotation(tool, pointsForShape(tool, pt, pt));
      const next = [...annotations, ann];
      commit(next);
      setLive(next);
      setSelectedId(ann.id);
      setTool('select');
      gestureRef.current = {
        kind: 'move', id: ann.id, last: pt,
        before: next, working: next, moved: false, recorded: true,
      };
      return;
    }

    gestureRef.current = { kind: 'draw', shape: tool, start: pt };
    setDraft(makeAnnotation(tool, [pt, pt]));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || readOnly) return;
    const { pt } = getPointer(e);

    if (gesture.kind === 'draw') {
      setDraft(prev => (prev ? { ...prev, points: [gesture.start, pt] } : prev));
      return;
    }
    const dx = pt.x - gesture.last.x;
    const dy = pt.y - gesture.last.y;
    gesture.working = gesture.working.map(a => {
      if (a.id !== gesture.id) return a;
      return gesture.kind === 'handle' && gesture.handle
        ? dragHandle(a, gesture.handle, pt)
        : translateAnnotation(a, dx, dy);
    });
    gesture.last = pt;
    gesture.moved = true;
    setLive(gesture.working);
  };

  const finishGesture = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || readOnly) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    if (gesture.kind === 'draw') {
      const { size } = getPointer(e);
      const ann = draft;
      setDraft(null);
      if (cancelled || !ann || isTooSmall(gesture.shape, ann.points, size)) return;
      commit([...annotations, ann]);
      setSelectedId(ann.id);
      setTool('select');
      return;
    }

    if (cancelled || !gesture.moved) {
      setLive(null);
      return;
    }
    if (!gesture.recorded) pushHistory(gesture.before);
    onChange(gesture.working);
  };

  // ── ویرایش شکل انتخاب‌شده ────────────────────────────────────────

  const updateSelected = (patch: Partial<ScreenshotAnnotation>, key: string) => {
    if (!selected) return;
    const now = Date.now();
    const last = lastEditRef.current;
    // ویرایش‌های پشت‌سرهم یک فیلد (مثل تایپ) فقط یک مرحله در تاریخچه می‌شوند
    if (!last || last.key !== `${selected.id}:${key}` || now - last.at > 1500) pushHistory(annotations);
    lastEditRef.current = { key: `${selected.id}:${key}`, at: now };
    onChange(annotations.map(a => (a.id === selected.id ? { ...a, ...patch } : a)));
  };

  const changeRole = (next: AnnotationType) => {
    if (!selected) return;
    const labelWasDefault = selected.label === ANNOTATION_LABELS[selected.type];
    const colorWasDefault = toHexColor(selected.color) === toHexColor(defaultColor(selected.type));
    updateSelected({
      type: next,
      shape: resolveShape(selected),
      label: labelWasDefault ? ANNOTATION_LABELS[next] : selected.label,
      color: colorWasDefault ? defaultColor(next) : selected.color,
    }, 'role');
  };

  const removeAnnotation = (id: string) => {
    commit(annotations.filter(a => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const offset = 0.03;
    const moved = translateAnnotation(selected, offset, offset);
    const copy: ScreenshotAnnotation = { ...moved, id: uid(), createdAt: Date.now(), shape: resolveShape(selected) };
    commit([...annotations, copy]);
    setSelectedId(copy.id);
  };

  const undo = () => {
    const previous = historyRef.current.pop();
    setHistoryLength(historyRef.current.length);
    if (!previous) return;
    onChange(previous);
    if (selectedId && !previous.some(a => a.id === selectedId)) setSelectedId(null);
  };

  const clearAll = () => {
    if (!annotations.length) return;
    commit([]);
    setSelectedId(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      e.preventDefault();
      removeAnnotation(selectedId);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (e.key === 'Escape') {
      setSelectedId(null);
      setTool('select');
    }
  };

  const selectedShape = selected ? resolveShape(selected) : null;

  return (
    <div className="space-y-3">
      {/* نوار ابزار */}
      {!readOnly && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={tool === 'select' ? 'default' : 'outline'}
              className="h-8 gap-1 px-2 text-xs"
              onClick={() => setTool('select')}
              aria-pressed={tool === 'select'}
            >
              <MousePointer2 className="h-4 w-4" />
              انتخاب
            </Button>
            {DRAW_TOOLS.map(shape => (
              <Button
                key={shape}
                type="button"
                size="sm"
                variant={tool === shape ? 'default' : 'outline'}
                className="h-8 gap-1 px-2 text-xs"
                onClick={() => { setTool(shape); setSelectedId(null); }}
                aria-pressed={tool === shape}
                title={ANNOTATION_SHAPE_LABELS[shape]}
              >
                <ShapeIcon shape={shape} />
                {ANNOTATION_SHAPE_LABELS[shape]}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={role} onValueChange={v => setRole(v as AnnotationType)}>
              <SelectTrigger className="h-8 w-44 text-xs" aria-label="نقش شکل جدید">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ANNOTATION_LABELS) as AnnotationType[]).map(t => (
                  <SelectItem key={t} value={t} className="text-xs">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: defaultColor(t) }} />
                      {ANNOTATION_LABELS[t]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="mr-auto flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={undo} disabled={historyLength === 0} title="بازگردانی (Undo)">
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAnnotations(v => !v)} title={showAnnotations ? 'پنهان کردن' : 'نمایش'}>
                {showAnnotations ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearAll} title="پاک کردن همه" disabled={annotations.length === 0}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* بوم */}
      <div
        className="relative overflow-hidden rounded-lg border border-white/10 outline-none"
        tabIndex={readOnly ? -1 : 0}
        onKeyDown={onKeyDown}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          className="block h-auto w-full"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={e => finishGesture(e, false)}
          onPointerCancel={e => finishGesture(e, true)}
          style={{ cursor: readOnly ? 'default' : tool === 'select' ? 'default' : 'crosshair', touchAction: readOnly ? 'auto' : 'none' }}
        />
        {!readOnly && (
          <div className="pointer-events-none absolute right-2 top-2 max-w-[85%] rounded bg-black/60 px-2 py-1 text-[11px] text-white backdrop-blur-sm">
            {TOOL_HINT[tool]}
          </div>
        )}
      </div>

      {/* پنل ویرایش شکل انتخاب‌شده */}
      {!readOnly && selected && (
        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              ویرایش {selectedShape ? ANNOTATION_SHAPE_LABELS[selectedShape] : 'شکل'}
            </span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={duplicateSelected} title="کپی">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-red-400 hover:text-red-300" onClick={() => removeAnnotation(selected.id)} title="حذف">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-36 flex-1">
              <div className="flex h-5 justify-end">
                <VoiceTypingButton targetRef={labelInputRef} />
              </div>
              <input
                ref={labelInputRef}
                value={selected.label}
                onChange={e => updateSelected({ label: e.target.value }, 'label')}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                aria-label="عنوان شکل"
                placeholder="عنوان"
              />
            </div>
            <Select value={selected.type} onValueChange={v => changeRole(v as AnnotationType)}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="نقش شکل">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ANNOTATION_LABELS) as AnnotationType[]).map(t => (
                  <SelectItem key={t} value={t} className="text-xs">{ANNOTATION_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="color"
              value={toHexColor(selected.color)}
              onChange={e => updateSelected({ color: e.target.value }, 'color')}
              className="h-8 w-9 cursor-pointer rounded border border-border bg-background p-0.5"
              aria-label="رنگ"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">ضخامت:</span>
              {STROKE_WIDTHS.map(width => (
                <button
                  key={width}
                  type="button"
                  onClick={() => updateSelected({ strokeWidth: width }, 'stroke')}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded border text-[11px]',
                    (selected.strokeWidth ?? 2) === width ? 'border-primary bg-primary/20' : 'border-border bg-background',
                  )}
                  aria-label={`ضخامت ${width}`}
                >
                  {width}
                </button>
              ))}
            </div>
            {(selectedShape === 'rect' || selectedShape === 'ellipse') && (
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isFilled(selected)}
                  onChange={e => updateSelected({ filled: e.target.checked }, 'fill')}
                />
                پر شود
              </label>
            )}
          </div>
        </div>
      )}

      {/* فهرست شکل‌ها */}
      {current.length > 0 && (
        <div className="max-h-32 space-y-1 overflow-y-auto">
          {current.map(ann => {
            const shape = resolveShape(ann);
            return (
              <div
                key={ann.id}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs transition-colors hover:bg-white/10',
                  selectedId === ann.id ? 'bg-primary/15 ring-1 ring-primary/40' : 'bg-white/5',
                )}
                onClick={() => { if (!readOnly) { setSelectedId(ann.id); setTool('select'); } }}
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: toHexColor(ann.color) }} />
                  {ann.label || ANNOTATION_LABELS[ann.type]}
                  <span className="text-[10px] text-muted-foreground">({ANNOTATION_SHAPE_LABELS[shape]})</span>
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={ev => { ev.stopPropagation(); removeAnnotation(ann.id); }}
                    className="text-muted-foreground transition-colors hover:text-red-400"
                    aria-label="حذف"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(AnnotationCanvas);
