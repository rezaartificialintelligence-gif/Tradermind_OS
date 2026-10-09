import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { db } from '../../db/database';
import { accountService } from '../../services/accountService';
import {
  getJournalAnalysisFieldLabels,
  JOURNAL_ANALYSIS_FIELD_LABELS,
  saveJournalAnalysisFieldLabels,
  type JournalAnalysisFieldLabels,
} from '../../services/journalAnalysisFieldLabels';
import { journalSessionService } from '../../services/journalSessionService';
import { strategyService } from '../../services/strategyService';
import { tradeService } from '../../services/tradeService';
import { tradingBoxService } from '../../services/tradingBoxService';
import JournalSessionDetail from '../JournalSessionDetail';
import JournalTradeReview from '../JournalTradeReview';

async function seedSessionWithAnalyses() {
  const account = await accountService.create({
    name: 'Test account',
    broker: 'Local',
    currency: 'USD',
    initialBalance: 10_000,
    currentBalance: 10_000,
    color: '#3b82f6',
    isDefault: true,
    notes: null,
  });
  const box = await tradingBoxService.create({
    accountId: account.id,
    name: 'Test box',
    description: null,
    targetTradeCount: 10,
    color: '#14b8a6',
    status: 'active',
    notes: null,
  });
  const strategy = await strategyService.createStrategy({
    name: 'Test strategy',
    description: '',
    icon: null,
    colorTag: null,
    isActive: true,
  });
  await journalSessionService.ensureDefaultOptions();
  const session = await journalSessionService.createSession({
    accountId: account.id,
    tradingBoxId: box.id,
    strategyId: strategy.id,
    symbols: ['EURUSD'],
    startTime: Date.now(),
  });
  const timeframe = await db.journalOptions.where('category').equals('timeframe').first();
  if (!timeframe) throw new Error('Test timeframe was not created.');

  const analyses = await Promise.all(
    ['First analysis', 'Second analysis'].map(analysisText =>
      journalSessionService.createAnalysisEvent({
        sessionId: session.id,
        timeframeOptionId: timeframe.id,
        analysisText,
        marketContext: '',
        directionOptionId: null,
        marketStructureOptionId: null,
        liquidityContextOptionIds: '[]',
        expectedDirectionOptionId: null,
        scenario: '',
        triggerContext: '',
        zones: '',
        notes: '',
        tags: '[]',
        previousTradeId: null,
        nextTradeId: null,
      }),
    ),
  );
  return { session, analyses, timeframe };
}

describe('JournalSessionDetail custom analysis labels', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it('shows saved labels in every analysis event and keeps them after saving an event', async () => {
    const { session, analyses } = await seedSessionWithAnalyses();
    const customLabels = Object.fromEntries(
      Object.keys(JOURNAL_ANALYSIS_FIELD_LABELS).map(key => [key, `سفارشی-${key}`]),
    ) as JournalAnalysisFieldLabels;
    saveJournalAnalysisFieldLabels(customLabels);

    const { hook } = memoryLocation({ path: `/journal/sessions/${session.id}`, static: true });
    render(
      <Router hook={hook}>
        <Route path="/journal/sessions/:id" component={JournalSessionDetail} />
      </Router>,
    );

    for (const analysis of analyses) {
      expect(await screen.findByTestId(`card-analysis-${analysis.id}`)).toBeTruthy();
    }
    expect(getJournalAnalysisFieldLabels()).toEqual(customLabels);
    await waitFor(() => {
      for (const label of Object.values(customLabels)) {
        expect(screen.getAllByText(label)).toHaveLength(analyses.length);
      }
    });

    const secondAnalysis = analyses[1];
    fireEvent.change(screen.getByTestId(`input-analysis-text-${secondAnalysis.id}`), {
      target: { value: 'Saved while using custom labels' },
    });
    fireEvent.click(screen.getByTestId(`button-save-analysis-${secondAnalysis.id}`));
    await waitFor(async () => {
      expect((await db.journalSessionAnalyses.get(secondAnalysis.id))?.analysisText)
        .toBe('Saved while using custom labels');
    });

    await waitFor(() => {
      for (const label of Object.values(customLabels)) {
        expect(screen.getAllByText(label)).toHaveLength(analyses.length);
      }
    });
  });

  it('shows the latest linked trigger details on the trade review page', async () => {
    const { session, analyses, timeframe } = await seedSessionWithAnalyses();
    const entryTriggerOptions = await db.journalOptions.where('category').equals('entry_trigger').toArray();
    const directionOptions = await db.journalOptions.where('category').equals('direction').toArray();
    const initialDirection = directionOptions.find(option => option.label === 'نزولی');
    const updatedDirection = directionOptions.find(option => option.label === 'صعودی');
    expect(entryTriggerOptions.length).toBeGreaterThan(1);
    expect(initialDirection && updatedDirection).toBeTruthy();

    const trigger = await journalSessionService.createTriggerEvent({
      sessionId: session.id,
      timeframeOptionId: timeframe.id,
      analysisEventId: analyses[0].id,
      triggerTypeOptionId: entryTriggerOptions[0].id,
      description: 'Initial trigger description',
      marketMovement: 'Initial market movement',
      directionOptionId: initialDirection!.id,
      confirmed: true,
      notes: 'Initial trigger note',
    });
    const trade = await tradeService.createTrade({ journalSessionId: session.id, symbol: 'EURUSD' });
    await journalSessionService.linkTriggerToTrade(trigger.id, trade.id, { applyTriggerDirection: true });
    await journalSessionService.updateTriggerEvent(trigger.id, {
      analysisEventId: analyses[1].id,
      triggerTypeOptionId: entryTriggerOptions[1].id,
      description: 'Updated trigger description',
      marketMovement: 'Updated market movement',
      directionOptionId: updatedDirection!.id,
      notes: 'Updated trigger note',
    });

    const { hook } = memoryLocation({ path: `/journal/trades/${trade.id}/journal`, static: true });
    render(
      <Router hook={hook}>
        <Route path="/journal/trades/:id/journal" component={JournalTradeReview} />
      </Router>,
    );

    const card = await screen.findByTestId('card-linked-trigger-details');
    expect(within(card).getByText('Updated trigger description')).toBeTruthy();
    expect(within(card).getByText('Updated market movement')).toBeTruthy();
    expect(within(card).getByText('Updated trigger note')).toBeTruthy();
    expect(within(card).getByText('صعودی')).toBeTruthy();
    expect(within(card).getByText(entryTriggerOptions[1].label)).toBeTruthy();
  });
});
