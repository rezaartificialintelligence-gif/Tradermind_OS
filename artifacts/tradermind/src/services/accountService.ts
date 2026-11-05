import { runAsRemote } from '../db/syncSupport';
import { DEFAULT_ACCOUNT_ID } from '../db/defaultIds';
import { db, Account, Trade } from '../db/database';
import { isClosed, getNetPnl } from '../lib/tradeHelpers';

/** بالانس = بالانس اولیه + جمع سود/زیان خالص معاملات بسته‌شدهٔ همان حساب. */
export function computeAccountBalance(account: Pick<Account, 'initialBalance'>, trades: Trade[]): number | null {
  if (account.initialBalance == null) return null;
  const pnl = trades.filter(isClosed).reduce((sum, trade) => sum + (getNetPnl(trade) ?? 0), 0);
  return Number((account.initialBalance + pnl).toFixed(2));
}

/** درصد ریسک از مبلغ ریسک و بالانس حساب. */
export function riskPercentFromAmount(riskAmount: number | null, balance: number | null): number | null {
  if (riskAmount == null || balance == null || balance <= 0 || riskAmount < 0) return null;
  return Number(((riskAmount / balance) * 100).toFixed(2));
}

/** مبلغ ریسک از درصد ریسک و بالانس حساب. */
export function riskAmountFromPercent(riskPercentage: number | null, balance: number | null): number | null {
  if (riskPercentage == null || balance == null || balance <= 0 || riskPercentage < 0) return null;
  return Number(((riskPercentage / 100) * balance).toFixed(2));
}

function uuid(): string {
  return crypto.randomUUID();
}

export const accountService = {
  /** بالانس لحظه‌ای حساب از روی معاملات (null اگر بالانس اولیه ثبت نشده باشد). */
  async getLiveBalance(accountId: string): Promise<number | null> {
    const account = await db.accounts.get(accountId);
    if (!account) return null;
    const trades = await db.trades.where('accountId').equals(accountId).toArray();
    return computeAccountBalance(account, trades);
  },

  /** بالانس ذخیره‌شدهٔ حساب را با معاملات هماهنگ می‌کند (اگر بالانس اولیه ثبت شده باشد). */
  async recalculateBalance(accountId: string | null | undefined): Promise<void> {
    if (!accountId) return;
    const account = await db.accounts.get(accountId);
    if (!account || account.initialBalance == null) return;
    const trades = await db.trades.where('accountId').equals(accountId).toArray();
    const balance = computeAccountBalance(account, trades);
    if (balance !== null && balance !== account.currentBalance) {
      await db.accounts.update(accountId, { currentBalance: balance, updatedAt: Date.now() });
    }
  },

  async getAll(): Promise<Account[]> {
    return db.accounts.orderBy('createdAt').toArray();
  },

  async getActive(): Promise<Account[]> {
    return db.accounts.filter(account => !account.isArchived).sortBy('createdAt');
  },

  async getById(id: string): Promise<Account | undefined> {
    return db.accounts.get(id);
  },

  async create(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<Account> {
    const now = Date.now();
    const account: Account = {
      id: uuid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    await db.accounts.add(account);
    return account;
  },

  async update(id: string, data: Partial<Omit<Account, 'id' | 'createdAt'>>): Promise<void> {
    await db.accounts.update(id, { ...data, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await this.setArchived(id, true);
  },

  async setArchived(id: string, isArchived: boolean): Promise<void> {
    await db.accounts.update(id, {
      isArchived,
      ...(isArchived ? { isDefault: false } : {}),
      updatedAt: Date.now(),
    });
  },

  async ensureDefault(): Promise<Account> {
    const existing = await db.accounts.filter(account => !account.isArchived).first();
    if (existing) return existing;
    const stale = await db.accounts.get(DEFAULT_ACCOUNT_ID);
    if (stale) {
      await db.accounts.update(DEFAULT_ACCOUNT_ID, { isArchived: false, updatedAt: Date.now() });
      return (await db.accounts.get(DEFAULT_ACCOUNT_ID)) as Account;
    }
    const account: Account = {
      id: DEFAULT_ACCOUNT_ID,
      name: 'حساب اصلی',
      broker: '',
      currency: 'USD',
      initialBalance: null,
      currentBalance: null,
      color: '#3b82f6',
      isDefault: true,
      tradingBoxIds: [],
      notes: null,
      createdAt: Date.now(),
      updatedAt: 0, // پیش‌فرض دست‌نخورده؛ نسخه‌ی ویرایش‌شده‌ی دستگاه دیگر را بازنویسی نمی‌کند
    };
    await runAsRemote(() => db.accounts.add(account));
    return account;
  },
};
