import { describe, it, expect } from 'vitest';
import type { ScreenshotAnnotation } from '../../types/screenshot';
import {
  resolveShape, hitBody, hitHandle, translateAnnotation, dragHandle, pointsForShape, isTooSmall, toHexColor,
} from '../annotationGeometry';

const base = { id: 'a', type: 'custom', label: 'x', color: '#ff0000', createdAt: 0 } as const;
const size = { w: 1000, h: 500 };
const rect: ScreenshotAnnotation = { ...base, shape: 'rect', points: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 }] };

describe('annotationGeometry', () => {
  it('شکل داده‌های قدیمی را از روی type تشخیص می‌دهد', () => {
    expect(resolveShape({ ...base, type: 'zone', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBe('rect');
    expect(resolveShape({ ...base, type: 'support', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBe('line');
    expect(resolveShape({ ...base, type: 'entry', points: [{ x: 0.5, y: 0.5 }] })).toBe('marker');
  });

  it('خط عمودی و افقی تمام تصویر را می‌پوشانند', () => {
    expect(pointsForShape('vline', { x: 0.3, y: 0.7 }, { x: 0.3, y: 0.7 })).toEqual([{ x: 0.3, y: 0 }, { x: 0.3, y: 1 }]);
    expect(pointsForShape('hline', { x: 0.3, y: 0.7 }, { x: 0.3, y: 0.7 })).toEqual([{ x: 0, y: 0.7 }, { x: 1, y: 0.7 }]);
  });

  it('لمس روی مربع توخالی فقط روی لبه‌ها شناسایی می‌شود', () => {
    const hollow = { ...rect, filled: false };
    expect(hitBody(hollow, { x: 0.4, y: 0.4 }, size, 10)).toBe(false);
    expect(hitBody(hollow, { x: 0.2, y: 0.4 }, size, 10)).toBe(true);
    expect(hitBody({ ...rect, filled: true }, { x: 0.4, y: 0.4 }, size, 10)).toBe(true);
  });

  it('دایره و خط زاویه‌دار لمس را درست تشخیص می‌دهند', () => {
    const circle: ScreenshotAnnotation = { ...base, shape: 'ellipse', filled: false, points: [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.6 }] };
    expect(hitBody(circle, { x: 0.6, y: 0.4 }, size, 10)).toBe(true);
    expect(hitBody(circle, { x: 0.4, y: 0.4 }, size, 10)).toBe(false);
    const line: ScreenshotAnnotation = { ...base, shape: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    expect(hitBody(line, { x: 0.5, y: 0.5 }, size, 10)).toBe(true);
    expect(hitBody(line, { x: 0.9, y: 0.1 }, size, 10)).toBe(false);
  });

  it('جابه‌جایی شکل را داخل کادر نگه می‌دارد و خط‌ها فقط در یک محور می‌روند', () => {
    const moved = translateAnnotation(rect, 5, 5);
    expect(moved.points.every(p => p.x <= 1 && p.y <= 1)).toBe(true);
    const v: ScreenshotAnnotation = { ...base, shape: 'vline', points: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }] };
    const mv = translateAnnotation(v, 0.1, 0.4);
    expect(mv.points[0]).toEqual({ x: 0.6, y: 0 });
  });

  it('تغییر اندازه با دستگیره گوشه‌ی مقابل را ثابت نگه می‌دارد', () => {
    expect(hitHandle(rect, { x: 0.6, y: 0.6 }, size, 12)).toBe('br');
    const resized = dragHandle(rect, 'br', { x: 0.8, y: 0.9 });
    expect(resized.points).toEqual([{ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.2 }]);
  });

  it('کلیک اتفاقی شکل ثبت نمی‌کند و رنگ rgba به hex تبدیل می‌شود', () => {
    expect(isTooSmall('rect', [{ x: 0.5, y: 0.5 }, { x: 0.501, y: 0.5 }], size)).toBe(true);
    expect(isTooSmall('line', [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }], size)).toBe(false);
    expect(toHexColor('rgba(251,191,36,0.3)')).toBe('#fbbf24');
  });
});
