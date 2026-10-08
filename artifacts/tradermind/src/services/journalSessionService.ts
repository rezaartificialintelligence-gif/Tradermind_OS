import {
  db,
  type Account,
  type JournalMedia,
  type JournalOption,
  type JournalSession,
  type JournalSessionAnalysis,
  type JournalSessionEvent,
  type JournalTradeData,
  type JournalTriggerEvent,
  type Strategy,
  type StrategyVersion,
  type Trade,
} from '../db/database';
import { getNetPnl, isBreakEven, isClosed, isLoss, isWin } from '../lib/tradeHelpers';

export const JOURNAL_OPTION_CATEGORIES = [
  { id: 'timeframe', label: 'تایم‌فریم' },
  { id: 'entry_trigger', label: 'تریگر ورود' },
  { id: 'exit_reason', label: 'دلیل خروج' },
  { id: 'entry_reason', label: 'دلیل ورود' },
  { id: 'psychology', label: 'حالت روانی' },
  { id: 'emotion', label: 'احساسات' },
  { id: 'strategy_rule', label: 'قانون استراتژی' },
  { id: 'checklist', label: 'چک‌لیست ورود' },
  { id: 'setup_type', label: 'نوع ستاپ' },
  { id: 'setup_grade', label: 'درجه ستاپ' },
  { id: 'market_condition', label: 'شرایط بازار' },
  { id: 'market', label: 'بازار' },
  { id: 'scenario_outcome', label: 'نتیجهٔ سناریو' },
  { id: 'liquidity_type', label: 'نوع نقدینگی' },
  { id: 'mistake', label: 'اشتباه' },
  { id: 'tag', label: 'برچسب' },
  { id: 'obstacle', label: 'مانع' },
  { id: 'trade_management', label: 'مدیریت معامله' },
  { id: 'session_type', label: 'نوع سشن' },
  { id: 'review_category', label: 'دسته‌بندی مرور' },
  { id: 'direction', label: 'جهت بازار' },
  { id: 'market_structure', label: 'ساختار بازار' },
  { id: 'session_event_type', label: 'رویداد بدون معامله' },
  { id: 'sco_type', label: 'نوع SCO' },
  { id: 'fvg_type', label: 'نوع FVG' },
] as const;

export type JournalOptionCategory = typeof JOURNAL_OPTION_CATEGORIES[number]['id'];

const DEFAULT_OPTIONS: Record<JournalOptionCategory, string[]> = {
  timeframe: ['1M', '5M', '15M', '30M', '1H', '4H', 'Daily', 'Weekly'],
  entry_trigger: ['Liquidity Hunt', 'SCO', 'FVG Candle', 'Mitigation', 'Order Block'],
  exit_reason: ['TP', 'SL', 'Manual Exit', 'Structure Changed', 'Liquidity Taken', 'Psychology', 'Risk Reduction', 'Strategy Invalidated'],
  entry_reason: ['Strategy Setup', 'Breakout', 'Pullback', 'Liquidity Sweep', 'Custom'],
  psychology: ['Calm', 'Fear', 'FOMO', 'Revenge', 'Hesitation', 'Greed', 'Overconfidence', 'Impatience', 'Stress', 'Anxiety'],
  emotion: ['Calm', 'Confident', 'Focused', 'Fearful', 'Anxious', 'Frustrated', 'Greedy', 'Impatient'],
  strategy_rule: [],
  checklist: ['HTF Direction Confirmed', 'Liquidity Swept', 'Trigger Confirmed', 'Momentum Valid', 'No Major Obstacle', 'Risk Valid'],
  setup_type: ['Continuation', 'Reversal', 'Breakout', 'Pullback', 'Range', 'Liquidity Sweep'],
  setup_grade: ['A+', 'A', 'B', 'C', 'Invalid'],
  market_condition: ['Trending', 'Ranging', 'High Volatility', 'Low Volatility', 'News'],
  market: ['Forex', 'Crypto', 'Stocks', 'Indices', 'Commodities', 'Futures', 'Other'],
  scenario_outcome: ['Matched', 'Partially Matched', 'Invalidated', 'Not Triggered', 'Unclear'],
  liquidity_type: ['Equal Highs', 'Equal Lows', 'Previous High', 'Previous Low', 'Session High/Low'],
  mistake: ['Early Entry', 'Late Entry', 'FOMO', 'Revenge Trade', 'Ignored Rule', 'Ignored Obstacle', 'Oversized Position', 'Moved SL', 'Closed Early'],
  tag: ['A Setup', 'Needs Review'],
  obstacle: ['Mitigation Wall', 'Order Block', 'Fair Value Gap', 'News Event'],
  trade_management: ['Moved Stop Loss', 'Partial Close', 'Added to Position', 'Reduced Position', 'Manual Exit'],
  session_type: ['Asia', 'London', 'London/New York Overlap', 'New York', 'Custom'],
  review_category: ['Execution', 'Risk', 'Psychology', 'Market Context', 'Strategy'],
  direction: ['Bullish', 'Bearish', 'Neutral'],
  market_structure: ['Uptrend', 'Downtrend', 'Range', 'Breakout', 'Reversal'],
  session_event_type: ['Valid Setup — No Trade', 'Missed Trade', 'Invalid Setup', 'Observed Setup'],
  sco_type: [],
  fvg_type: [],
};

export interface CreateJournalSessionInput {
  accountId: string;
  tradingBoxId: string;
  strategyId: string;
  symbols: string[];
  marketOptionId?: string | null;
  startTime: number;
  sessionTypeOptionId?: string | null;
  notes?: string;
  tags?: string[];
  preTradePsychologyOptionIds?: string[];
}

export interface JournalSessionBundle {
  session: JournalSession;
  account?: Account;
  strategy?: Strategy;
  strategyVersion?: StrategyVersion;
  analyses: JournalSessionAnalysis[];
  triggers: JournalTriggerEvent[];
  trades: Trade[];
  tradeData: JournalTradeData[];
  events: JournalSessionEvent[];
  media: JournalMedia[];
  options: JournalOption[];
}

export type JournalSessionTimelineItem =
  | { id: string; kind: 'analysis'; timestamp: number; record: JournalSessionAnalysis }
  | { id: string; kind: 'trigger'; timestamp: number; record: JournalTriggerEvent }
  | { id: string; kind: 'trade'; timestamp: number; record: Trade }
  | { id: string; kind: 'event'; timestamp: number; record: JournalSessionEvent };

export interface JournalSessionMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  totalProfit: number;
  totalLoss: number;
  netPnl: number;
  totalR: number;
  averageR: number | null;
  bestTradeId: string | null;
  worstTradeId: string | null;
}

export interface JournalAnalyticsFilters {
  accountId?: string;
  tradingBoxId?: string;
  strategyId?: string;
  strategyVersionId?: string;
  symbol?: string;
  from?: number;
  to?: number;
  sessionId?: string;
  timeframeOptionId?: string;
  entryTriggerOptionId?: string;
  exitReasonOptionId?: string;
  psychologyOptionId?: string;
  mistakeOptionId?: string;
  setupGradeOptionId?: string;
  scoTypeOptionId?: string;
  fvgTypeOptionId?: string;
  minSetupQuality?: number;
  maxSetupQuality?: number;
  minExecutionQuality?: number;
  maxExecutionQuality?: number;
  strategyCompliance?: JournalTradeData['strategyCompliance'];
}

function uid(): string {
  return crypto.randomUUID();
}

function parseArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function psychologyHasOption(value: string | undefined, optionId: string): boolean {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.includes(optionId);
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, unknown>).some(phase =>
        phase && typeof phase === 'object'
        && Array.isArray((phase as { optionIds?: unknown }).optionIds)
        && ((phase as { optionIds: string[] }).optionIds).includes(optionId),
      );
    }
    return false;
  } catch {
    return false;
  }
}

function optionRecord(
  category: string,
  label: string,
  sortOrder: number,
  now: number,
  required = false,
): JournalOption {
  return {
    id: uid(),
    category,
    label,
    description: '',
    enabled: true,
    required,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

async function createVersionSnapshot(strategyId: string): Promise<StrategyVersion> {
  const strategy = await db.strategies.get(strategyId);
  if (!strategy) throw new Error('استراتژی انتخاب‌شده پیدا نشد.');

  const phases = await db.phases.where('strategyId').equals(strategyId).sortBy('order');
  const phaseIds = phases.map(phase => phase.id);
  const steps = phaseIds.length
    ? await db.steps.where('phaseId').anyOf(phaseIds).toArray()
    : [];
  const phaseOrder = new Map(phases.map(phase => [phase.id, phase.order]));
  steps.sort((a, b) => (phaseOrder.get(a.phaseId) ?? 0) - (phaseOrder.get(b.phaseId) ?? 0) || a.order - b.order);
  const stepIds = steps.map(step => step.id);
  const rules = stepIds.length
    ? await db.rules.where('stepId').anyOf(stepIds).toArray()
    : [];
  const stepOrder = new Map(steps.map(step => [step.id, step.order]));
  rules.sort((a, b) => stepIds.indexOf(a.stepId) - stepIds.indexOf(b.stepId) || a.order - b.order || stepOrder.get(a.stepId)! - stepOrder.get(b.stepId)!);
  const priorVersions = await db.strategyVersions.where('strategyId').equals(strategyId).count();
  const now = Date.now();

  return {
    id: uid(),
    strategyId,
    versionNumber: `1.${priorVersions}`,
    strategyName: strategy.name,
    description: strategy.description,
    rulesSnapshot: JSON.stringify({ phases, steps, rules }),
    createdAt: now,
  };
}

export const journalSessionService = {
  async ensureDefaultOptions(): Promise<void> {
    await db.transaction('rw', db.journalOptions, async () => {
      if (await db.journalOptions.count()) return;
      const now = Date.now();
      const records = Object.entries(DEFAULT_OPTIONS).flatMap(([category, labels]) =>
        labels.map((label, index) => optionRecord(category, label, index, now)),
      );
      if (records.length) await db.journalOptions.bulkAdd(records);
    });
  },

  async getOptions(category?: string, includeDisabled = false): Promise<JournalOption[]> {
    const records = category
      ? await db.journalOptions.where('category').equals(category).toArray()
      : await db.journalOptions.toArray();
    return records
      .filter(option => includeDisabled || option.enabled)
      .sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  },

  async createOption(data: Pick<JournalOption, 'category' | 'label'> & Partial<Pick<JournalOption, 'description' | 'required'>>): Promise<JournalOption> {
    const label = data.label.trim();
    if (!label) throw new Error('عنوان گزینه نمی‌تواند خالی باشد.');
    const siblings = await db.journalOptions.where('category').equals(data.category).toArray();
    if (siblings.some(item => item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
      throw new Error('این گزینه از قبل در همین دسته وجود دارد.');
    }
    const now = Date.now();
    const option = optionRecord(data.category, label, siblings.length ? Math.max(...siblings.map(item => item.sortOrder)) + 1 : 0, now, data.required ?? false);
    option.description = data.description?.trim() ?? '';
    await db.journalOptions.add(option);
    return option;
  },

  async updateOption(id: string, patch: Pick<JournalOption, 'label' | 'description'> & Partial<Pick<JournalOption, 'required'>>): Promise<void> {
    const label = patch.label.trim();
    if (!label) throw new Error('عنوان گزینه نمی‌تواند خالی باشد.');
    const existing = await db.journalOptions.get(id);
    if (!existing) throw new Error('گزینه پیدا نشد.');
    const siblings = await db.journalOptions.where('category').equals(existing.category).toArray();
    if (siblings.some(item => item.id !== id && item.label.trim().toLocaleLowerCase() === label.toLocaleLowerCase())) {
      throw new Error('این گزینه از قبل در همین دسته وجود دارد.');
    }
    await db.journalOptions.update(id, { ...patch, label, description: patch.description.trim(), updatedAt: Date.now() });
  },

  async setOptionEnabled(id: string, enabled: boolean): Promise<void> {
    if (!(await db.journalOptions.get(id))) throw new Error('گزینه پیدا نشد.');
    await db.journalOptions.update(id, { enabled, updatedAt: Date.now() });
  },

  async reorderOption(id: string, direction: -1 | 1): Promise<void> {
    const item = await db.journalOptions.get(id);
    if (!item) throw new Error('گزینه پیدا نشد.');
    const siblings = (await db.journalOptions.where('category').equals(item.category).toArray())
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex(sibling => sibling.id === id);
    const neighbor = siblings[index + direction];
    if (!neighbor) return;
    const reordered = [...siblings];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    await db.transaction('rw', db.journalOptions, async () => {
      for (const [sortOrder, option] of reordered.entries()) {
        await db.journalOptions.update(option.id, { sortOrder, updatedAt: Date.now() });
      }
    });
  },

  async createSession(input: CreateJournalSessionInput): Promise<JournalSession> {
    const [account, box, strategy] = await Promise.all([
      db.accounts.get(input.accountId),
      db.tradingBoxes.get(input.tradingBoxId),
      db.strategies.get(input.strategyId),
    ]);
    if (!account || account.isArchived) throw new Error('حساب فعال و معتبری انتخاب نشده است.');
    if (!box || box.status !== 'active') throw new Error('باکس معاملاتی فعال و معتبری انتخاب نشده است.');
    if (box.accountId && box.accountId !== account.id) throw new Error('این باکس متعلق به حساب انتخاب‌شده نیست.');
    if (!strategy) throw new Error('استراتژی انتخاب‌شده پیدا نشد.');
    const symbols = [...new Set(input.symbols.map(value => value.trim().toUpperCase()).filter(Boolean))];
    if (symbols.length !== 1) throw new Error('هر سشن باید دقیقاً یک نماد داشته باشد.');
    if (input.marketOptionId) {
      const market = await db.journalOptions.get(input.marketOptionId);
      if (!market || market.category !== 'market' || !market.enabled) throw new Error('بازار معتبری انتخاب نشده است.');
    }
    const preTradePsychologyOptionIds = [...new Set(input.preTradePsychologyOptionIds ?? [])];
    for (const optionId of preTradePsychologyOptionIds) {
      const option = await db.journalOptions.get(optionId);
      if (!option || option.category !== 'psychology' || !option.enabled) throw new Error('یکی از گزینه‌های حالت روانی معتبر نیست.');
    }

    const version = await createVersionSnapshot(input.strategyId);
    const now = Date.now();
    const session: JournalSession = {
      id: uid(),
      accountId: input.accountId,
      tradingBoxId: input.tradingBoxId,
      strategyId: input.strategyId,
      strategyVersionId: version.id,
      symbols: JSON.stringify(symbols),
      marketOptionId: input.marketOptionId ?? null,
      startTime: input.startTime,
      endTime: null,
      status: 'active',
      sessionTypeOptionId: input.sessionTypeOptionId ?? null,
      notes: input.notes?.trim() ?? '',
      tags: JSON.stringify(input.tags ?? []),
      preTradePsychology: JSON.stringify(preTradePsychologyOptionIds),
      lessonsLearned: '',
      mistakesReview: '',
      psychologicalReview: '',
      strategyObservations: '',
      strategyChangeProposal: '',
      sessionQuality: null,
      finalReflection: '',
      createdAt: now,
      updatedAt: now,
    };

    await db.transaction('rw', db.strategyVersions, db.journalSessions, async () => {
      await db.strategyVersions.add(version);
      await db.journalSessions.add(session);
    });
    return session;
  },

  async getSessions(): Promise<JournalSession[]> {
    return db.journalSessions.orderBy('startTime').reverse().toArray();
  },

  async getSession(id: string): Promise<JournalSession | undefined> {
    return db.journalSessions.get(id);
  },

  async updateSession(id: string, patch: Partial<Omit<JournalSession, 'id' | 'createdAt' | 'strategyVersionId'>>): Promise<void> {
    const current = await db.journalSessions.get(id);
    if (!current) throw new Error('سشن پیدا نشد.');
    const nextStatus = patch.status ?? current.status;
    await db.journalSessions.update(id, {
      ...patch,
      endTime: nextStatus === 'active' ? null : (patch.endTime ?? current.endTime ?? Date.now()),
      updatedAt: Date.now(),
    });
  },

  async getBundle(id: string): Promise<JournalSessionBundle | undefined> {
    const session = await db.journalSessions.get(id);
    if (!session) return undefined;
    const [account, strategy, strategyVersion, analyses, triggers, trades, tradeData, events, media, options] = await Promise.all([
      db.accounts.get(session.accountId),
      db.strategies.get(session.strategyId),
      db.strategyVersions.get(session.strategyVersionId),
      db.journalSessionAnalyses.where('sessionId').equals(id).sortBy('createdAt'),
      db.journalTriggerEvents.where('sessionId').equals(id).sortBy('createdAt'),
      db.trades.where('journalSessionId').equals(id).toArray(),
      db.journalTradeData.where('journalSessionId').equals(id).toArray(),
      db.journalSessionEvents.where('sessionId').equals(id).sortBy('eventAt'),
      db.journalMedia.where('sessionId').equals(id).sortBy('createdAt'),
      this.getOptions(undefined, true),
    ]);
    return { session, account, strategy, strategyVersion, analyses, triggers, trades, tradeData, events, media, options };
  },

  async saveAnalysis(
    input: Omit<JournalSessionAnalysis, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<JournalSessionAnalysis> {
    const [session, timeframe] = await Promise.all([
      db.journalSessions.get(input.sessionId),
      db.journalOptions.get(input.timeframeOptionId),
    ]);
    if (!session) throw new Error('سشن پیدا نشد.');
    if (!timeframe || timeframe.category !== 'timeframe' || (!timeframe.enabled && !input.id)) {
      throw new Error('تایم‌فریم معتبر و فعالی انتخاب نشده است.');
    }
    const existing = input.id ? await db.journalSessionAnalyses.get(input.id) : undefined;
    if (input.id && (!existing || existing.sessionId !== input.sessionId)) throw new Error('رویداد تحلیل پیدا نشد.');
    for (const tradeId of [input.previousTradeId, input.nextTradeId]) {
      if (!tradeId) continue;
      const linkedTrade = await db.trades.get(tradeId);
      if (!linkedTrade || linkedTrade.journalSessionId !== input.sessionId) throw new Error('معاملهٔ پیوندشده به این سشن تعلق ندارد.');
    }
    const now = Date.now();
    const record: JournalSessionAnalysis = {
      ...input,
      id: existing?.id ?? uid(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      analysisText: input.analysisText ?? '',
      marketContext: input.marketContext ?? '',
      scenario: input.scenario ?? '',
      triggerContext: input.triggerContext ?? '',
      previousTradeId: input.previousTradeId ?? null,
      nextTradeId: input.nextTradeId ?? null,
    };
    await db.journalSessionAnalyses.put(record);
    return record;
  },

  async createAnalysisEvent(input: Omit<JournalSessionAnalysis, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalSessionAnalysis> {
    return this.saveAnalysis(input);
  },

  async updateAnalysisEvent(id: string, input: Omit<JournalSessionAnalysis, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalSessionAnalysis> {
    return this.saveAnalysis({ ...input, id });
  },

  async deleteAnalysisEvent(id: string): Promise<void> {
    const analysis = await db.journalSessionAnalyses.get(id);
    if (!analysis) return;
    await db.transaction('rw', db.journalSessionAnalyses, db.journalTriggerEvents, db.journalMedia, async () => {
      await db.journalTriggerEvents.where('analysisEventId').equals(id).modify({ analysisEventId: null });
      await db.journalMedia.where('analysisId').equals(id).modify({ analysisId: null, category: 'session' });
      await db.journalSessionAnalyses.delete(id);
    });
  },

  async createTriggerEvent(
    input: Omit<JournalTriggerEvent, 'id' | 'createdAt' | 'updatedAt' | 'linkedTradeId' | 'status'> & {
      status?: JournalTriggerEvent['status'];
    },
  ): Promise<JournalTriggerEvent> {
    const [session, timeframe, analysis, triggerType, direction] = await Promise.all([
      db.journalSessions.get(input.sessionId),
      db.journalOptions.get(input.timeframeOptionId),
      input.analysisEventId ? db.journalSessionAnalyses.get(input.analysisEventId) : Promise.resolve(undefined),
      input.triggerTypeOptionId ? db.journalOptions.get(input.triggerTypeOptionId) : Promise.resolve(undefined),
      input.directionOptionId ? db.journalOptions.get(input.directionOptionId) : Promise.resolve(undefined),
    ]);
    if (!session) throw new Error('سشن پیدا نشد.');
    if (!timeframe || timeframe.category !== 'timeframe' || !timeframe.enabled) throw new Error('تایم‌فریم معتبر و فعالی انتخاب نشده است.');
    if (input.analysisEventId && (!analysis || analysis.sessionId !== session.id)) throw new Error('تحلیل انتخاب‌شده به این سشن تعلق ندارد.');
    if (input.triggerTypeOptionId && (!triggerType || triggerType.category !== 'entry_trigger' || !triggerType.enabled)) throw new Error('نوع تریگر معتبر نیست.');
    if (input.directionOptionId && (!direction || direction.category !== 'direction' || !direction.enabled)) throw new Error('جهت انتخاب‌شده معتبر نیست.');
    const now = Date.now();
    const event: JournalTriggerEvent = {
      ...input,
      id: uid(),
      status: input.status ?? 'pending',
      linkedTradeId: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.journalTriggerEvents.add(event);
    return event;
  },

  async updateTriggerEvent(id: string, patch: Partial<Pick<JournalTriggerEvent, 'status' | 'confirmed' | 'notes'>>): Promise<void> {
    const event = await db.journalTriggerEvents.get(id);
    if (!event) throw new Error('رویداد تریگر پیدا نشد.');
    if (event.linkedTradeId && patch.status && patch.status !== 'converted') {
      throw new Error('تریگرِ پیوندخورده به معامله را نمی‌توان به وضعیت دیگری تغییر داد.');
    }
    await db.journalTriggerEvents.update(id, { ...patch, updatedAt: Date.now() });
  },

  async linkTriggerToTrade(triggerId: string, tradeId: string): Promise<void> {
    await db.transaction('rw', db.journalTriggerEvents, db.trades, async () => {
      const [trigger, trade] = await Promise.all([
        db.journalTriggerEvents.get(triggerId),
        db.trades.get(tradeId),
      ]);
      if (!trigger || !trade) throw new Error('تریگر یا معامله پیدا نشد.');
      if (!trigger.confirmed) throw new Error('برای ثبت معامله، تریگر باید تأیید شده باشد.');
      if (trigger.linkedTradeId && trigger.linkedTradeId !== trade.id) throw new Error('این تریگر قبلاً به معاملهٔ دیگری وصل شده است.');
      if (trade.journalSessionId && trade.journalSessionId !== trigger.sessionId) throw new Error('معامله به سشن دیگری تعلق دارد.');
      await db.trades.update(trade.id, {
        journalSessionId: trigger.sessionId,
        journalTriggerEventId: trigger.id,
        journalAnalysisEventId: trigger.analysisEventId,
      });
      await db.journalTriggerEvents.update(trigger.id, {
        linkedTradeId: trade.id,
        status: 'converted',
        updatedAt: Date.now(),
      });
    });
  },

  async getTimeline(sessionId: string): Promise<JournalSessionTimelineItem[]> {
    const bundle = await this.getBundle(sessionId);
    if (!bundle) return [];
    return [
      ...bundle.analyses.map(record => ({ id: record.id, kind: 'analysis' as const, timestamp: record.createdAt, record })),
      ...bundle.triggers.map(record => ({ id: record.id, kind: 'trigger' as const, timestamp: record.createdAt, record })),
      ...bundle.trades.map(record => ({ id: record.id, kind: 'trade' as const, timestamp: record.closedAt ?? record.openedAt, record })),
      ...bundle.events.map(record => ({ id: record.id, kind: 'event' as const, timestamp: record.eventAt, record })),
    ].sort((a, b) => a.timestamp - b.timestamp);
  },

  async saveTradeData(input: Omit<JournalTradeData, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalTradeData> {
    const trade = await db.trades.get(input.tradeId);
    const session = await db.journalSessions.get(input.journalSessionId);
    if (!trade || !session) throw new Error('معامله یا سشن پیدا نشد.');
    if (trade.journalSessionId !== session.id) throw new Error('معامله به این سشن متصل نیست.');
    const existing = await db.journalTradeData.where('tradeId').equals(input.tradeId).first();
    const now = Date.now();
    const record: JournalTradeData = {
      ...input,
      id: existing?.id ?? input.tradeId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.journalTradeData.put(record);
    return record;
  },

  async addEvent(input: Pick<JournalSessionEvent, 'sessionId' | 'typeOptionId' | 'notes' | 'eventAt'>): Promise<JournalSessionEvent> {
    const [session, option] = await Promise.all([
      db.journalSessions.get(input.sessionId),
      db.journalOptions.get(input.typeOptionId),
    ]);
    if (!session) throw new Error('سشن پیدا نشد.');
    if (!option || option.category !== 'session_event_type' || !option.enabled) throw new Error('نوع رویداد معتبر انتخاب نشده است.');
    const now = Date.now();
    const event: JournalSessionEvent = { ...input, id: uid(), createdAt: now, updatedAt: now };
    await db.journalSessionEvents.add(event);
    return event;
  },

  async deleteEvent(id: string): Promise<void> {
    await db.journalSessionEvents.delete(id);
  },

  async saveMedia(input: {
    sessionId?: string | null;
    tradeId?: string | null;
    analysisId?: string | null;
    triggerId?: string | null;
    reviewId?: string | null;
    category: JournalMedia['category'];
    file: File;
    caption?: string;
  }): Promise<JournalMedia> {
    if (!input.file.size) throw new Error('فایل خالی است.');
    if (input.triggerId) {
      const trigger = await db.journalTriggerEvents.get(input.triggerId);
      if (!trigger || (input.sessionId && trigger.sessionId !== input.sessionId)) throw new Error('تریگر انتخاب‌شده معتبر نیست.');
    }
    const record: JournalMedia = {
      id: uid(),
      sessionId: input.sessionId ?? null,
      tradeId: input.tradeId ?? null,
      analysisId: input.analysisId ?? null,
      triggerId: input.triggerId ?? null,
      reviewId: input.reviewId ?? null,
      category: input.category,
      fileName: input.file.name,
      mimeType: input.file.type || 'application/octet-stream',
      blob: input.file.slice(0, input.file.size, input.file.type || 'application/octet-stream'),
      caption: input.caption?.trim() ?? '',
      createdAt: Date.now(),
    };
    if (!record.sessionId && !record.tradeId && !record.analysisId && !record.triggerId && !record.reviewId) {
      throw new Error('فایل باید به سشن، معامله، تحلیل، تریگر یا مرور وصل باشد.');
    }
    await db.journalMedia.add(record);
    return record;
  },

  async deleteMedia(id: string): Promise<void> {
    await db.journalMedia.delete(id);
  },

  async getSessionMetrics(sessionId: string): Promise<JournalSessionMetrics> {
    return this.calculateMetrics(await db.trades.where('journalSessionId').equals(sessionId).toArray());
  },

  calculateMetrics(trades: Trade[]): JournalSessionMetrics {
    const settled = trades.filter(trade =>
      isClosed(trade)
      && ['win', 'partial-win', 'loss', 'partial-loss', 'breakeven'].includes(trade.result),
    );
    const wins = settled.filter(isWin).length;
    const losses = settled.filter(isLoss).length;
    const breakeven = settled.filter(isBreakEven).length;
    const pnls = settled.map(getNetPnl).filter((value): value is number => value !== null);
    const totalProfit = pnls.filter(value => value > 0).reduce((sum, value) => sum + value, 0);
    const totalLoss = Math.abs(pnls.filter(value => value < 0).reduce((sum, value) => sum + value, 0));
    const rTrades = settled.filter(trade => trade.rMultiple !== null);
    const rs = rTrades.map(trade => trade.rMultiple as number);
    const byR = [...rTrades].sort((a, b) => (a.rMultiple ?? 0) - (b.rMultiple ?? 0));
    return {
      totalTrades: trades.length,
      wins,
      losses,
      breakeven,
      winRate: settled.length ? (wins / settled.length) * 100 : null,
      totalProfit,
      totalLoss,
      netPnl: pnls.reduce((sum, value) => sum + value, 0),
      totalR: rs.reduce((sum, value) => sum + value, 0),
      averageR: rs.length ? rs.reduce((sum, value) => sum + value, 0) / rs.length : null,
      bestTradeId: byR[byR.length - 1]?.id ?? null,
      worstTradeId: byR[0]?.id ?? null,
    };
  },

  async getAnalytics(filters: JournalAnalyticsFilters = {}): Promise<{ trades: Trade[]; tradeData: JournalTradeData[]; metrics: JournalSessionMetrics }> {
    let trades = await db.trades.toArray();
    const [sessions, analyses, allMeta] = await Promise.all([
      db.journalSessions.toArray(),
      db.journalSessionAnalyses.toArray(),
      db.journalTradeData.toArray(),
    ]);
    const sessionById = new Map(sessions.map(session => [session.id, session]));
    const metaByTradeId = new Map(allMeta.map(meta => [meta.tradeId, meta]));
    const analysisBySession = new Map<string, JournalSessionAnalysis[]>();
    for (const analysis of analyses) {
      analysisBySession.set(analysis.sessionId, [...(analysisBySession.get(analysis.sessionId) ?? []), analysis]);
    }

    trades = trades.filter(trade => {
      const session = trade.journalSessionId ? sessionById.get(trade.journalSessionId) : undefined;
      const meta = metaByTradeId.get(trade.id);
      if (!session) return false;
      if (filters.accountId && session.accountId !== filters.accountId) return false;
      if (filters.tradingBoxId && session.tradingBoxId !== filters.tradingBoxId) return false;
      if (filters.strategyId && session.strategyId !== filters.strategyId) return false;
      if (filters.strategyVersionId && session.strategyVersionId !== filters.strategyVersionId) return false;
      if (filters.sessionId && session.id !== filters.sessionId) return false;
      if (filters.symbol && !parseArray(session.symbols).some(symbol => symbol.toLowerCase().includes(filters.symbol!.toLowerCase()))) return false;
      if (filters.from != null && trade.openedAt < filters.from) return false;
      if (filters.to != null && trade.openedAt > filters.to) return false;
      if (filters.entryTriggerOptionId && !parseArray(meta?.entryTriggerOptionIds).includes(filters.entryTriggerOptionId)) return false;
      if (filters.exitReasonOptionId && meta?.exitReasonOptionId !== filters.exitReasonOptionId) return false;
      if (filters.psychologyOptionId && !psychologyHasOption(meta?.psychology, filters.psychologyOptionId)) return false;
      if (filters.mistakeOptionId && !parseArray(meta?.mistakeOptionIds).includes(filters.mistakeOptionId)) return false;
      if (filters.setupGradeOptionId && meta?.setupGradeOptionId !== filters.setupGradeOptionId) return false;
      if (filters.scoTypeOptionId && meta?.scoTypeOptionId !== filters.scoTypeOptionId) return false;
      if (filters.fvgTypeOptionId && meta?.fvgTypeOptionId !== filters.fvgTypeOptionId) return false;
      if (filters.minSetupQuality != null && (meta?.setupQuality == null || meta.setupQuality < filters.minSetupQuality)) return false;
      if (filters.maxSetupQuality != null && (meta?.setupQuality == null || meta.setupQuality > filters.maxSetupQuality)) return false;
      if (filters.minExecutionQuality != null && (meta?.executionQuality == null || meta.executionQuality < filters.minExecutionQuality)) return false;
      if (filters.maxExecutionQuality != null && (meta?.executionQuality == null || meta.executionQuality > filters.maxExecutionQuality)) return false;
      if (filters.strategyCompliance && meta?.strategyCompliance !== filters.strategyCompliance) return false;
      if (filters.timeframeOptionId && !(analysisBySession.get(session.id) ?? []).some(item => item.timeframeOptionId === filters.timeframeOptionId)) return false;
      return true;
    });
    const tradeData = trades.map(trade => metaByTradeId.get(trade.id)).filter((item): item is JournalTradeData => Boolean(item));
    return { trades, tradeData, metrics: this.calculateMetrics(trades) };
  },
};

export function parseJournalArray(value: string | null | undefined): string[] {
  return parseArray(value);
}
