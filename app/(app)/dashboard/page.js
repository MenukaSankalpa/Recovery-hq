'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Wallet, TrendingDown, AlertTriangle, CircleDollarSign, Zap, XCircle, UserX, Radio, Copy, RefreshCw, Plus, X, Trophy,
  CalendarClock, Users, ChevronRight, HandCoins, Handshake, AlertOctagon,
} from 'lucide-react';
import PromiseTracker from '@/components/PromiseTracker';
import { PageHeader, useMe } from '@/components/AppShell';
import { Card, Progress, Dot, Tabs, Badge, PageLoader, toast, cx } from '@/components/ui';
import DateRange, { presetRange } from '@/components/DateRange';
import DimensionKpi from '@/components/DimensionKpi';
import TrendChart from '@/components/TrendChart';
import CustomerTable from '@/components/CustomerTable';
import CustomerDrawer from '@/components/CustomerDrawer';
import GroupDetail from '@/components/GroupDetail';
import { api, useLive } from '@/lib/client';
import { enrich, buckets, bucketOf, bucketOfPart, groupStats, startOfDay, endOfDay, daysBetween, DAY, promiseState, promiseLeft, allocateToParts } from '@/lib/metrics';
import { short, money, pct, fmtPct, fmtTime, fmtDate, fmtDateShort, dayStartISO, dayEndISO, statusDot, timeAgo, toInputDate } from '@/lib/format';

function Kpi({ icon: Icon, label, value, sub, tone = 'emerald', children, delay = 0 }) {
  const tones = {
    emerald: 'from-emerald-500/20 text-emerald-300', rose: 'from-rose-500/20 text-rose-300', amber: 'from-amber-400/20 text-amber-300',
    indigo: 'from-indigo-500/20 text-indigo-300', sky: 'from-sky-500/20 text-sky-300', violet: 'from-violet-500/20 text-violet-300',
  };
  return (
    <div className="card rise relative overflow-hidden p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className={cx('pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br to-transparent blur-xl', tones[tone])} />
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Icon className={cx('h-4 w-4', tones[tone].split(' ')[1])} />{label}
      </div>
      <div className="num mt-2 text-2xl font-bold text-white sm:text-[26px]">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
      {children}
    </div>
  );
}

export default function Dashboard() {
  const me = useMe();
  const [range, setRange] = useState({ ...presetRange('30d'), preset: '30d' });
  const [basis, setBasis] = useState(me.settings.agingBasis || 'overdue');
  const [newBucket, setNewBucket] = useState('');
  const [open, setOpen] = useState(null);
  const [groupOpen, setGroupOpen] = useState(null);
  const [tableFilter, setTableFilter] = useState({ status: 'all', bucket: 'all', k: 0 });
  const [rankBy, setRankBy] = useState('today');
  const currency = me.settings.currency;

  const today = toInputDate();
  const url = `/api/dashboard?from=${encodeURIComponent(dayStartISO(range.from))}&to=${encodeURIComponent(dayEndISO(range.to))}&todayFrom=${encodeURIComponent(dayStartISO(today))}&todayTo=${encodeURIComponent(dayEndISO(today))}`;
  const { data, loading, reload, updatedAt } = useLive(url, 15000);

  const V = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const rFrom = startOfDay(new Date(`${range.from}T00:00:00`));
    const rTo = endOfDay(new Date(`${range.to}T00:00:00`));
    const tFrom = startOfDay(now);
    const bucketVals = data.settings.agingBuckets;
    const bs = buckets(bucketVals, basis);

    // open promises per customer (aging "minus promised")
    const proms = data.promises.map((p) => ({ ...p, state: promiseState(p, now), left: promiseLeft(p) }));
    const promisedBy = {};
    proms.filter((p) => ['open', 'today', 'broken'].includes(p.state)).forEach((p) => {
      const k = String(p.customer?._id);
      promisedBy[k] = (promisedBy[k] || 0) + p.left;
    });
    const cs = data.customers.map((c0) => {
      const c = enrich(c0, now);
      c.promised = Math.min(c.balance, promisedBy[String(c._id)] || 0);
      return c;
    });
    const cMap = Object.fromEntries(cs.map((c) => [String(c._id), c]));
    const gpMap = {};
    data.groupPaid.forEach((r) => { gpMap[`${r.group}|${r.customer}`] = r.total; });
    const gMap = Object.fromEntries(data.groups.map((g) => [String(g._id), g]));
    const gStats = Object.fromEntries(data.groups.map((g) => [String(g._id), groupStats(g, cMap, gpMap, now)]));
    const activeGroups = data.groups.filter((g) => g.status === 'active');

    const inR = (d) => { const t = new Date(d); return t >= rFrom && t <= rTo; };
    const isToday = (d) => new Date(d) >= tFrom;
    const pays = data.entries.filter((e) => e.type === 'payment');
    const rangePays = pays.filter((e) => inR(e.date));
    const todayPays = pays.filter((e) => isToday(e.date));
    const todayMiss = data.entries.filter((e) => e.type === 'no_payment' && isToday(e.date));
    const todayProm = data.entries.filter((e) => e.type === 'promise' && isToday(e.date));
    const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);

    const open = cs.filter((c) => c.balance > 0);
    const K = {
      ar: sum(cs, (c) => c.amount), credit: sum(cs, (c) => c.creditBalance || 0), creditN: cs.filter((c) => c.creditBalance > 0).length, paid: sum(cs, (c) => c.paidAmount || 0), outstanding: sum(open, (c) => c.balance),
      overdue: sum(open, (c) => c.overdueAmt), overdueCount: open.filter((c) => c.status === 'overdue').length,
      promised: sum(open, (c) => c.promised),
      broken: sum(proms.filter((p) => p.state === 'broken'), (p) => p.left), brokenCount: proms.filter((p) => p.state === 'broken').length,
      promDueToday: sum(proms.filter((p) => p.state === 'today'), (p) => p.left), promDueTodayN: proms.filter((p) => p.state === 'today').length,
      collectedRange: sum(rangePays, (e) => e.amount), collectedToday: sum(todayPays, (e) => e.amount),
      unassigned: sum(open.filter((c) => !c.group || gMap[String(c.group)]?.status !== 'active'), (c) => c.balance),
      unassignedCount: open.filter((c) => !c.group || gMap[String(c.group)]?.status !== 'active').length,
    };

    // aging tiles
    // invoice-level: each open invoice slice goes to its own bucket; promises reduce the oldest slices first
    const agg = Object.fromEntries(bs.map((b) => [b.key, { amount: 0, promised: 0, custs: new Set() }]));
    open.forEach((c) => {
      const alloc = allocateToParts(c.parts, c.promised);
      c.parts.forEach((p, i) => {
        const b = bucketOfPart(p, bs);
        agg[b.key].amount += p.open;
        agg[b.key].promised += alloc[i];
        agg[b.key].custs.add(String(c._id));
      });
    });
    const aging = bs.map((b) => ({ ...b, amount: agg[b.key].amount, promised: agg[b.key].promised, net: agg[b.key].amount - agg[b.key].promised, count: agg[b.key].custs.size }));

    // per collector
    const people = data.users.filter((u) => u.canCollect).map((u) => {
      const myGroups = activeGroups.filter((g) => g.assignees.some((a) => String(a._id) === u._id));
      let daily = 0, rangeTarget = 0, assignedBal = 0, assignedCount = 0;
      myGroups.forEach((g) => {
        const s = gStats[String(g._id)];
        const share = s.daily / Math.max(1, g.assignees.length);
        const gs = startOfDay(g.startDate), ge = endOfDay(g.endDate);
        if (now >= gs && now <= ge) daily += share;
        const oFrom = gs > rFrom ? gs : rFrom, oTo = ge < rTo ? ge : rTo;
        if (oTo >= oFrom) rangeTarget += share * (daysBetween(oFrom, oTo) + 1);
        assignedBal += s.outstanding / Math.max(1, g.assignees.length);
        assignedCount += s.members.filter((m) => m.balance > 0).length;
      });
      const mine = (e) => String(e.user?._id || e.user) === u._id;
      const tp = todayPays.filter(mine), rp = rangePays.filter(mine);
      const today = sum(tp, (e) => e.amount), inRange = sum(rp, (e) => e.amount);
      const lastPay = pays.find(mine);
      return {
        ...u, groups: myGroups, daily, rangeTarget, assignedBal, assignedCount,
        today, inRange, todayCount: tp.length, rangeCount: rp.length, misses: todayMiss.filter(mine).length,
        pctToday: pct(today, daily), pctRange: pct(inRange, rangeTarget), lastPay,
      };
    }).filter((p) => p.role !== 'ceo' || p.groups.length || p.inRange || p.today);

    const dailyTarget = sum(people, (p) => p.daily);
    const rangeTarget = sum(people, (p) => p.rangeTarget);

    // trend
    const days = Math.min(400, daysBetween(rFrom, rTo) + 1);
    const trend = Array.from({ length: days }, (_, i) => ({ date: new Date(rFrom.getTime() + i * DAY), value: 0, count: 0 }));
    rangePays.forEach((e) => {
      const i = daysBetween(rFrom, e.date);
      if (trend[i]) { trend[i].value += e.amount; trend[i].count++; }
    });

    // table rows
    const rows = cs.map((c) => {
      const g = c.group ? gMap[String(c.group)] : null;
      const act = g && g.status === 'active';
      return { ...c, bucket: bucketOf(c, bs).label, groupId: act ? String(g._id) : '', groupName: act ? g.name : '', groupColor: g?.color, collectors: act ? g.assignees.map((a) => a.name).join(', ') : '' };
    });

    const companies = [...new Set(cs.map((c) => c.company).filter(Boolean))].sort();
    return { now, bs, cs, K, aging, proms, todayProm, companies, rFrom, rTo, people, dailyTarget, rangeTarget, trend, rows, gStats, activeGroups, rangePays, todayPays, todayMiss, recentGroups: data.groups };
  }, [data, range, basis]);

  async function saveBuckets(list) {
    try {
      await api('/api/settings', { method: 'PATCH', body: { agingBuckets: list } });
      await me.reload();
      reload();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  function copyReport() {
    if (!V) return;
    const d = new Date();
    const f = (n) => short(n);
    const L = [];
    L.push(`*💰 CASH COLLECTION - ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}*`);
    L.push(`${me.settings.companyName}`);
    L.push('');
    L.push('*COLLECTION TODAY:*');
    const ranked = [...V.people].sort((a, b) => b.pctToday - a.pctToday || b.today - a.today);
    V.people.forEach((p, i) => L.push(`${i + 1}. ${p.team ? p.team + ' ' : ''}[${p.name}]: ${f(p.today)} /${f(p.daily)} = ${fmtPct(p.pctToday)} ${statusDot(p.pctToday).emoji}`));
    L.push(`*Total Today: ${f(V.K.collectedToday)} /${f(V.dailyTarget)}*`);
    L.push('');
    L.push(`*CUMULATIVE ${fmtDateShort(`${range.from}T00:00`)} - ${fmtDateShort(`${range.to}T00:00`)}:*`);
    V.people.forEach((p) => L.push(`${p.name}: ${f(p.inRange)} /${f(p.rangeTarget)} = ${fmtPct(p.pctRange)}`));
    L.push(`*Total: ${f(V.K.collectedRange)} /${f(V.rangeTarget)}*`);
    L.push('');
    L.push('*🏆 RANKING - BEST TO WORST (Today)*');
    ranked.forEach((p, i) => L.push(`${i + 1}. ${p.name} - ${fmtPct(p.pctToday)}`));
    L.push('');
    L.push(`Outstanding: ${f(V.K.outstanding)} | Overdue: ${f(V.K.overdue)}`);
    L.push(`Promised (open): ${f(V.K.promised)} | Due today: ${f(V.K.promDueToday)} | Broken: ${f(V.K.broken)}`);
    L.push('🔴<50% 🟡50-99% 🟢100%+');
    const text = L.join('\n');
    navigator.clipboard?.writeText(text).then(() => toast('WhatsApp report copied — paste it in the group'), () => toast('Could not copy', 'err'));
  }

  if (loading && !data) return <PageLoader />;
  if (!V) return <div className="card p-6 text-rose-300">Could not load the dashboard.</div>;
  const K = V.K;
  const rangeLabel = range.from === range.to ? fmtDate(`${range.from}T00:00`) : `${fmtDateShort(`${range.from}T00:00`)} – ${fmtDateShort(`${range.to}T00:00`)}`;
  const agingMax = Math.max(1, ...V.aging.map((a) => a.amount));
  const ranked = [...V.people].sort((a, b) => rankBy === 'today' ? b.pctToday - a.pctToday || b.today - a.today : b.pctRange - a.pctRange || b.inRange - a.inRange);
  const agingColors = ['#38bdf8', '#facc15', '#fb923c', '#f97316', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337', '#4c0519'];

  return (
    <div>
      <PageHeader title="CEO Command Center"
        subtitle={<span className="inline-flex items-center gap-2"><span className="live-dot h-2 w-2 rounded-full bg-emerald-400" />Live · updated {updatedAt ? fmtTime(updatedAt) : '—'} · {rangeLabel}</span>}>
        <DateRange value={range} onChange={setRange} />
        <button className="btn btn-ghost" onClick={reload} title="Refresh"><RefreshCw className="h-4 w-4" /></button>
        <button className="btn btn-primary" onClick={copyReport}><Copy className="h-4 w-4" />WhatsApp report</button>
      </PageHeader>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={Wallet} label="Total receivable" value={short(K.ar)} sub={<>{V.cs.length} customers · {short(K.paid)} recovered{K.credit > 0 && <span className="block text-sky-300/80" title={`${K.creditN} customers hold credit balances`}>net of {short(K.credit)} credits: {short(K.ar - K.credit)}</span>}</>} tone="indigo" />
        <Kpi icon={TrendingDown} label="Outstanding" value={short(K.outstanding)} sub={`${fmtPct(pct(K.outstanding, K.ar))} of AR still due`} tone="rose" delay={40}>
          <Progress value={pct(K.paid, K.ar)} className="mt-2 !h-1.5" color="bg-emerald-400" />
        </Kpi>
        <Kpi icon={AlertTriangle} label="Overdue" value={short(K.overdue)} sub={`${K.overdueCount} customers · ${fmtPct(pct(K.overdue, K.outstanding))} of outstanding`} tone="amber" delay={80} />
        <Kpi icon={CircleDollarSign} label="Collected in range" value={short(K.collectedRange)} sub={`${V.rangePays.length} payments · target ${short(V.rangeTarget)}`} tone="emerald" delay={120}>
          <div className="mt-2 flex items-center gap-2"><Progress value={pct(K.collectedRange, V.rangeTarget)} className="!h-1.5" /><span className="num text-xs text-slate-300">{fmtPct(pct(K.collectedRange, V.rangeTarget))}</span></div>
        </Kpi>
        <Kpi icon={Zap} label="Collected today" value={short(K.collectedToday)} sub={`${V.todayPays.length} payments · daily target ${short(V.dailyTarget)}`} tone="emerald" delay={160}>
          <div className="mt-2 flex items-center gap-2"><Dot pct={pct(K.collectedToday, V.dailyTarget)} /><span className="num text-xs text-slate-300">{fmtPct(pct(K.collectedToday, V.dailyTarget))} of today&apos;s target</span></div>
        </Kpi>
        <Kpi icon={Handshake} label="Promised to pay" value={short(K.promised)} sub={`${short(K.promDueToday)} due today · net unpromised ${short(K.outstanding - K.promised)}`} tone="violet" delay={180} />
        <Kpi icon={AlertOctagon} label="Broken promises" value={short(K.broken)} sub={`${K.brokenCount} promises missed their date`} tone="rose" delay={190} />
        <Kpi icon={XCircle} label="Not collected today" value={V.todayMiss.length} sub={`${V.todayProm.length} new promises today`} tone="amber" delay={200} />
        <Kpi icon={UserX} label="Unassigned balance" value={short(K.unassigned)} sub={<Link href="/groups" className="text-emerald-300 hover:underline">{K.unassignedCount} customers → assign now</Link>} tone="violet" delay={240} />
        <Kpi icon={Radio} label="Team online" value={`${data.users.filter((u) => u.online).length}/${data.users.length}`} sub={`${V.activeGroups.length} active groups`} tone="sky" delay={280} />
      </div>

      {/* Aging */}
      <Card className="mt-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-bold text-white">Aging analysis</h2>
            <p className="text-xs text-slate-400">Open invoices split by {basis === 'overdue' ? 'days past due date' : 'days since invoice date'}. Promised amounts are shown as minus. Tap a bucket to filter.</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="num font-bold text-white">{short(K.outstanding)}</span><span className="text-slate-500">outstanding</span>
              <span className="num font-bold text-violet-300">− {short(K.promised)}</span><span className="text-slate-500">promised</span>
              <span className="num font-bold text-emerald-300">= {short(K.outstanding - K.promised)}</span><span className="text-slate-500">net to chase</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={basis} onChange={setBasis} tabs={[{ value: 'overdue', label: 'Days overdue' }, { value: 'age', label: 'Days since invoice' }]} />
            <div className="flex flex-wrap items-center gap-1.5">
              {data.settings.agingBuckets.map((b) => (
                <span key={b} className="chip num">{b}
                  {data.settings.agingBuckets.length > 1 && <button onClick={() => saveBuckets(data.settings.agingBuckets.filter((x) => x !== b))} className="text-slate-500 hover:text-rose-300"><X className="h-3 w-3" /></button>}
                </span>
              ))}
              <form onSubmit={(e) => { e.preventDefault(); const n = parseInt(newBucket); if (n > 0) { saveBuckets([...data.settings.agingBuckets, n]); setNewBucket(''); } }} className="flex items-center">
                <input className="w-16 rounded-l-full border border-white/10 bg-ink-850 px-2.5 py-1 text-xs outline-none focus:border-emerald-400/50" placeholder="e.g. 120" inputMode="numeric" value={newBucket} onChange={(e) => setNewBucket(e.target.value.replace(/\D/g, ''))} />
                <button className="rounded-r-full border border-l-0 border-white/10 bg-emerald-500/15 px-2 py-1 text-emerald-300 hover:bg-emerald-500/25"><Plus className="h-3.5 w-3.5" /></button>
              </form>
            </div>
          </div>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/[0.04]">
          {V.aging.map((a, i) => a.amount > 0 && <div key={a.key} title={`${a.label}: ${short(a.amount)}`} style={{ width: `${pct(a.amount, K.outstanding)}%`, background: agingColors[i] }} className="h-full transition-all duration-700" />)}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {V.aging.map((a, i) => (
            <button key={a.key} onClick={() => { setTableFilter({ status: 'all', bucket: a.label, k: Date.now() }); document.getElementById('customers')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:border-white/15 hover:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><span className="h-2.5 w-2.5 rounded-full" style={{ background: agingColors[i] }} />{a.label}</div>
              <div className="num mt-1.5 text-lg font-bold text-white">{short(a.amount)}</div>
              <div className="text-[11px] text-slate-500">{a.count} customers · {fmtPct(pct(a.amount, K.outstanding))}</div>
              {a.promised > 0 && <div className="num mt-1 text-[11px]"><span className="text-violet-300">− {short(a.promised)}</span> <span className="text-slate-500">→</span> <span className="font-bold text-emerald-300">{short(a.net)}</span></div>}
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full" style={{ width: `${(a.amount / agingMax) * 100}%`, background: agingColors[i] }} /></div>
            </button>
          ))}
        </div>
      </Card>

      {/* Dimension KPI + trend */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <DimensionKpi customers={V.cs} payments={V.rangePays} promises={V.proms} groups={data.groups} users={data.users} bucketsDef={V.bs} rangeLabel={rangeLabel} currency={currency} />
        </div>
        <Card className="flex min-w-0 flex-col p-4 sm:p-5 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Daily collections</div>
              <div className="num mt-1 text-3xl font-bold text-white">{short(K.collectedRange)}</div>
              <div className="text-xs text-slate-500">{rangeLabel} · avg {short(K.collectedRange / Math.max(1, V.trend.length))}/day</div>
            </div>
            <Badge tone="settled">{V.rangePays.length} payments</Badge>
          </div>
          <div className="mt-4 flex-1"><TrendChart points={V.trend} /></div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-center">
            <div><div className="text-[11px] text-slate-500">Best day</div><div className="num text-sm font-bold text-emerald-300">{short(Math.max(0, ...V.trend.map((t) => t.value)))}</div></div>
            <div><div className="text-[11px] text-slate-500">Zero days</div><div className="num text-sm font-bold text-rose-300">{V.trend.filter((t) => !t.value).length}</div></div>
            <div><div className="text-[11px] text-slate-500">Recovery rate</div><div className="num text-sm font-bold text-white">{fmtPct(pct(K.paid, K.ar))}</div></div>
          </div>
        </Card>
      </div>

      {/* Team ranking */}
      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] p-4 sm:p-5">
          <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-300" /><h2 className="font-bold text-white">Team ranking — best to worst</h2></div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">🔴 &lt;50% · 🟡 50–99% · 🟢 100%+</span>
            <Tabs value={rankBy} onChange={setRankBy} tabs={[{ value: 'today', label: 'Today' }, { value: 'range', label: 'Range' }]} />
          </div>
        </div>
        {!ranked.length ? <div className="p-8 text-center text-sm text-slate-500">No collectors yet. Add users in Users & Log Time.</div> : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="tbl">
                <thead><tr><th>#</th><th>Collector</th><th>Today</th><th>Daily target</th><th>Today %</th><th>Range collected</th><th>Range target</th><th>Range %</th><th>Assigned balance</th><th>Missed today</th><th>Last collection</th></tr></thead>
                <tbody>
                  {ranked.map((p, i) => (
                    <tr key={p._id}>
                      <td className="num font-bold text-slate-400">{i + 1}</td>
                      <td><div className="flex items-center gap-2"><span className={cx('h-2 w-2 rounded-full', p.online ? 'bg-emerald-400' : 'bg-slate-600')} title={p.online ? 'Online' : 'Offline'} /><div><div className="font-semibold text-white">{p.name}</div><div className="text-xs text-slate-500">{p.team || '—'} · {p.groups.length} group{p.groups.length === 1 ? '' : 's'}</div></div></div></td>
                      <td className="num font-bold text-emerald-300">{short(p.today)}<span className="ml-1 text-xs font-normal text-slate-500">({p.todayCount})</span></td>
                      <td className="num text-slate-300">{short(p.daily)}</td>
                      <td><div className="flex items-center gap-2"><Dot pct={p.pctToday} /><span className={cx('num font-bold', statusDot(p.pctToday).text)}>{fmtPct(p.pctToday)}</span></div></td>
                      <td className="num text-slate-200">{short(p.inRange)}</td>
                      <td className="num text-slate-400">{short(p.rangeTarget)}</td>
                      <td className="w-40"><div className="flex items-center gap-2"><Progress value={p.pctRange} className="!h-1.5" /><span className="num text-xs">{fmtPct(p.pctRange)}</span></div></td>
                      <td className="num text-rose-300">{short(p.assignedBal)}<span className="ml-1 text-xs text-slate-500">({p.assignedCount})</span></td>
                      <td className={cx('num', p.misses ? 'text-amber-300' : 'text-slate-500')}>{p.misses}</td>
                      <td className="text-xs text-slate-400">{p.lastPay ? timeAgo(p.lastPay.date) : 'none in range'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="bg-white/[0.02] font-bold"><td /><td className="px-3 py-3 text-white">Total</td><td className="num px-3 text-emerald-300">{short(K.collectedToday)}</td><td className="num px-3">{short(V.dailyTarget)}</td><td className="num px-3">{fmtPct(pct(K.collectedToday, V.dailyTarget))}</td><td className="num px-3">{short(K.collectedRange)}</td><td className="num px-3">{short(V.rangeTarget)}</td><td className="num px-3">{fmtPct(pct(K.collectedRange, V.rangeTarget))}</td><td colSpan={3} /></tr></tfoot>
              </table>
            </div>
            <div className="divide-y divide-white/[0.05] md:hidden">
              {ranked.map((p, i) => {
                const v = rankBy === 'today' ? p.pctToday : p.pctRange;
                return (
                  <div key={p._id} className="flex items-center gap-3 p-3">
                    <div className="num grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-sm font-bold text-slate-300">{i + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate font-semibold text-white">{p.name}</span><span className={cx('h-1.5 w-1.5 rounded-full', p.online ? 'bg-emerald-400' : 'bg-slate-600')} /></div>
                      <div className="num text-xs text-slate-400">{rankBy === 'today' ? `${short(p.today)} / ${short(p.daily)}` : `${short(p.inRange)} / ${short(p.rangeTarget)}`}{p.misses ? ` · ${p.misses} missed` : ''}</div>
                      <Progress value={v} className="mt-1.5 !h-1" />
                    </div>
                    <div className={cx('num text-right text-lg font-bold', statusDot(v).text)}>{fmtPct(v)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Groups */}
      <div className="mt-6 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Collection groups</h2>
        <Link href="/groups" className="btn btn-ghost btn-sm">Manage groups<ChevronRight className="h-3.5 w-3.5" /></Link>
      </div>
      {!V.recentGroups.length ? (
        <Card className="p-8 text-center text-sm text-slate-400">No groups yet. <Link href="/groups" className="text-emerald-300">Drag customers into a group and assign collectors →</Link></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {V.recentGroups.map((g) => {
            const s = V.gStats[String(g._id)];
            return (
              <button key={g._id} onClick={() => setGroupOpen(g._id)} className="card rise p-4 text-left transition hover:border-white/15">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-bold text-white"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} /><span className="truncate">{g.name}</span></div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-400"><Users className="h-3 w-3" /><span className="truncate">{g.assignees.map((a) => a.name).join(', ')}</span></div>
                  </div>
                  {g.status === 'closed' ? <Badge>Closed</Badge> : s.expired ? <Badge tone="overdue">Late {-s.daysLeft}d</Badge> : s.outstanding <= 0 ? <Badge tone="settled">Done</Badge> : <Badge tone="current">{s.daysLeft === 0 ? 'Ends today' : `${s.daysLeft}d left`}</Badge>}
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div><div className="num text-xl font-bold text-emerald-300">{short(s.collected)}</div><div className="text-[11px] text-slate-500">of {short(s.target)} target</div></div>
                  <div className="text-right"><div className={cx('num text-xl font-bold', statusDot(s.pct).text)}>{fmtPct(s.pct)}</div><div className="text-[11px] text-slate-500">{s.settled}/{s.members.length} settled</div></div>
                </div>
                <Progress value={s.pct} className="mt-2" />
                <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500"><CalendarClock className="h-3 w-3" />{fmtDate(g.startDate)} → {fmtDate(g.endDate)} · {short(s.outstanding)} still due</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Customers */}
      <div id="customers" className="mt-6 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Customer recovery details</h2>
        {tableFilter.bucket !== 'all' && <button className="chip hover:bg-white/10" onClick={() => setTableFilter({ status: 'all', bucket: 'all', k: Date.now() })}>Aging: {tableFilter.bucket}<X className="h-3 w-3" /></button>}
      </div>
      <Card className="overflow-hidden">
        <CustomerTable key={tableFilter.k} rows={V.rows} companyOptions={V.companies} initialFilter={tableFilter} bucketOptions={V.bs.map((b) => b.label)} groupOptions={V.activeGroups} onOpen={(c) => setOpen(c._id)} currency={currency} />
      </Card>

      {/* Promise tracker */}
      <div className="mt-6"><PromiseTracker promises={data.promises} onOpen={setOpen} rangeFrom={V.rFrom} rangeTo={V.rTo} currency={currency} /></div>

      {/* Live feed */}
      <Card className="mt-4 min-w-0">
        <div className="flex items-center gap-2 border-b border-white/[0.06] p-4"><span className="live-dot h-2 w-2 rounded-full bg-emerald-400" /><h2 className="font-bold text-white">Live activity — today</h2></div>
        <div className="max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto">
          {![...V.todayPays, ...V.todayMiss, ...V.todayProm].length && <div className="p-8 text-center text-sm text-slate-500">No collection activity yet today</div>}
          {[...V.todayPays, ...V.todayMiss, ...V.todayProm].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 80).map((e) => (
            <button key={e._id} onClick={() => setOpen(e.customer?._id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02]">
              <div className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', e.type === 'payment' ? 'bg-emerald-500/15 text-emerald-300' : e.type === 'promise' ? 'bg-violet-500/15 text-violet-300' : 'bg-amber-400/15 text-amber-300')}>
                {e.type === 'payment' ? <HandCoins className="h-4 w-4" /> : e.type === 'promise' ? <Handshake className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate text-slate-300"><b className="text-white">{e.user?.name}</b> {e.type === 'payment' ? 'collected from' : e.type === 'promise' ? 'got a promise from' : 'missed'} <b className="text-white">{e.customer?.name}</b></div>
                {e.type === 'promise' && <div className="truncate text-xs text-violet-200/70">will pay on {fmtDate(e.promiseDate)}{e.reason && ` · “${e.reason}”`}</div>}
                {e.type === 'no_payment' && e.reason && <div className="truncate text-xs text-amber-200/70">“{e.reason}”</div>}
              </div>
              <div className="shrink-0 text-right">
                {e.type === 'payment' && <div className="num text-sm font-bold text-emerald-300">+{short(e.amount)}</div>}
                {e.type === 'promise' && <div className="num text-sm font-bold text-violet-300">{short(e.amount)}</div>}
                <div className="text-[11px] text-slate-500">{fmtTime(e.date)}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <CustomerDrawer id={open} open={!!open} onClose={() => setOpen(null)} onChanged={reload} canCollect canDelete currency={currency} />
      <GroupDetail id={groupOpen} open={!!groupOpen} onClose={() => setGroupOpen(null)} currency={currency} />
    </div>
  );
}
