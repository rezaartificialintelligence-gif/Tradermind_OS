/**
 * annotationGeometry — هندسه، تشخیص لمس و رسم شکل‌های حاشیه‌نویسی
 * ─────────────────────────────────────────────────────────────────
 * همه‌ی مختصات ذخیره‌شده نرمال (۰ تا ۱) هستند تا با هر اندازه‌ی نمایش سازگار بمانند.
 * توابع این فایل خالص‌اند (به‌جز drawAnnotation که روی canvas می‌کشد) و تست‌پذیرند.
 */

import type { AnnotationPoint, AnnotationShape, ScreenshotAnnotation } from '../types/screenshot';

export type DrawableShape = Exclude<AnnotationShape, 'marker'>;

export interface Size { w: number; h: number }
export type HandleId = 'tl' | 'tr' | 'br' | 'bl' | 'p0' | 'p1';

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** شکل را برمی‌گرداند؛ داده‌های قدیمی (بدون shape) از روی type تفسیر می‌شوند */
export function resolveShape(ann: ScreenshotAnnotation): AnnotationShape {
  if (ann.shape) return ann.shape;
  switch (ann.type) {
    case 'zone':
      return 'rect';
    case 'support':
    case 'resistance':
    case 'liquidity':
    case 'fibonacci':
    case 'range-high':
    case 'range-low':
    case 'arrow':
      return ann.points.length >= 2 ? 'line' : 'marker';
    default:
      return 'marker';
  }
}

export function isFilled(ann: ScreenshotAnnotation): boolean {
  return ann.filled ?? ann.type === 'zone';
}

// ── رنگ ──────────────────────────────────────────────────────────

function parseRgb(color: string): [number, number, number] | null {
  const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = color.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [0, 1, 2].map(i => parseInt(hex[i] + hex[i], 16)) as [number, number, number];
  }
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  return null;
}

export function solidColor(color: string): string {
  const rgb = parseRgb(color);
  return rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : color;
}

export function withAlpha(color: string, alpha: number): string {
  const rgb = parseRgb(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : color;
}

export function toHexColor(color: string, fallback = '#f59e0b'): string {
  const rgb = parseRgb(color);
  if (!rgb) return fallback;
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── هندسه ────────────────────────────────────────────────────────

export function bboxOf(points: AnnotationPoint[]) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

function distToSegment(p: AnnotationPoint, a: AnnotationPoint, b: AnnotationPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** ساخت نقاط یک شکل جدید */
export function pointsForShape(shape: DrawableShape, start: AnnotationPoint, end: AnnotationPoint): AnnotationPoint[] {
  if (shape === 'vline') return [{ x: start.x, y: 0 }, { x: start.x, y: 1 }];
  if (shape === 'hline') return [{ x: 0, y: start.y }, { x: 1, y: start.y }];
  return [start, end];
}

/** دستگیره‌های قابل کشیدن یک شکل (مختصات نرمال) */
export function getHandles(ann: ScreenshotAnnotation): { id: HandleId; x: number; y: number }[] {
  const shape = resolveShape(ann);
  const pts = ann.points;
  if (shape === 'rect' || shape === 'ellipse') {
    if (pts.length < 2) return [];
    const b = bboxOf(pts);
    return [
      { id: 'tl', x: b.x1, y: b.y1 },
      { id: 'tr', x: b.x2, y: b.y1 },
      { id: 'br', x: b.x2, y: b.y2 },
      { id: 'bl', x: b.x1, y: b.y2 },
    ];
  }
  if (shape === 'line' && pts.length >= 2) {
    return [{ id: 'p0', x: pts[0].x, y: pts[0].y }, { id: 'p1', x: pts[1].x, y: pts[1].y }];
  }
  if (shape === 'marker' && pts.length >= 1) return [{ id: 'p0', x: pts[0].x, y: pts[0].y }];
  return [];
}

/** اگر لمس روی یک دستگیره بود، شناسه‌ی آن را برمی‌گرداند. size = اندازه‌ی نمایشی بر حسب پیکسل */
export function hitHandle(ann: ScreenshotAnnotation, pt: AnnotationPoint, size: Size, tol: number): HandleId | null {
  let best: { id: HandleId; d: number } | null = null;
  for (const handle of getHandles(ann)) {
    const d = Math.hypot((pt.x - handle.x) * size.w, (pt.y - handle.y) * size.h);
    if (d <= tol && (!best || d < best.d)) best = { id: handle.id, d };
  }
  return best?.id ?? null;
}

/** آیا نقطه روی بدنه‌ی شکل است؟ */
export function hitBody(ann: ScreenshotAnnotation, pt: AnnotationPoint, size: Size, tol: number): boolean {
  const shape = resolveShape(ann);
  const pts = ann.points;
  const px = pt.x * size.w;
  const py = pt.y * size.h;
  const toPx = (p: AnnotationPoint) => ({ x: p.x * size.w, y: p.y * size.h });

  switch (shape) {
    case 'marker': {
      if (!pts[0]) return false;
      const p = toPx(pts[0]);
      return Math.hypot(px - p.x, py - p.y) <= tol + 8;
    }
    case 'vline':
      return !!pts[0] && Math.abs(px - pts[0].x * size.w) <= tol;
    case 'hline':
      return !!pts[0] && Math.abs(py - pts[0].y * size.h) <= tol;
    case 'line': {
      if (pts.length < 2) return false;
      return distToSegment({ x: px, y: py }, toPx(pts[0]), toPx(pts[1])) <= tol;
    }
    case 'rect': {
      if (pts.length < 2) return false;
      const b = bboxOf(pts);
      const x1 = b.x1 * size.w, x2 = b.x2 * size.w, y1 = b.y1 * size.h, y2 = b.y2 * size.h;
      const insideOuter = px >= x1 - tol && px <= x2 + tol && py >= y1 - tol && py <= y2 + tol;
      if (!insideOuter) return false;
      if (isFilled(ann)) return true;
      const insideInner = px > x1 + tol && px < x2 - tol && py > y1 + tol && py < y2 - tol;
      return !insideInner;
    }
    case 'ellipse': {
      if (pts.length < 2) return false;
      const b = bboxOf(pts);
      const cx = ((b.x1 + b.x2) / 2) * size.w;
      const cy = ((b.y1 + b.y2) / 2) * size.h;
      const rx = Math.max(((b.x2 - b.x1) / 2) * size.w, 1);
      const ry = Math.max(((b.y2 - b.y1) / 2) * size.h, 1);
      const norm = Math.hypot((px - cx) / rx, (py - cy) / ry);
      if (isFilled(ann)) return norm <= 1 + tol / Math.min(rx, ry);
      return Math.abs(norm - 1) * Math.min(rx, ry) <= tol;
    }
    default:
      return false;
  }
}

/** جابه‌جایی کل شکل؛ شکل از کادر تصویر بیرون نمی‌رود و خط‌های عمودی/افقی فقط در یک محور حرکت می‌کنند */
export function translateAnnotation(ann: ScreenshotAnnotation, dx: number, dy: number): ScreenshotAnnotation {
  const shape = resolveShape(ann);
  if (shape === 'vline') dy = 0;
  if (shape === 'hline') dx = 0;
  const b = bboxOf(ann.points);
  const sx = Math.max(-b.x1, Math.min(1 - b.x2, dx));
  const sy = Math.max(-b.y1, Math.min(1 - b.y2, dy));
  return { ...ann, points: ann.points.map(p => ({ x: p.x + sx, y: p.y + sy })) };
}

/** کشیدن یک دستگیره (تغییر اندازه / جابه‌جایی انتهای خط) */
export function dragHandle(ann: ScreenshotAnnotation, handle: HandleId, pt: AnnotationPoint): ScreenshotAnnotation {
  const moving = { x: clamp01(pt.x), y: clamp01(pt.y) };
  const shape = resolveShape(ann);
  if (shape === 'rect' || shape === 'ellipse') {
    const b = bboxOf(ann.points);
    const corners = {
      tl: { x: b.x1, y: b.y1 }, tr: { x: b.x2, y: b.y1 },
      br: { x: b.x2, y: b.y2 }, bl: { x: b.x1, y: b.y2 },
    };
    const opposite = ({ tl: 'br', tr: 'bl', br: 'tl', bl: 'tr' } as const)[handle as 'tl' | 'tr' | 'br' | 'bl'];
    if (!opposite) return ann;
    return { ...ann, points: [moving, corners[opposite]] };
  }
  if (handle === 'p0' || handle === 'p1') {
    const index = handle === 'p0' ? 0 : 1;
    const points = ann.points.map((p, i) => (i === index ? moving : p));
    return { ...ann, points };
  }
  return ann;
}

/** شکل خیلی کوچک (کلیک اتفاقی) ثبت نمی‌شود */
export function isTooSmall(shape: DrawableShape, points: AnnotationPoint[], size: Size, minPx = 8): boolean {
  if (shape === 'vline' || shape === 'hline') return false;
  const dx = Math.abs(points[1].x - points[0].x) * size.w;
  const dy = Math.abs(points[1].y - points[0].y) * size.h;
  if (shape === 'line') return Math.hypot(dx, dy) < minPx;
  return dx < minPx || dy < minPx;
}

// ── رسم روی canvas ───────────────────────────────────────────────

export interface DrawOptions {
  selected?: boolean;
  /** نسبت پیکسل canvas به پیکسل نمایشی؛ برای ثابت ماندن ضخامت و دستگیره‌ها روی همه‌ی اندازه‌ها */
  k: number;
}

function drawLabel(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, k: number, w: number, h: number,
) {
  if (!text) return;
  const fontSize = 13 * k;
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const padX = 6 * k;
  const chipW = ctx.measureText(text).width + padX * 2;
  const chipH = fontSize + 8 * k;
  const cx = Math.max(2, Math.min(w - chipW - 2, x));
  const cy = Math.max(2, Math.min(h - chipH - 2, y));
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 * k;
  ctx.beginPath();
  ctx.roundRect(cx, cy, chipW, chipH, 4 * k);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, cx + padX, cy + chipH / 2);
  ctx.restore();
}

export function drawAnnotation(
  ctx: CanvasRenderingContext2D, ann: ScreenshotAnnotation, w: number, h: number, opts: DrawOptions,
) {
  const shape = resolveShape(ann);
  const pts = ann.points;
  if (!pts.length) return;
  const color = solidColor(ann.color);
  const { k, selected } = opts;
  const baseWidth = ann.strokeWidth ?? 2;

  ctx.save();
  ctx.lineWidth = baseWidth * k * (selected ? 1.4 : 1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const P = (p: AnnotationPoint) => ({ x: p.x * w, y: p.y * h });
  const chipH = 13 * k + 8 * k;

  switch (shape) {
    case 'marker': {
      const p = P(pts[0]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * k, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(color, 0.65);
      ctx.fill();
      ctx.stroke();
      drawLabel(ctx, ann.label, p.x + 10 * k, p.y - chipH - 2 * k, color, k, w, h);
      break;
    }
    case 'vline': {
      const x = pts[0].x * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (selected) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, h / 2, 7 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      drawLabel(ctx, ann.label, x + 6 * k, 6 * k, color, k, w, h);
      break;
    }
    case 'hline': {
      const y = pts[0].y * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      if (selected) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(w / 2, y, 7 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      drawLabel(ctx, ann.label, 6 * k, y - chipH - 3 * k, color, k, w, h);
      break;
    }
    case 'line': {
      if (pts.length < 2) break;
      const a = P(pts[0]);
      const b = P(pts[1]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (ann.type === 'arrow') {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const head = 12 * k;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
      drawLabel(ctx, ann.label, (a.x + b.x) / 2 + 6 * k, (a.y + b.y) / 2 - chipH - 4 * k, color, k, w, h);
      break;
    }
    case 'rect': {
      if (pts.length < 2) break;
      const b = bboxOf(pts);
      const x = b.x1 * w, y = b.y1 * h, rw = (b.x2 - b.x1) * w, rh = (b.y2 - b.y1) * h;
      if (isFilled(ann)) {
        ctx.fillStyle = withAlpha(color, 0.18);
        ctx.fillRect(x, y, rw, rh);
      }
      ctx.strokeRect(x, y, rw, rh);
      drawLabel(ctx, ann.label, x + 4 * k, y + 4 * k, color, k, w, h);
      break;
    }
    case 'ellipse': {
      if (pts.length < 2) break;
      const b = bboxOf(pts);
      const cx = ((b.x1 + b.x2) / 2) * w, cy = ((b.y1 + b.y2) / 2) * h;
      const rx = Math.max(((b.x2 - b.x1) / 2) * w, 0.5), ry = Math.max(((b.y2 - b.y1) / 2) * h, 0.5);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (isFilled(ann)) {
        ctx.fillStyle = withAlpha(color, 0.18);
        ctx.fill();
      }
      ctx.stroke();
      drawLabel(ctx, ann.label, cx - rx + 4 * k, cy - ry - chipH - 3 * k, color, k, w, h);
      break;
    }
  }

  if (selected) {
    // کادر راهنما برای مربع/دایره + دستگیره‌ها
    if ((shape === 'rect' || shape === 'ellipse') && pts.length >= 2) {
      const b = bboxOf(pts);
      ctx.setLineDash([6 * k, 4 * k]);
      ctx.lineWidth = 1 * k;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(b.x1 * w, b.y1 * h, (b.x2 - b.x1) * w, (b.y2 - b.y1) * h);
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * k;
    for (const handle of getHandles(ann)) {
      ctx.beginPath();
      ctx.arc(handle.x * w, handle.y * h, 7 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}
