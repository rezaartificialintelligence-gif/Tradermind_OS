import type { Trade } from '../db/database';
import { classifyTradeFields } from './tradeClassification';
import { getNetPnl } from './tradeHelpers';

/** تبدیل متن (با ارقام فارسی/عربی و ویرگول اعشاری) به رشتهٔ عددی استاندارد. */
export function normalizeDecimalText(value: string): string {
  const normalized = value
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[٫,]/g, '.')
    .replace(/[^\d.-]/g, '');
  const sign = normalized.startsWith('-') ? '-' : '';
  const unsigned = normalized.replace(/-/g, '');
  const [whole = '', ...fraction] = unsigned.split('.');
  return `${sign}${whole}${fraction.length > 0 ? `.${fraction.join('')}` : ''}`;
}

export function parseDecimalText(value: string): number | null {
  const text = normalizeDecimalText(value);
  if (!text || text === '.' || text === '-') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

type PricedTrade = Pick<Trade, 'direction' | 'entryPrice' | 'stopLoss' | 'exitPrice' | 'profitLoss' | 'fees' | 'commission' | 'spread' | 'riskAmount'>;

/**
 * همان فرمول R فرم قدیمی معامله (NewTrade.computeRMultiple):
 * سود/زیان خالص ÷ مبلغ ریسک؛ اگر مبلغ ریسک نبود، از فاصلهٔ ورود تا حد ضرر.
 */
export function computeRMultiple(trade: PricedTrade): number | null {
  if (trade.exitPrice === null || trade.exitPrice === undefined) return null;
  const netPnl = getNetPnl(trade as Trade);
  if (trade.riskAmount != null && trade.riskAmount > 0 && netPnl != null) {
    return Number((netPnl / trade.riskAmount).toFixed(2));
  }
  const diff = Math.abs(trade.entryPrice - trade.stopLoss);
  if (diff === 0) return null;
  const r = trade.direction === 'long'
    ? (trade.exitPrice - trade.entryPrice) / diff
    : (trade.entryPrice - trade.exitPrice) / diff;
  return Number(r.toFixed(2));
}

/**
 * فیلدهای محاسبه‌شده‌ای که گزارش‌ها به آن‌ها وابسته‌اند، با همان قواعد فرم قدیمی:
 * وضعیت/نتیجه از `classifyTradeFields` (بر پایهٔ سود/زیان)، R و زمان بسته‌شدن.
 */
export function finalizeTradeFields(
  trade: Pick<Trade, 'direction' | 'entryPrice' | 'stopLoss' | 'exitPrice' | 'profitLoss' | 'fees' | 'commission' | 'spread' | 'riskAmount' | 'closedAt' | 'openedAt' | 'status' | 'result'>,
  now: number = Date.now(),
): Pick<Trade, 'status' | 'result' | 'rMultiple' | 'closedAt'> {
  const { status, result } = classifyTradeFields(trade);
  return {
    status,
    result,
    rMultiple: status === 'closed' ? computeRMultiple(trade) : null,
    closedAt: status === 'closed' ? (trade.closedAt ?? Math.max(now, trade.openedAt)) : null,
  };
}
