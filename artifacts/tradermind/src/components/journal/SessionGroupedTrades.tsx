import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { CalendarIcon, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { getNetPnl } from '../../lib/tradeHelpers';
import { parseJournalArray } from '../../services/journalSessionService';
import type { JournalSession, Trade } from '../../db/database';

const DIRECTION_FA: Record<string, string> = { long: 'خرید', short: 'فروش' };
const RESULT_FA: Record<string, string> = {
  win: 'سود', 'partial-win': 'سود نسبی', loss: 'زیان', 'partial-loss': 'زیان نسبی',
  breakeven: 'سر به سر', open: 'باز', cancelled: 'لغوشده',
};
const RESULT_TONE: Record<string, string> = {
  win: 'text-emerald-500', 'partial-win': 'text-emerald-500', loss: 'text-rose-500', 'partial-loss': 'text-rose-500',
};

const faDate = (timestamp: number) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(timestamp);
const faDateTime = (timestamp: number) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp);
const dayKey = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-CA');

interface TradeGroup {
  key: string;
  kind: 'session' | 'day';
  session?: JournalSession;
  title: string;
  subtitle: string;
  trades: Trade[];
  latest: number;
  netPnl: number;
  wins: number;
  losses: number;
}

/** معاملات را زیر سشن خودشان گروه می‌کند؛ معاملات بدون سشن بر اساس روز. */
export function groupTradesBySession(trades: Trade[], sessions: JournalSession[]): TradeGroup[] {
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  const groups = new Map<string, TradeGroup>();
  for (const trade of trades) {
    const session = trade.journalSessionId ? sessionById.get(trade.journalSessionId) : undefined;
    const key = session ? `s:${session.id}` : `d:${dayKey(trade.openedAt)}`;
    let group = groups.get(key);
    if (!group) {
      group = session
        ? {
            key, kind: 'session', session,
            title: `سشن ${faDate(session.startTime)}`,
            subtitle: parseJournalArray(session.symbols).join('، '),
            trades: [], latest: 0, netPnl: 0, wins: 0, losses: 0,
          }
        : {
            key, kind: 'day',
            title: `معاملات روز ${faDate(trade.openedAt)}`,
            subtitle: 'بدون سشن',
            trades: [], latest: 0, netPnl: 0, wins: 0, losses: 0,
          };
      groups.set(key, group);
    }
    group.trades.push(trade);
    group.latest = Math.max(group.latest, trade.openedAt);
    group.netPnl += getNetPnl(trade) ?? 0;
    if (trade.result === 'win' || trade.result === 'partial-win') group.wins += 1;
    if (trade.result === 'loss' || trade.result === 'partial-loss') group.losses += 1;
  }
  const list = Array.from(groups.values());
  for (const group of list) group.trades.sort((a, b) => b.openedAt - a.openedAt);
  return list.sort((a, b) => b.latest - a.latest);
}

interface SessionGroupedTradesProps {
  trades: Trade[];
  sessions: JournalSession[];
  selectedIds: Set<string>;
  onToggleMany: (ids: string[], select: boolean) => void;
  onOpenTrade: (id: string) => void;
}

export function SessionGroupedTrades({ trades, sessions, selectedIds, onToggleMany, onOpenTrade }: SessionGroupedTradesProps) {
  const groups = useMemo(() => groupTradesBySession(trades, sessions), [trades, sessions]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (key: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className="space-y-3" data-testid="list-trades-by-session">
      {groups.map(group => {
        const ids = group.trades.map(trade => trade.id);
        const allSelected = ids.every(id => selectedIds.has(id));
        const isSession = group.kind === 'session';
        const isOpen = expanded.has(group.key);
        const pnlTone = group.netPnl > 0 ? 'text-emerald-500' : group.netPnl < 0 ? 'text-rose-500' : '';
        return (
          <Card key={group.key} className="overflow-hidden" data-testid={`group-trades-${group.key}`}>
            <CardContent className="p-0">
              <div className="flex items-start gap-3 p-4">
                <div className="pt-1" onClick={event => event.stopPropagation()}>
                  <Checkbox checked={allSelected} onCheckedChange={() => onToggleMany(ids, !allSelected)} aria-label="انتخاب همهٔ معاملات این گروه" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {isSession ? <Layers className="h-4 w-4 shrink-0 text-primary" /> : <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    {isSession && group.session
                      ? <Link href={`/journal/sessions/${group.session.id}`} className="min-w-0 break-words font-semibold text-primary hover:underline" data-testid={`link-session-${group.session.id}`}>{group.title}</Link>
                      : <span className="min-w-0 break-words font-semibold">{group.title}</span>}
                    {group.subtitle && <Badge variant="outline" className="text-[10px]">{group.subtitle}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{group.trades.length.toLocaleString('fa-IR')} معامله</span>
                    <span className="text-emerald-500">{group.wins.toLocaleString('fa-IR')} سود</span>
                    <span className="text-rose-500">{group.losses.toLocaleString('fa-IR')} زیان</span>
                    <span className={`font-mono font-medium ${pnlTone}`} dir="ltr">{group.netPnl >= 0 ? '+' : ''}{group.netPnl.toFixed(2)}</span>
                  </div>
                </div>
                {isSession && group.session
                  ? <Link href={`/journal/sessions/${group.session.id}`} className="shrink-0 rounded-md border px-3 py-1.5 text-xs text-primary hover:bg-primary/5" data-testid={`button-open-session-${group.session.id}`}>مشاهدهٔ سشن</Link>
                  : <button type="button" className="flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted/40" onClick={() => toggleExpanded(group.key)} data-testid={`button-expand-${group.key}`}>{isOpen ? 'بستن' : 'نمایش'}{isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>}
              </div>
              {!isSession && isOpen && (
                <div className="divide-y divide-border/60 border-t bg-muted/10">
                  {group.trades.map(trade => {
                    const net = getNetPnl(trade);
                    return (
                      <div key={trade.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/30" onClick={() => onOpenTrade(trade.id)} data-testid={`row-trade-${trade.id}`}>
                        <div onClick={event => event.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(trade.id)} onCheckedChange={() => onToggleMany([trade.id], !selectedIds.has(trade.id))} aria-label="انتخاب معامله" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-bold">{trade.symbol}</span>
                            <span className="text-xs text-muted-foreground">{DIRECTION_FA[trade.direction] ?? trade.direction}</span>
                            <span className={`text-xs ${RESULT_TONE[trade.result] ?? 'text-muted-foreground'}`}>{RESULT_FA[trade.result] ?? trade.result}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{faDateTime(trade.openedAt)}</div>
                        </div>
                        <div className="shrink-0 text-left text-xs font-mono" dir="ltr">
                          <div className={net != null && net > 0 ? 'text-emerald-500' : net != null && net < 0 ? 'text-rose-500' : ''}>{net != null ? net.toFixed(2) : '-'}</div>
                          <div className="text-muted-foreground">{trade.rMultiple != null ? `${trade.rMultiple}R` : '-'}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
