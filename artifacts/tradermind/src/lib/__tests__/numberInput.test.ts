import { describe, expect, it } from 'vitest';
import { normalizeDecimalInput, parseDecimalInput } from '../numberInput';

describe('decimal text input', () => {
  it('normalizes Persian and Arabic numerals and decimal separators', () => {
    expect(normalizeDecimalInput('۱۲۳٫۴۵')).toBe('123.45');
    expect(normalizeDecimalInput('٦٧,٨')).toBe('67.8');
  });

  it('keeps intermediate decimal input editable and parses valid values', () => {
    expect(normalizeDecimalInput('1.')).toBe('1.');
    expect(parseDecimalInput('۱٫۲۵')).toBe(1.25);
    expect(parseDecimalInput('-')).toBeNull();
    expect(parseDecimalInput('')).toBeNull();
  });
});
