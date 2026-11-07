import { describe, expect, it } from 'vitest';
import { calculatePreTradeRisk } from '../riskService';

describe('calculatePreTradeRisk', () => {
  it('applies the contract multiplier when calculating lot size', () => {
    const result = calculatePreTradeRisk({
      accountEquity: null,
      entryPrice: 4044.285,
      stopLoss: 4049.188,
      takeProfit: null,
      riskPct: null,
      riskAmount: 24.65,
      positionSize: null,
      pointValue: 100,
    });

    expect(result.positionSize).toBeCloseTo(0.05027534, 7);
  });

  it('uses the same contract multiplier for loss and reward projections', () => {
    const result = calculatePreTradeRisk({
      accountEquity: 10_000,
      entryPrice: 100,
      stopLoss: 99,
      takeProfit: 102,
      riskPct: 1,
      riskAmount: null,
      positionSize: null,
      pointValue: 100,
    });

    expect(result.monetaryRisk).toBe(100);
    expect(result.positionSize).toBe(1);
    expect(result.potentialReward).toBe(200);
    expect(result.plannedRR).toBe(2);
  });
});
