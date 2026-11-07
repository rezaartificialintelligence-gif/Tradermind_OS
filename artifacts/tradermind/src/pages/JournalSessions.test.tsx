// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import type { JournalSession, Trade } from '../db/database';

const serviceMocks = vi.hoisted(() => ({
  getSessions: vi.fn(),
  getAccounts: vi.fn(),
  getBoxes: vi.fn(),
  getTrades: vi.fn(),
  getStrategies: vi.fn(),
  getOptions: vi.fn(),
  getHiddenCategoryIds: vi.fn(),
  ensureDefaultOptions: vi.fn(),
}));

vi.mock('../services/accountService', () => ({
  accountService: { getAll: serviceMocks.getAccounts },
}));
vi.mock('../services/tradingBoxService', () => ({
  tradingBoxService: {
    getAll: serviceMocks.getBoxes,
    isTradingBoxAvailableForAccount: () => true,
  },
}));
vi.mock('../services/tradeService', () => ({
  tradeService: { getAllTrades: serviceMocks.getTrades },
}));
vi.mock('../services/strategyService', () => ({
  strategyService: { getAllStrategies: serviceMocks.getStrategies },
}));
vi.mock('../services/journalSessionService', () => ({
  journalSessionService: {
    getSessions: serviceMocks.getSessions,
    getOptions: serviceMocks.getOptions,
    getHiddenCategoryIds: serviceMocks.getHiddenCategoryIds,
    ensureDefaultOptions: serviceMocks.ensureDefaultOptions,
  },
  parseJournalArray: (value?: string | null) => {
    try {
      const parsed: unknown = JSON.parse(value ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
}));
vi.mock('../services/journalSessionDefaults', () => ({
  getJournalSessionDefaults: () => ({}),
  setJournalSessionDefault: vi.fn(),
}));

import JournalSessions, { navigateToNewSessionDetail } from './JournalSessions';

function renderPage(path = '/journal/sessions') {
  const { hook } = memoryLocation({ path });
  return render(<Router hook={hook}><JournalSessions /></Router>);
}

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: 'trade-1',
    symbol: 'EURUSD',
    direction: 'long',
    openedAt: new Date(2026, 10, 4, 9).getTime(),
    accountId: null,
    boxId: null,
    strategyId: null,
    journalSessionId: null,
    profitLoss: 0,
    fees: null,
    commission: null,
    spread: null,
    status: 'closed',
    ...overrides,
  } as Trade;
}

beforeEach(() => {
  for (const mock of Object.values(serviceMocks)) mock.mockReset();
  serviceMocks.getSessions.mockResolvedValue([]);
  serviceMocks.getAccounts.mockResolvedValue([]);
  serviceMocks.getBoxes.mockResolvedValue([]);
  serviceMocks.getTrades.mockResolvedValue([]);
  serviceMocks.getStrategies.mockResolvedValue([]);
  serviceMocks.getOptions.mockResolvedValue([]);
  serviceMocks.getHiddenCategoryIds.mockResolvedValue([]);
  serviceMocks.ensureDefaultOptions.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session-first journal list', () => {
  it('opens a newly created session at the top of the page', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const navigate = vi.fn();

    navigateToNewSessionDetail('session-1', navigate);

    expect(navigate).toHaveBeenCalledWith('/journal/sessions/session-1');
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('shows the number of trades linked to each session', async () => {
    serviceMocks.getSessions.mockResolvedValue([{
      id: 'session-1',
      accountId: 'account-1',
      tradingBoxId: 'box-1',
      strategyId: 'strategy-1',
      startTime: new Date(2026, 10, 4, 8).getTime(),
      symbols: '["EURUSD"]',
      status: 'active',
    } as JournalSession]);
    serviceMocks.getTrades.mockResolvedValue([
      trade({ id: 'trade-1', journalSessionId: 'session-1' }),
      trade({ id: 'trade-2', journalSessionId: 'session-1' }),
    ]);

    renderPage();

    const count = await screen.findByTestId('text-session-trade-count-session-1');
    expect(count.textContent).toContain('2 معامله');
  });

  it('keeps old unlinked trades visible in date-grouped sections', async () => {
    serviceMocks.getTrades.mockResolvedValue([
      trade({ id: 'legacy-1', symbol: 'XAUUSD' }),
    ]);

    renderPage();

    expect(await screen.findByText('سوابق قدیمی بدون سشن')).toBeTruthy();
    const group = screen.getByTestId(/^card-legacy-session-/);
    fireEvent.click(group.querySelector('summary')!);
    expect(await screen.findByTestId('link-legacy-trade-legacy-1')).toBeTruthy();
    expect(screen.queryByTestId('empty-session-list')).toBeNull();
  });
});
