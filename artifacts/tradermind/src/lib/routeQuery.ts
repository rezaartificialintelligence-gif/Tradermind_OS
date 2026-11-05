/**
 * کمک‌تابع‌های مسیریابی برای حالت‌های «هش» (ویندوز/Electron و اندروید/Capacitor).
 *
 * در این حالت‌ها آدرس صفحه مثل «#/journal/trades/new?journalSessionId=...» است؛
 * یعنی query داخل hash قرار دارد و window.location.search خالی می‌ماند.
 * پیش‌تر فقط پروتکل file: بررسی می‌شد و اندروید (https://localhost) جا می‌ماند؛
 * نتیجه: فرم «ثبت معامله» پارامترهای سشن را نمی‌دید و پیغام خطا می‌داد.
 */
export function isHashRouting(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'file:') return true;
  const w = window as unknown as {
    electronAPI?: { isElectron?: boolean };
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return w.electronAPI?.isElectron === true || Boolean(w.Capacitor?.isNativePlatform?.());
}

/** مسیر فعلی بدون query */
export function getRoutePath(): string {
  if (typeof window === 'undefined') return '/';
  return isHashRouting()
    ? (window.location.hash.replace(/^#/, '') || '/').split('?')[0]
    : window.location.pathname;
}

/** رشتهٔ query فعلی (بدون «؟») — در حالت هش از داخل hash خوانده می‌شود. */
export function getRouteQuery(): string {
  if (typeof window === 'undefined') return '';
  if (isHashRouting()) {
    const hash = window.location.hash.replace(/^#/, '');
    const queryIndex = hash.indexOf('?');
    if (queryIndex >= 0) return hash.slice(queryIndex + 1);
    // اگر قبلاً (به‌اشتباه) query روی آدرس اصلی نشسته باشد، آن را هم بخوان
    return window.location.search.replace(/^\?/, '');
  }
  return window.location.search.replace(/^\?/, '');
}

/** آدرس کاملی که برای history.replaceState لازم است، بدون خراب کردن مسیر هش. */
export function buildRouteUrl(search: string): string {
  const query = search.replace(/^\?/, '');
  if (isHashRouting()) {
    const base = window.location.pathname + window.location.search.replace(/^\?.*$/, '');
    return `${base}#${getRoutePath()}${query ? `?${query}` : ''}`;
  }
  return window.location.pathname + (query ? `?${query}` : '');
}
