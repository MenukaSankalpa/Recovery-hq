'use client';
import { useMemo, useState } from 'react';
import { CircleDollarSign, XCircle, CalendarClock, Users, Phone, Search, AlertTriangle, CheckCircle2, Clock, HandCoins, Handshake } from 'lucide-react';
import { PromiseBadge } from '@/components/PromiseBadge';
import { PageHeader, useMe } from '@/components/AppShell';
import { Card, Progress, Dot, Badge, Tabs, PageLoader, Empty, StatusBadge, cx } from '@/components/ui';
import CollectionForm from '@/components/CollectionForm';
import CustomerDrawer from '@/components/CustomerDrawer';
import { useLive } from '@/lib/client';
import { enrich, daysBetween, groupDays, startOfDay, endOfDay, promiseState, promiseLeft } from '@/lib/metrics';
import { short, money, fmtDate, fmtTime, fmtDateTime, pct, fmtPct, statusDot, dayStartISO, toInputDate } from '@/lib/format';

export default function My() {
  const me = useMe();
  const currency = me.settings.currency;
  const { data, loading, reload, updatedAt } = useLive(`/api/my?todayFrom=${encodeURIComponent(dayStartISO(toInputDate()))}`, 20000);
  const [form, setForm] = useState(null); // { mode, customer }
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [show, setShow] = useState('due');
  const [gFilter, setGFilter] = useState('all');

  const V = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const cMap = {};
    data.customers.forEach((c) => (cMap[String(c._id)] = enrich(c, now)));
    let daily = 0;
    const groups = data.groups.map((g) => {
      const members = g.customers.map((id) => cMap[String(id)]).filter(Boolean);
      const ents = data.entries.filter((e) => String(e.group) === String(g._id));
      const collected = ents.filter((e) => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
      const myCollected = ents.filter((e) => e.type === 'payment' && String(e.user?._id) === me.user._id).reduce((s, e) => s + e.amount, 0);
      const outstanding = members.reduce((s, c) => s + c.balance, 0);
      const target = outstanding + collected;
      const days = groupDays(g);
      const share = target / days / Math.max(1, g.assignees.length);
      if (now >= startOfDay(g.startDate) && now <= endOfDay(g.endDate)) daily += share;
      return { ...g, members, collected, myCollected, outstanding, target, days, daysLeft: daysBetween(now, g.endDate), pct: pct(collected, target) };
    });
    const todayPaid = data.today.filter((e) => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
    const todayMiss = data.today.filter((e) => e.type === 'no_payment').length;
    const byCustomer = {};
    data.entries.forEach((e) => { (byCustomer[String(e.customer)] ||= []).push(e); });
    const proms = data.entries.filter((e) => e.type === 'promise' && e.status !== 'cancelled').map((p) => ({ ...p, state: promiseState(p, now), left: promiseLeft(p), cust: cMap[String(p.customer)] }));
    const openProms = proms.filter((p) => ['open', 'today', 'broken'].includes(p.state));
    const promisedBy = {};
    openProms.forEach((p) => { promisedBy[String(p.customer)] = (promisedBy[String(p.customer)] || 0) + p.left; });
    const myFollow = openProms.filter((p) => p.state !== 'open' || daysBetween(now, p.promiseDate) <= 3).sort((a, b) => new Date(a.promiseDate) - new Date(b.promiseDate));
    const s = q.trim().toLowerCase();
    const list = groups
      .filter((g) => gFilter === 'all' || String(g._id) === gFilter)
      .flatMap((g) => g.members.map((c) => ({ c, g })))
      .filter(({ c }) => (show === 'all' || (show === 'due' ? c.balance > 0 : c.balance <= 0)) && (!s || [c.name, c.code, c.invoiceNo, c.phone].some((v) => (v || '').toLowerCase().includes(s))))
      .sort((a, b) => b.c.overdueDays - a.c.overdueDays || b.c.balance - a.c.balance);
    const totalDue = groups.reduce((x, g) => x + g.outstanding, 0);
    return { groups, daily, todayPaid, todayMiss, list, byCustomer, totalDue, promisedBy, myFollow, openPromAmt: openProms.reduce((s, p) => s + p.left, 0) };
  }, [data, q, show, gFilter, me.user._id]);

  if (loading && !data) return <PageLoader />;
  if (!V) return null;
  const p = pct(V.todayPaid, V.daily);
  const hour = new Date().getHours();

  return (
    <div>
      <PageHeader title={`${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${me.user.name.split(' ')[0]}`}
        subtitle={<span className="inline-flex items-center gap-2"><span className="live-dot h-2 w-2 rounded-full bg-emerald-400" />Your assigned recoveries · updated {updatedAt ? fmtTime(updatedAt) : '—'}</span>} />

      {/* today scoreboard */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="col-span-2 p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Collected today</div>
            <span className={cx('flex items-center gap-1.5 text-sm font-bold', statusDot(p).text)}><Dot pct={p} />{fmtPct(p)}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2"><span className="num text-4xl font-bold text-white">{short(V.todayPaid)}</span><span className="num text-slate-400">/ {short(V.daily)}</span></div>
          <Progress value={p} className="mt-3 !h-2.5" />
          <div className="mt-2 text-xs text-slate-500">{V.daily > 0 ? (V.todayPaid >= V.daily ? 'Daily target hit — keep going! 🔥' : `${money(Math.max(0, V.daily - V.todayPaid), currency)} more to hit today's target`) : 'No active target today'}</div>
        </Card>
        <Card className="p-4"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Still to recover</div><div className="num mt-1 text-2xl font-bold text-rose-300">{short(V.totalDue)}</div><div className="text-xs text-slate-500">{V.groups.reduce((s, g) => s + g.members.filter((c) => c.balance > 0).length, 0)} customers</div></Card>
        <Card className="p-4"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Promised to pay</div><div className="num mt-1 text-2xl font-bold text-violet-300">{short(V.openPromAmt)}</div><div className="text-xs text-slate-500">{V.myFollow.length} to follow up</div></Card>
        <Card className="hidden p-4"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Today&apos;s visits</div><div className="num mt-1 text-2xl font-bold text-white">{data.today.length}</div><div className="text-xs text-slate-500">{data.today.length - V.todayMiss} paid · {V.todayMiss} not collected</div></Card>
      </div>

      {V.myFollow.length > 0 && (
        <Card className="mt-4 overflow-hidden border-violet-500/20">
          <div className="flex items-center gap-2 border-b border-white/[0.06] p-4"><Handshake className="h-5 w-5 text-violet-300" /><div className="font-bold text-white">Promises to follow up</div><span className="text-xs text-slate-500">due today, broken, or within 3 days</span></div>
          <div className="divide-y divide-white/[0.04]">
            {V.myFollow.map((p) => (
              <button key={p._id} onClick={() => setOpen(p.customer)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02]">
                <div className={cx('w-12 shrink-0 rounded-lg py-1 text-center', p.state === 'broken' ? 'bg-rose-500/15 text-rose-200' : p.state === 'today' ? 'bg-amber-400/15 text-amber-200' : 'bg-white/[0.04] text-slate-300')}>
                  <div className="text-[10px] uppercase">{new Date(p.promiseDate).toLocaleDateString('en-GB', { month: 'short' })}</div><div className="num text-lg font-bold leading-none">{new Date(p.promiseDate).getDate()}</div>
                </div>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{p.cust?.name}</div><div className="truncate text-xs text-slate-500">{p.reason || 'Promise to pay'}</div></div>
                <div className="text-right"><div className="num text-sm font-bold text-violet-200">{short(p.left)}</div><PromiseBadge p={p} /></div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* groups */}
      {!V.groups.length ? (
        <Card className="mt-4"><Empty icon={Users} title="No customers assigned yet" text="When the CEO assigns a customer group to you, it will appear here." /></Card>
      ) : (
        <>
          <div className="mt-6 mb-3 text-lg font-bold text-white">My groups</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {V.groups.map((g) => (
              <Card key={g._id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-bold text-white"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} /><span className="truncate">{g.name}</span></div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><CalendarClock className="h-3 w-3" />{fmtDate(g.startDate)} → {fmtDate(g.endDate)}</div>
                    {g.assignees.length > 1 && <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Users className="h-3 w-3" />with {g.assignees.filter((a) => String(a._id) !== me.user._id).map((a) => a.name).join(', ')}</div>}
                  </div>
                  {g.daysLeft < 0 && g.outstanding > 0 ? <Badge tone="overdue"><AlertTriangle className="h-3 w-3" />{-g.daysLeft}d late</Badge>
                    : g.outstanding <= 0 ? <Badge tone="settled"><CheckCircle2 className="h-3 w-3" />Done</Badge>
                    : <Badge tone={g.daysLeft <= 1 ? 'amber' : 'current'}><Clock className="h-3 w-3" />{g.daysLeft === 0 ? 'Last day' : `${g.daysLeft}d left`}</Badge>}
                </div>
                <div className="mt-3 flex items-end justify-between"><div className="num text-lg font-bold text-emerald-300">{short(g.collected)}<span className="text-sm font-normal text-slate-500"> / {short(g.target)}</span></div><span className="num text-sm font-bold text-slate-300">{fmtPct(g.pct)}</span></div>
                <Progress value={g.pct} className="mt-1.5" />
                <div className="mt-2 text-xs text-slate-500">You collected {short(g.myCollected)} · {g.members.filter((c) => c.balance <= 0).length}/{g.members.length} settled</div>
                {g.notes && <div className="mt-2 rounded-lg bg-amber-400/10 px-2.5 py-1.5 text-xs text-amber-100">📌 {g.notes}</div>}
              </Card>
            ))}
          </div>

          {/* customers */}
          <div className="mt-6 mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-lg font-bold text-white">Customers to visit</div>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={show} onChange={setShow} tabs={[{ value: 'due', label: 'Pending' }, { value: 'settled', label: 'Settled' }, { value: 'all', label: 'All' }]} />
              {V.groups.length > 1 && (
                <select className="input !w-auto !py-1.5 text-xs" value={gFilter} onChange={(e) => setGFilter(e.target.value)}>
                  <option value="all">All groups</option>{V.groups.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input className="input pl-9" placeholder="Search customer, invoice, phone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!V.list.length && <Card><Empty title="Nothing here" text={show === 'due' ? 'All customers in your groups are settled. 🎉' : 'No customers match.'} /></Card>}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {V.list.map(({ c, g }) => {
              const ents = V.byCustomer[String(c._id)] || [];
              const pays = ents.filter((e) => e.type === 'payment');
              const lastMiss = ents.find((e) => e.type === 'no_payment');
              return (
                <Card key={c._id} className="rise min-w-0 p-4">
                  <button className="w-full text-left" onClick={() => setOpen(c._id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold text-white">{c.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{[c.company, c.invoiceNo, g.name].filter(Boolean).join(' · ')}</div>
                      </div>
                      <StatusBadge c={c} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-slate-500">AR value</div><div className="num font-semibold text-slate-200">{short(c.amount)}</div></div>
                      <div><div className="text-slate-500">Paid ({pays.length})</div><div className="num font-semibold text-emerald-300">{short(c.paidAmount)}</div></div>
                      <div><div className="text-slate-500">Balance due</div><div className="num text-base font-bold text-rose-300">{short(c.balance)}</div></div>
                    </div>
                    <Progress value={c.paidPct} className="mt-2 !h-1.5" />
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>Credit start {fmtDate(c.creditStartDate)}</span><span>{c.creditPeriodDays}d credit</span><span>Due {fmtDate(c.due)}</span><span>{c.daysSinceStart}d since start</span>
                    </div>
                    {pays.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{pays.slice(0, 6).map((e) => <span key={e._id} className="num rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300" title={fmtDateTime(e.date)}>+{short(e.amount)}</span>)}{pays.length > 6 && <span className="text-[11px] text-slate-500">+{pays.length - 6} more</span>}</div>}
                    {V.promisedBy[String(c._id)] > 0 && <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-violet-500/10 px-2 py-1 text-xs text-violet-200"><Handshake className="mt-0.5 h-3.5 w-3.5 shrink-0" />Promised {short(V.promisedBy[String(c._id)])} · {ents.filter((e) => e.type === 'promise' && e.status === 'open').map((e) => fmtDate(e.promiseDate)).join(', ')}</div>}
                    {lastMiss && c.balance > 0 && <div className="mt-2 text-xs text-amber-200/80">Last miss: “{lastMiss.reason}” · {fmtDateTime(lastMiss.date)}{lastMiss.promiseDate && ` · promised ${fmtDate(lastMiss.promiseDate)}`}</div>}
                  </button>
                  {c.balance > 0 && (
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5">
                      <button className="btn btn-primary !px-1 !py-2 !text-xs sm:!text-sm" onClick={() => setForm({ mode: 'payment', customer: c })}><CircleDollarSign className="h-4 w-4" />Collected</button>
                      <button className="btn !px-1 !py-2 !text-xs sm:!text-sm border border-violet-400/30 bg-violet-500/15 text-violet-200" onClick={() => setForm({ mode: 'promise', customer: c })}><Handshake className="h-4 w-4" />Promise</button>
                      <button className="btn btn-amber !px-1 !py-2 !text-xs sm:!text-sm" onClick={() => setForm({ mode: 'no_payment', customer: c })}><XCircle className="h-4 w-4" />Not paid</button>
                      {c.phone && <a href={`tel:${c.phone}`} className="btn btn-ghost !px-3 !py-2" aria-label="Call"><Phone className="h-4 w-4" /></a>}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* today log */}
      {data.today.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-white/[0.06] p-4 font-bold text-white">My activity today</div>
          <div className="divide-y divide-white/[0.04]">
            {data.today.map((e) => (
              <div key={e._id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', e.type === 'payment' ? 'bg-emerald-500/15 text-emerald-300' : e.type === 'promise' ? 'bg-violet-500/15 text-violet-300' : 'bg-amber-400/15 text-amber-300')}>{e.type === 'payment' ? <HandCoins className="h-4 w-4" /> : e.type === 'promise' ? <Handshake className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}</div>
                <div className="min-w-0 flex-1"><div className="truncate text-white">{e.customer?.name}</div>{e.reason && <div className="truncate text-xs text-amber-200/70">“{e.reason}”</div>}</div>
                <div className="text-right">{e.type === 'payment' && <div className="num font-bold text-emerald-300">+{short(e.amount)}</div>}{e.type === 'promise' && <div className="num font-bold text-violet-300">{short(e.amount)} · {fmtDate(e.promiseDate)}</div>}<div className="text-[11px] text-slate-500">{fmtTime(e.date)}</div></div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <CollectionForm open={!!form} mode={form?.mode} customer={form?.customer} promised={form ? V.promisedBy[String(form.customer._id)] || 0 : 0} currency={currency} onClose={() => setForm(null)} onSaved={reload} />
      <CustomerDrawer id={open} open={!!open} onClose={() => setOpen(null)} onChanged={reload} canCollect canDelete={false} currency={currency} />
    </div>
  );
}
