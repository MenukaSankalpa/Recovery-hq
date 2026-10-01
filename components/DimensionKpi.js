'use client';
import { useMemo, useState } from 'react';
import { Tabs, cx } from './ui';
import { short, money } from '@/lib/format';
import { bucketOf, bucketOfPart } from '@/lib/metrics';

const METRICS = [
  { value: 'outstanding', label: 'Outstanding', color: '#f43f5e' },
  { value: 'overdue', label: 'Overdue', color: '#fb923c' },
  { value: 'collected', label: 'Collected', color: '#10b981' },
  { value: 'promised', label: 'Promised', color: '#8b5cf6' },
  { value: 'ar', label: 'AR value', color: '#6366f1' },
];
const DIMS = [
  { value: 'aging', label: 'Aging' },
  { value: 'company', label: 'Company' },
  { value: 'collector', label: 'Collector' },
  { value: 'group', label: 'Group' },
  { value: 'customer', label: 'Top customers' },
  { value: 'period', label: 'Credit period' },
];

/** Single KPI, sliced by multiple dimensions. */
export default function DimensionKpi({ customers, payments, promises = [], groups, users, bucketsDef, rangeLabel, currency }) {
  const [metric, setMetric] = useState('outstanding');
  const [dim, setDim] = useState('aging');
  const m = METRICS.find((x) => x.value === metric);

  const { rows, total } = useMemo(() => {
    const gMap = Object.fromEntries(groups.map((g) => [String(g._id), g]));
    const cMap = Object.fromEntries(customers.map((c) => [String(c._id), c]));
    const uMap = Object.fromEntries(users.map((u) => [String(u._id), u]));
    const acc = {};
    const add = (k, v, n = 1) => {
      if (!v) return;
      acc[k] = acc[k] || { key: k, value: 0, count: 0 };
      acc[k].value += v;
      acc[k].count += n;
    };
    if (metric === 'collected') {
      for (const e of payments) {
        const c = cMap[String(e.customer?._id || e.customer)];
        let k;
        if (dim === 'aging') k = c ? (c.balance > 0 ? bucketOf(c, bucketsDef).label : 'Settled') : 'Unknown';
        else if (dim === 'collector') k = uMap[String(e.user?._id || e.user)]?.name || e.user?.name || 'Unknown';
        else if (dim === 'group') k = gMap[String(e.group)]?.name || (e.group ? 'Past group' : 'No group');
        else if (dim === 'customer') k = c?.name || e.customer?.name || 'Unknown';
        else if (dim === 'company') k = c?.company || '—';
        else k = c ? `${c.creditPeriodDays} days` : 'Unknown';
        add(k, e.amount);
      }
    } else if (metric === 'promised' && dim === 'collector') {
      // by who took the promise
      promises.filter((p) => ['open', 'today', 'broken'].includes(p.state)).forEach((p) => add(p.user?.name || '—', p.left));
    } else {
      for (const c of customers) {
        const v = metric === 'outstanding' ? c.balance : metric === 'overdue' ? c.overdueAmt : metric === 'promised' ? c.promised : c.amount;
        if (!v) continue;
        if (dim === 'aging' && (metric === 'outstanding' || metric === 'overdue')) {
          // invoice-level aging
          c.parts.forEach((p) => { if (metric === 'outstanding' || p.overdueDays > 0) add(bucketOfPart(p, bucketsDef).label, p.open, 0); });
          if (acc[bucketOf(c, bucketsDef).label]) acc[bucketOf(c, bucketsDef).label].count++;
          continue;
        }
        const g = c.group ? gMap[String(c.group)] : null;
        if (dim === 'collector') {
          const as = g?.status === 'active' ? g.assignees : [];
          if (!as.length) add('Unassigned', v);
          else as.forEach((a) => add(a.name, v / as.length, 1));
        } else {
          let k;
          if (dim === 'aging') k = bucketOf(c, bucketsDef).label;
          else if (dim === 'group') k = g?.status === 'active' ? g.name : 'Unassigned';
          else if (dim === 'customer') k = c.name;
          else if (dim === 'company') k = c.company || '—';
          else k = `${c.creditPeriodDays} days`;
          add(k, v);
        }
      }
    }
    let rows = Object.values(acc);
    if (dim === 'aging') {
      const order = [...bucketsDef.map((b) => b.label), 'Settled', 'Unknown'];
      rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    } else if (dim === 'period') rows.sort((a, b) => parseInt(a.key) - parseInt(b.key));
    else rows.sort((a, b) => b.value - a.value);
    if (rows.length > 10 && dim !== 'aging') {
      const rest = rows.slice(9);
      rows = [...rows.slice(0, 9), { key: `Others (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0), count: rest.reduce((s, r) => s + r.count, 0) }];
    }
    const total = rows.reduce((s, r) => s + r.value, 0);
    return { rows, total };
  }, [metric, dim, customers, payments, promises, groups, users, bucketsDef]);

  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card flex h-full min-w-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] p-4 sm:p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">KPI by dimension</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num text-3xl font-bold text-white">{short(total)}</span>
            <span className="text-sm font-semibold" style={{ color: m.color }}>{m.label}</span>
          </div>
          <div className="num text-xs text-slate-500">{money(total, currency)}{metric === 'collected' && ` · ${rangeLabel}`}</div>
        </div>
        <Tabs tabs={METRICS} value={metric} onChange={setMetric} className="max-w-full" />
      </div>
      <div className="min-w-0 px-4 pt-3 sm:px-5"><Tabs tabs={DIMS} value={dim} onChange={setDim} /></div>
      <div className="flex-1 space-y-2.5 p-4 sm:p-5">
        {!rows.length && <div className="py-10 text-center text-sm text-slate-500">Nothing to show for this view</div>}
        {rows.map((r, i) => (
          <div key={r.key} className="rise" style={{ animationDelay: `${i * 25}ms` }}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-slate-200">{r.key}</span>
              <span className="shrink-0 text-xs text-slate-400"><b className="num text-sm text-white">{short(r.value)}</b> · {total ? Math.round((r.value / total) * 100) : 0}% · {r.count}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className={cx('h-full rounded-full transition-all duration-700')} style={{ width: `${(r.value / max) * 100}%`, background: `linear-gradient(90deg, ${m.color}aa, ${m.color})` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
