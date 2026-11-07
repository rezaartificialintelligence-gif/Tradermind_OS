export function normalizeDecimalInput(value: string): string {
  const normalized = value
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[٬]/g, '')
    .replace(/[٫,]/g, '.')
    .replace(/[^\d.-]/g, '');
  const sign = normalized.startsWith('-') ? '-' : '';
  const unsigned = normalized.replace(/-/g, '');
  const [whole = '', ...fraction] = unsigned.split('.');
  return `${sign}${whole}${fraction.length > 0 ? `.${fraction.join('')}` : ''}`;
}

export function parseDecimalInput(value: string): number | null {
  const normalized = normalizeDecimalInput(value).trim();
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
