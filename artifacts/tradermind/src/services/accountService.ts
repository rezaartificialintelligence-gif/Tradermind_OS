import { runAsRemote } from '../db/syncSupport';
import { DEFAULT_ACCOUNT_ID } from '../db/defaultIds';
import { db, Account } from '../db/database';
import { calculateAccountBalance } from './accountBalanceService';

async function loadAccountsWithCalculatedBalances(): Promise<Account[]> {
  const [storedAccounts, trades] = await Promise.all([
    db.accounts.orderBy('createdAt').toArray(),
    db.trades.toArray(),
  ]);

  const accounts = storedAccounts.map(account => ({
    ...account,
    currentBalance: calculateAccountBalance(account, trades),
  }));
  const now = Date.now();
  await Promise.all(accounts.flatMap(account => {
    const stored = storedAccounts.find(item => item.id === account.id);
    if (
      account.initialBalance == null ||
      account.currentBalance == null ||
      stored?.currentBalance === account.currentBalance
    ) {
      return [];
    }
    return [db.accounts.update(account.id, {
      currentBalance: account.currentBalance,
      updatedAt: now,
    })];
  }));

  return accounts;
}

function uuid(): string {
  return crypto.randomUUID();
}

export const accountService = {
  async getAll(): Promise<Account[]> {
    return loadAccountsWithCalculatedBalances();
  },

  async getActive(): Promise<Account[]> {
    return (await loadAccountsWithCalculatedBalances()).filter(account => !account.isArchived);
  },

  async getById(id: string): Promise<Account | undefined> {
    return (await loadAccountsWithCalculatedBalances()).find(account => account.id === id);
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
