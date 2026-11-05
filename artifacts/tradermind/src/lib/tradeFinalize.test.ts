import { describe, expect, it } from 'vitest';
import { finalizeTradeFields, parseDecimalText } from './tradeFinalize';

const base = {
  direction: 'long' as const, entryPrice: 1.1, stopLoss: 1.095, exitPrice: 1.11, profitLoss: 200,
  fees: null, commission: -4, spread: null, riskAmount: 100, closedAt: null, openedAt: 1000,
  status: 'open' as const, result: 'open' as const,
};

describe('finalizeTradeFields', () => {
  it('بستن معامله با سود/زیان: وضعیت، نتیجه، R و زمان بسته‌شدن', () => {
    expect(finalizeTradeFields(base, 5000)).toEqual({ status: 'closed', result: 'win', rMultiple: 2.04, closedAt: 5000 });
  });
  it('بدون سود/زیان و خروج، معامله باز می‌ماند', () => {
    expect(finalizeTradeFields({ ...base, exitPrice: null, profitLoss: null, commission: null }, 5000))
      .toEqual({ status: 'open', result: 'open', rMultiple: null, closedAt: null });
  });
  it('بدون مبلغ ریسک، R از فاصلهٔ حد ضرر محاسبه می‌شود', () => {
    expect(finalizeTradeFields({ ...base, riskAmount: null }, 5000).rMultiple).toBe(2);
  });
  it('معاملهٔ فروش زیان‌ده', () => {
    const result = finalizeTradeFields({ ...base, direction: 'short', profitLoss: -100, commission: null }, 5000);
    expect(result).toMatchObject({ result: 'loss', rMultiple: -1 });
  });
});

describe('parseDecimalText', () => {
  it('ارقام فارسی و ویرگول اعشاری', () => {
    expect(parseDecimalText('۱٫۱۰۵۰')).toBe(1.105);
    expect(parseDecimalText('1,5')).toBe(1.5);
    expect(parseDecimalText('-')).toBeNull();
  });
});
