import { describe, expect, it } from 'vitest';
import { computeAccountBalance, riskAmountFromPercent, riskPercentFromAmount } from './accountService';
import type { Trade } from '../db/database';

const closed = (profitLoss: number, extra: Partial<Trade> = {}) =>
  ({ status: 'closed', result: profitLoss >= 0 ? 'win' : 'loss', profitLoss, fees: null, commission: null, spread: null, ...extra }) as unknown as Trade;

describe('بالانس و درصد ریسک حساب', () => {
  it('بالانس = اولیه + سود/زیان معاملات بسته‌شده؛ معاملهٔ باز حساب نمی‌شود', () => {
    const open = { status: 'open', result: 'open', profitLoss: 500 } as unknown as Trade;
    expect(computeAccountBalance({ initialBalance: 1000 }, [closed(200), closed(-50), open])).toBe(1150);
  });
  it('بدون بالانس اولیه null است', () => {
    expect(computeAccountBalance({ initialBalance: null }, [closed(100)])).toBeNull();
  });
  it('درصد و مبلغ ریسک', () => {
    expect(riskPercentFromAmount(50, 5000)).toBe(1);
    expect(riskAmountFromPercent(2, 5000)).toBe(100);
    expect(riskPercentFromAmount(50, 0)).toBeNull();
  });
});
