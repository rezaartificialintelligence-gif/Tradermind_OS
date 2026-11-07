import type { Account, Trade } from '../db/database';
import { getNetPnl, isClosed } from '../lib/tradeHelpers';

/**
 * Calculates an account's balance from its opening balance and realized net P/L.
 * All linked trade records are considered, including historical records that
 * are not part of the session-based reports.
 */
export function calculateAccountBalance(
  account: Account,
  trades: Trade[],
  asOf?: number,
  excludeTradeId?: string,
): number | null {
  if (typeof account.initialBalance !== 'number' || !Number.isFinite(account.initialBalance)) {
    return account.currentBalance != null && Number.isFinite(account.currentBalance)
      ? account.currentBalance
      : null;
  }

  const realizedPnl = trades.reduce((total, trade) => {
    if (
      trade.accountId !== account.id ||
      trade.id === excludeTradeId ||
      !isClosed(trade) ||
      (asOf != null && (trade.closedAt ?? trade.openedAt) > asOf)
    ) {
      return total;
    }
    return total + (getNetPnl(trade) ?? 0);
  }, 0);

  return account.initialBalance + realizedPnl;
}

/** Returns the risk percentage when both values use the same currency. */
export function calculateRiskPercentage(
  riskAmount: number | null | undefined,
  accountEquity: number | null | undefined,
): number | null {
  if (
    typeof riskAmount !== 'number' ||
    !Number.isFinite(riskAmount) ||
    riskAmount <= 0 ||
    typeof accountEquity !== 'number' ||
    !Number.isFinite(accountEquity) ||
    accountEquity <= 0
  ) {
    return null;
  }

  return Math.round((riskAmount / accountEquity) * 100 * 10_000) / 10_000;
}
