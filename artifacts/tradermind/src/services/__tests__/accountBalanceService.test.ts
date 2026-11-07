import { describe, expect, it } from 'vitest';
import type { Account, Trade } from '../../db/database';
import {
  calculateAccountBalance,
  calculateRiskPercentage,
} from '../accountBalanceService';

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'account-1',
  name: 'Main',
  broker: '',
  currency: 'USD',
  initialBalance: 10_000,
  currentBalance: null,
  color: '#000',
  isDefault: false,
  notes: null,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const trade = (overrides: Partial<Trade> = {}): Trade => ({
  id: 'trade-1',
  accountId: 'account-1',
  status: 'closed',
  profitLoss: 100,
  fees: 0,
  commission: 0,
  spread: 0,
  openedAt: 10,
  closedAt: 20,
  ...overrides,
} as Trade);

describe('account balance calculation', () => {
  it('adds net P/L from all linked closed trades, including historical records', () => {
    const balance = calculateAccountBalance(account(), [
      trade({ id: 'history', profitLoss: 125, fees: 5 }),
      trade({ id: 'session', profitLoss: -40 }),
      trade({ id: 'other-account', accountId: 'account-2', profitLoss: 900 }),
      trade({ id: 'open', status: 'open', profitLoss: 500 }),
    ]);

    expect(balance).toBe(10_080);
  });

  it('can calculate the balance as of a trade entry and exclude that trade', () => {
    const balance = calculateAccountBalance(account(), [
      trade({ id: 'earlier', profitLoss: 200, closedAt: 50 }),
      trade({ id: 'later', profitLoss: 300, closedAt: 250 }),
      trade({ id: 'edited', profitLoss: 500, closedAt: 90 }),
    ], 100, 'edited');

    expect(balance).toBe(10_200);
  });

  it('uses a stored balance when no opening balance is available', () => {
    expect(calculateAccountBalance(
      account({ initialBalance: null, currentBalance: 2500 }),
      [trade({ profitLoss: 300 })],
    )).toBe(2500);
  });
});

describe('risk percentage calculation', () => {
  it('calculates dollar risk as a percentage of account equity', () => {
    expect(calculateRiskPercentage(100, 10_000)).toBe(1);
  });

  it('does not calculate when either amount is missing or invalid', () => {
    expect(calculateRiskPercentage(null, 10_000)).toBeNull();
    expect(calculateRiskPercentage(100, 0)).toBeNull();
  });
});
