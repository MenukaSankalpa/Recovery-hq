'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Users, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Modal, Progress, Spinner, Badge, Tabs } from './ui';
import { api } from '@/lib/client';
import { enrich, daysBetween, groupDays } from '@/lib/metrics';
import { money, short, fmtDate, fmtDateTime, fmtPct, pct } from '@/lib/format';

/** Everything about one group: who collected what & when, who missed, what is still due after the deadline */
export default function GroupDetail({ id, open, onClose, currency }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('customers');
  useEffect(() => {
    setD(null);
    setTab('customers');
    if (open && id) api(`/api/groups/${id}`).then(setD).catch(() => {});
  }, [open, id]);

  const view = useMemo(() => {
    if (!d) return null;
    const now = new Date();
    const g = d.group;
    const rows = d.customers.map((c0) => {
      const c = enrich(c0);
      const mine = d.entries.filter((e) => String(e.customer?._id) === String(c._id));
      const pays = mine.filter((e) => e.type === 'payment');
      const misses = mine.filter((e) => e.type === 'no_payment');
      const got = pays.reduce((s, e) => s + e.amount, 0);
      return { ...c, got, pays, misses, lastPay: pays[0], lastMiss: misses[0], target: c.balance + got };
    });
    const collected = rows.reduce((s, r) => s + r.got, 0);
    const outstanding = g.status === 'active' ? rows.reduce((s, r) => s + r.balance, 0) : 0;
    const end = new Date(g.endDate);
    const daysLeft = daysBetween(now, end);
    const byUser = {};
    d.entries.forEach((e) => {
      const k = e.user?.name || '—';
      byUser[k] = byUser[k] || { name: k, amount: 0, pays: 0, misses: 0, last: null };
      if (e.type === 'payment') { byUser[k].amount += e.amount; byUser[k].pays++; } else if (e.type === 'no_payment') byUser[k].misses++;
      if (!byUser[k].last || new Date(e.date) > new Date(byUser[k].last)) byUser[k].last = e.date;
    });
    return { g, rows, collected, outstanding, target: collected + outstanding, daysLeft, total: groupDays(g), byUser: Object.values(byUser).sort((a, b) => b.amount - a.amount) };
  }, [d]);

  return (
    <Modal open={open} onClose={onClose} wide title={view ? view.g.name : 'Group'}>
      {!view ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400">
            <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{fmtDate(view.g.startDate)} → {fmtDate(view.g.endDate)} ({view.total} days)</span>
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{view.g.assignees.map((a) => a.name).join(', ')}</span>
            {view.g.status === 'closed' ? <Badge>Closed</Badge> : view.daysLeft < 0 ? (
              view.outstanding > 0 ? <Badge tone="overdue"><AlertTriangle className="h-3 w-3" />Deadline passed {-view.daysLeft}d ago</Badge> : <Badge tone="settled">Completed</Badge>
            ) : <Badge tone="current"><Clock className="h-3 w-3" />{view.daysLeft === 0 ? 'Ends today' : `${view.daysLeft} days left`}</Badge>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['Target', view.target, 'text-white'], ['Collected', view.collected, 'text-emerald-300'], ['Still due', view.outstanding, 'text-rose-300']].map(([l, v, c]) => (
              <div key={l} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{l}</div>
                <div className={`num mt-1 text-lg font-bold ${c}`}>{short(v)}</div>
              </div>
            ))}
          </div>
          <div><div className="mb-1 text-xs text-slate-400">{fmtPct(pct(view.collected, view.target))} recovered</div><Progress value={pct(view.collected, view.target)} /></div>

          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'customers', label: `Customers (${view.rows.length})` }, { value: 'people', label: 'By collector' }, { value: 'log', label: `Activity log (${d.entries.length})` }]} />

          {tab === 'customers' && (
            <div className="space-y-2">
              {view.rows.map((r) => (
                <div key={r._id} className="rounded-xl border border-white/[0.06] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold text-white">
                        {r.balance <= 0 ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : view.daysLeft < 0 && view.g.status === 'active' ? <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" /> : null}
                        <span className="truncate">{r.name}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">Due {fmtDate(r.due)} · {r.daysSinceStart}d since credit start{r.overdueDays > 0 && <span className="text-rose-300"> · {r.overdueDays}d overdue</span>}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="num text-sm font-bold text-emerald-300">+{short(r.got)}</div>
                      <div className="num text-xs text-rose-300">{short(r.balance)} due</div>
                    </div>
                  </div>
                  <Progress value={pct(r.got, r.target)} className="mt-2 !h-1" />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="text-slate-400">{r.pays.length} payment{r.pays.length === 1 ? '' : 's'}{r.lastPay && <> · last {fmtDateTime(r.lastPay.date)} by <b className="text-slate-200">{r.lastPay.user?.name}</b></>}</span>
                    {r.misses.length > 0 && <span className="text-amber-300">{r.misses.length} missed{r.lastMiss && <> · “{r.lastMiss.reason}” {fmtDateTime(r.lastMiss.date)}</>}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'people' && (
            <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
              <table className="tbl">
                <thead><tr><th>Collector</th><th>Collected</th><th>Payments</th><th>Not collected</th><th>Last activity</th></tr></thead>
                <tbody>
                  {view.byUser.map((u) => (
                    <tr key={u.name}><td className="font-semibold text-white">{u.name}</td><td className="num text-emerald-300">{money(u.amount, '')}</td><td className="num">{u.pays}</td><td className="num text-amber-300">{u.misses}</td><td className="text-slate-400">{fmtDateTime(u.last)}</td></tr>
                  ))}
                  {view.g.assignees.filter((a) => !view.byUser.some((u) => u.name === a.name)).map((a) => (
                    <tr key={a._id}><td className="font-semibold text-white">{a.name}</td><td colSpan={4} className="text-rose-300">No activity recorded yet</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'log' && (
            <div className="space-y-2">
              {!d.entries.length && <div className="py-8 text-center text-sm text-slate-500">No activity yet</div>}
              {d.entries.map((e) => (
                <div key={e._id} className="flex items-start gap-3 rounded-xl border border-white/[0.05] p-3 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.type === 'payment' ? 'bg-emerald-400' : e.type === 'promise' ? 'bg-violet-400' : 'bg-amber-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-200"><b className="text-white">{e.user?.name}</b> {e.type === 'payment' ? <>collected <b className="num text-emerald-300">{money(e.amount, currency)}</b> from</> : e.type === 'promise' ? <>got a promise of <b className="num text-violet-300">{money(e.amount, currency)}</b> on {fmtDate(e.promiseDate)} from</> : <>could not collect from</>} <b className="text-white">{e.customer?.name}</b></div>
                    {e.reason && <div className="text-xs text-amber-200/80">“{e.reason}”{e.type !== 'promise' && e.promiseDate && ` · said ${fmtDate(e.promiseDate)}`}{e.type === 'promise' && ` · ${e.status}`}</div>}
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-500">{fmtDateTime(e.date)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
