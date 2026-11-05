/**
 * رسم نمودارهای گزارش Word به‌صورت تصویر PNG (بدون وابستگی خارجی).
 *
 * نمودارها با Canvas رسم می‌شوند تا بتوان آن‌ها را مثل عکس‌ها داخل فایل .docx گذاشت.
 * در محیطی که Canvas ندارد (مثل تست‌ها) تابع رسم null برمی‌گرداند و گزارش بدون نمودار ساخته می‌شود.
 */
import type { ReportImage } from '../services/journalWordReportBuilder';

export interface BarChartSpec {
  kind: 'bar';
  /** شناسهٔ یکتا؛ بخش‌های Word با همین کلید نمودار را پیدا می‌کنند. */
  key: string;
  title: string;
  yLabel?: string;
  categories: string[];
  values: number[];
  /** رنگ دلخواه هر ستون؛ اگر نباشد سبز (مثبت) و قرمز (منفی). */
  colors?: string[];
}

export interface LineChartSpec {
  kind: 'line';
  key: string;
  title: string;
  yLabel?: string;
  xLabels: string[];
  series: Array<{ name: string; values: number[]; color?: string }>;
}

export type ChartSpec = BarChartSpec | LineChartSpec;

const WIDTH = 1400;
const HEIGHT = 720;
const GREEN = '#16A34A';
const RED = '#DC2626';
const GRAY = '#6B7280';
const BLUE = '#2563EB';
const FONT = 'Tahoma, "Segoe UI", Arial, sans-serif';

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return String(Math.round(value * 10 ** digits) / 10 ** digits);
}

/** بازهٔ «تمیز» محور عمودی که صفر را هم شامل می‌شود. */
function niceRange(values: number[]): { min: number; max: number; step: number } {
  const finite = values.filter(Number.isFinite);
  let min = Math.min(0, ...finite);
  let max = Math.max(0, ...finite);
  if (min === max) { max = min + 1; }
  const rough = (max - min) / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  return { min, max, step };
}

function createCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    return canvas;
  } catch {
    return null;
  }
}

function frame(ctx: CanvasRenderingContext2D, title: string, yLabel: string | undefined, range: { min: number; max: number; step: number }, bottomMargin: number) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#111827';
  ctx.font = `bold 30px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, WIDTH / 2, 36);
  if (yLabel) {
    ctx.fillStyle = GRAY;
    ctx.font = `20px ${FONT}`;
    ctx.fillText(yLabel, WIDTH / 2, 72);
  }
  const plot = { left: 110, right: WIDTH - 40, top: 100, bottom: HEIGHT - bottomMargin };
  const yOf = (value: number) => plot.bottom - ((value - range.min) / (range.max - range.min)) * (plot.bottom - plot.top);
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;
  ctx.fillStyle = GRAY;
  ctx.font = `18px ${FONT}`;
  ctx.textAlign = 'right';
  for (let value = range.min; value <= range.max + range.step / 2; value += range.step) {
    const y = yOf(value);
    ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
    ctx.fillText(formatValue(value), plot.left - 10, y);
  }
  // خط صفر پررنگ‌تر
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(plot.left, yOf(0)); ctx.lineTo(plot.right, yOf(0)); ctx.stroke();
  return { plot, yOf };
}

function drawCategoryLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, rotate: boolean) {
  ctx.save();
  ctx.fillStyle = '#374151';
  ctx.font = `18px ${FONT}`;
  ctx.translate(x, y);
  if (rotate) {
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = 'right';
  } else {
    ctx.textAlign = 'center';
  }
  ctx.textBaseline = 'top';
  const trimmed = text.length > 22 ? `${text.slice(0, 21)}…` : text;
  ctx.fillText(trimmed, 0, 0);
  ctx.restore();
}

function drawBar(spec: BarChartSpec, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  const range = niceRange(spec.values);
  const rotate = spec.categories.length > 8;
  const { plot, yOf } = frame(ctx, spec.title, spec.yLabel, range, rotate ? 170 : 90);
  const count = Math.max(1, spec.categories.length);
  const slot = (plot.right - plot.left) / count;
  const barWidth = Math.min(90, slot * 0.62);
  spec.categories.forEach((category, index) => {
    const value = spec.values[index] ?? 0;
    const centerX = plot.left + slot * index + slot / 2;
    const top = yOf(Math.max(value, 0));
    const bottom = yOf(Math.min(value, 0));
    ctx.fillStyle = spec.colors?.[index] ?? (value >= 0 ? GREEN : RED);
    ctx.fillRect(centerX - barWidth / 2, top, barWidth, Math.max(2, bottom - top));
    ctx.fillStyle = '#111827';
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = value >= 0 ? 'bottom' : 'top';
    ctx.fillText(formatValue(value), centerX, value >= 0 ? top - 4 : bottom + 4);
    drawCategoryLabel(ctx, category, centerX + (rotate ? 8 : 0), plot.bottom + 16, rotate);
  });
}

function drawLine(spec: LineChartSpec, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  const range = niceRange(spec.series.flatMap(item => item.values));
  const { plot, yOf } = frame(ctx, spec.title, spec.yLabel, range, spec.series.length > 1 ? 190 : 170);
  const pointCount = Math.max(...spec.series.map(item => item.values.length), 1);
  const xOf = (index: number) => (pointCount === 1
    ? (plot.left + plot.right) / 2
    : plot.left + ((plot.right - plot.left) * index) / (pointCount - 1));
  spec.series.forEach((series, seriesIndex) => {
    const color = series.color ?? (seriesIndex === 0 ? BLUE : seriesIndex === 1 ? '#F59E0B' : '#8B5CF6');
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    series.values.forEach((value, index) => {
      if (index === 0) ctx.moveTo(xOf(index), yOf(value)); else ctx.lineTo(xOf(index), yOf(value));
    });
    ctx.stroke();
    const last = series.values.length - 1;
    if (last >= 0) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(xOf(last), yOf(series.values[last]), 7, 0, Math.PI * 2); ctx.fill();
      ctx.font = `bold 20px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(formatValue(series.values[last]), xOf(last), yOf(series.values[last]) - 12);
    }
  });
  // برچسب محور افقی؛ حداکثر ۱۰ برچسب
  const stride = Math.max(1, Math.ceil(spec.xLabels.length / 10));
  spec.xLabels.forEach((label, index) => {
    if (index % stride === 0 || index === spec.xLabels.length - 1) drawCategoryLabel(ctx, label, xOf(index) + 8, plot.bottom + 16, true);
  });
  if (spec.series.length > 1) {
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = 'left';
    spec.series.forEach((series, index) => {
      ctx.fillStyle = series.color ?? (index === 0 ? BLUE : index === 1 ? '#F59E0B' : '#8B5CF6');
      ctx.fillText(`■ ${series.name}`, plot.left + 10 + index * 220, HEIGHT - 20);
    });
  }
}

/** یک نمودار را به PNG تبدیل می‌کند؛ اگر Canvas در دسترس نباشد null. */
export async function renderChartPng(spec: ChartSpec): Promise<ReportImage | null> {
  const canvas = createCanvas();
  if (!canvas) return null;
  try {
    if (spec.kind === 'bar') drawBar(spec, canvas); else drawLine(spec, canvas);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return {
      fileName: `chart-${spec.key}.png`,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width: WIDTH,
      height: HEIGHT,
    };
  } catch {
    return null;
  }
}
