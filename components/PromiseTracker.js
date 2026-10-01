'use client';
import { useMemo, useState } from 'react';
import { Handshake, CalendarClock, AlertOctagon, CheckCircle2, Clock } from 'lucide-react';
import { Card, Tabs, Progress, cx } from './ui';
import { PromiseBadge } from './PromiseBadge';
import { promiseState, promiseLeft, daysBetween, startOfDay } from '@/lib/metrics';
import { short, money, fmtDate, fmtDateShort, pct, fmtPct } from '@/lib/format';

/** Promise-to-pay KPI card: everything committed but not yet received */
export default function PromiseTracker({ promises, onOpen, rangeFrom, rangeTo, currency }) {
  const [tab, setTab] = useState('attention');
  const now = new Date();
  const V = useMemo(() => {
    const list = promises.map((p) => ({ ...p, state: promiseState(p, now), left: promiseLeft(p), days: daysBetween(now, p.promiseDate) }));
    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const open = list.filter((p) => ['open', 'today', 'broken'].includes(p.state));
    const today = list.filter((p) => p.state === 'today');
    const week = list.filter((p) => p.state === 'open' && p.days <= 7);
    const broken = list.filter((p) => p.state === 'broken');
    const inRange = list.filter((p) => new Date(p.promiseDate) >= rangeFrom && new Date(p.promiseDate) <= rangeTo && p.state !== 'open' && p.state !== 'today');
    const keptAmt = sum(inRange, (p) => p.fulfilled || 0);
    const dueAmt = sum(inRange, (p) => p.amount);
    // next 14 days calendar strip
    const strip = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(startOfDay(now).getTime() + i * 86400000);
      const items = open.filter((p) => daysBetween(d, p.promiseDate) === 0);
      return { d, amt: sum(items, (p) => p.left), n: items.length };
    });
    return {
      list, open, today, week, broken, inRange, strip,
      openAmt: sum(open, (p) => p.left), todayAmt: sum(today, (p) => p.left), weekAmt: sum(week, (p) => p.left), brokenAmt: sum(broken, (p) => p.left),
      keepRate: pct(keptAmt, dueAmt), keptAmt, dueAmt,
    };
  }, [promises, rangeFrom, rangeTo]); // eslint-disable-line

  const rows = {
    attention: [...V.today, ...V.broken],
    upcoming: V.list.filter((p) => p.state === 'open'),
    broken: V.broken,
    kept: V.list.filter((p) => p.state === 'kept' || p.state === 'late'),
    all: V.list,
  }[tab].sort((a, b) => new Date(a.promiseDate) - new Date(b.promiseDate));
  const stripMax = Math.max(1, ...V.strip.map((s) => s.amt));

  const tiles = [
    { icon: Handshake, label: 'Promised (open)', v: V.openAmt, sub: `${V.open.length} promises`, cls: 'text-violet-300' },
    { icon: Clock, label: 'Due today', v: V.todayAmt, sub: `${V.today.length} to follow up`, cls: 'text-amber-300' },
    { icon: CalendarClock, label: 'Next 7 days', v: V.weekAmt, sub: `${V.week.length} upcoming`, cls: 'text-sky-300' },
    { icon: AlertOctagon, label: 'Broken', v: V.brokenAmt, sub: `${V.broken.length} missed the date`, cls: 'text-rose-300' },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2"><Handshake className="h-5 w-5 text-violet-300" /><h2 className="font-bold text-white">Promise-to-pay tracker</h2></div>
          <p className="mt-0.5 text-xs text-slate-400">Money customers committed to pay on a date — not counted as collected until it arrives.</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Keep rate (range)</div>
          <div className={cx('num text-2xl font-bold', V.keepRate >= 80 ? 'text-emerald-300' : V.keepRate >= 50 ? 'text-amber-300' : 'text-rose-300')}>{V.dueAmt ? fmtPct(V.keepRate) : '—'}</div>
          <div className="num text-[11px] text-slate-500">{short(V.keptAmt)} of {short(V.dueAmt)} received</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/[0.04] lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-ink-900 p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><t.icon className={cx('h-3.5 w-3.5', t.cls)} />{t.label}</div>
            <div className={cx('num mt-1 text-xl font-bold', t.cls)}>{short(t.v)}</div>
            <div className="text-xs text-slate-500">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="border-y border-white/[0.06] px-4 py-3 sm:px-5">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Expected inflow — next 14 days</div>
        <div className="flex items-end gap-1">
          {V.strip.map((s, i) => (
            <div key={i} className="group flex flex-1 flex-col items-center gap-1" title={`${fmtDate(s.d)}: ${money(s.amt, currency)} (${s.n})`}>
              {s.amt > 0 && <div className="num text-[9px] text-violet-200/80">{short(s.amt)}</div>}
              <div className="flex h-14 w-full items-end"><div className={cx('w-full rounded-t-md transition-all', i === 0 ? 'bg-amber-400' : 'bg-violet-500/70 group-hover:bg-violet-400')} style={{ height: s.amt ? `${Math.max(8, (s.amt / stripMax) * 100)}%` : '2px' }} /></div>
              <div className={cx('text-[9px]', i === 0 ? 'font-bold text-amber-300' : 'text-slate-500')}>{i === 0 ? 'Today' : fmtDateShort(s.d).split(' ')[0]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pt-3 sm:px-5">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'attention', label: `Needs action (${V.today.length + V.broken.length})` },
          { value: 'upcoming', label: 'Upcoming' }, { value: 'broken', label: 'Broken' }, { value: 'kept', label: 'Kept' }, { value: 'all', label: 'All' },
        ]} />
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2 sm:p-3">
        {!rows.length && <div className="p-8 text-center text-sm text-slate-500">{tab === 'attention' ? 'Nothing due today and no broken promises 👌' : 'No promises here'}</div>}
        {rows.map((p) => (
          <button key={p._id} onClick={() => onOpen(p.customer?._id)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.03]">
            <div className={cx('w-14 shrink-0 rounded-lg py-1 text-center', p.state === 'broken' ? 'bg-rose-500/15 text-rose-200' : p.state === 'today' ? 'bg-amber-400/15 text-amber-200' : 'bg-white/[0.04] text-slate-300')}>
              <div className="text-[10px] uppercase">{new Date(p.promiseDate).toLocaleDateString('en-GB', { month: 'short' })}</div>
              <div className="num text-lg font-bold leading-none">{new Date(p.promiseDate).getDate()}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-white">{p.customer?.name}</span>{p.customer?.company && <span className="text-[10px] font-bold text-slate-500">{p.customer.company}</span>}</div>
              <div className="truncate text-xs text-slate-500">by {p.user?.name}{p.reason && ` · “${p.reason}”`}{p.state === 'broken' && <span className="text-rose-300"> · {-p.days}d late</span>}{p.state === 'open' && ` · in ${p.days}d`}</div>
              {p.fulfilled > 0 && p.state !== 'kept' && <Progress value={pct(p.fulfilled, p.amount)} className="mt-1 !h-1 max-w-[160px]" color="bg-violet-400" />}
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-sm font-bold text-violet-200">{short(p.state === 'kept' || p.state === 'late' ? p.amount : p.left)}</div>
              <PromiseBadge p={p} />
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
