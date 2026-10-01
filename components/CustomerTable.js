'use client';
import { useMemo, useState } from 'react';
import { Search, ArrowUpDown, ChevronRight } from 'lucide-react';
import { StatusBadge, Progress, cx, Empty } from './ui';
import { short, fmtDate, money } from '@/lib/format';

const COLS = [
  ['name', 'Customer'], ['company', 'Co.'], ['amount', 'AR value'], ['paidAmount', 'Recovered'], ['balance', 'Balance due'],
  ['creditStartDate', 'Credit start'], ['creditPeriodDays', 'Period'], ['due', 'Due date'],
  ['daysSinceStart', 'Days since start'], ['overdueDays', 'Overdue'], ['bucket', 'Aging'], ['groupName', 'Group / Collector'], ['lastActivityAt', 'Last activity'],
];

/** rows: enriched customers + { bucket, groupName, groupColor, collectors } */
export default function CustomerTable({ rows, onOpen, bucketOptions = [], groupOptions = [], companyOptions = [], initialFilter = {}, actions, currency = 'LKR' }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initialFilter.status || 'all');
  const [bucket, setBucket] = useState(initialFilter.bucket || 'all');
  const [group, setGroup] = useState('all');
  const [company, setCompany] = useState(initialFilter.company || 'all');
  const [sort, setSort] = useState({ k: 'balance', dir: -1 });
  const [limit, setLimit] = useState(50);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let r = rows.filter((c) =>
      (!s || [c.name, c.code, c.invoiceNo, c.phone].some((v) => (v || '').toLowerCase().includes(s))) &&
      (status === 'all' || (status === 'unassigned' ? !c.groupName && c.balance > 0 : c.status === status)) &&
      (bucket === 'all' || (c.balance > 0 && c.bucket === bucket)) &&
      (group === 'all' || c.groupId === group) &&
      (company === 'all' || c.company === company));
    const k = sort.k;
    r = [...r].sort((a, b) => {
      let x = a[k], y = b[k];
      if (x instanceof Date || typeof x === 'string') {
        const dx = Date.parse(x), dy = Date.parse(y);
        if (!isNaN(dx) && !isNaN(dy)) return (dx - dy) * sort.dir;
        return String(x || '').localeCompare(String(y || '')) * sort.dir;
      }
      return ((x || 0) - (y || 0)) * sort.dir;
    });
    return r;
  }, [rows, q, status, bucket, group, company, sort]);

  const tot = list.reduce((a, c) => ({ ar: a.ar + c.amount, paid: a.paid + (c.paidAmount || 0), bal: a.bal + c.balance }), { ar: 0, paid: 0, bal: 0 });
  const th = (k, l) => (
    <th key={k}><button className="inline-flex items-center gap-1 hover:text-white" onClick={() => setSort((s) => ({ k, dir: s.k === k ? -s.dir : -1 }))}>
      {l}<ArrowUpDown className={cx('h-3 w-3', sort.k === k ? 'text-emerald-400' : 'opacity-40')} /></button></th>
  );

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input className="input !py-2 pl-9" placeholder="Search name, code, invoice, phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {companyOptions.length > 0 && (
            <select className="input !py-2 sm:w-28" value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="all">All cos.</option>
              {companyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select className="input !py-2 sm:w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All status</option><option value="overdue">Overdue</option><option value="current">Not due</option>
            <option value="settled">Settled</option><option value="unassigned">Unassigned</option>
          </select>
          <select className="input !py-2 sm:w-32" value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="all">All aging</option>
            {bucketOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="input !py-2 sm:w-40" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">All groups</option>
            {groupOptions.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
          </select>
        </div>
        <div className="text-xs text-slate-400 sm:ml-auto">
          <b className="text-slate-200">{list.length}</b> customers · Bal <b className="num text-rose-300">{short(tot.bal)}</b> · Rec <b className="num text-emerald-300">{short(tot.paid)}</b>
        </div>
      </div>

      {!list.length ? <Empty title="No customers match" text="Try clearing the filters." /> : (
        <>
          {/* desktop */}
          <div className="hidden overflow-x-auto md:block">
            <table className="tbl">
              <thead><tr>{COLS.map(([k, l]) => th(k, l))}{actions && <th />}</tr></thead>
              <tbody>
                {list.slice(0, limit).map((c) => (
                  <tr key={c._id} className="cursor-pointer" onClick={() => onOpen?.(c)}>
                    <td className="max-w-[240px]"><div className="truncate font-semibold text-white">{c.name}</div><div className="text-xs text-slate-500">{[c.code, c.invoiceNo].filter(Boolean).join(' · ')}{c.promised > 0 && <span className="text-violet-300"> · promised {short(c.promised)}</span>}</div></td>
                    <td className="text-xs font-bold text-slate-300">{c.company || '—'}</td>
                    <td className="num">{money(c.amount, '')}</td>
                    <td><div className="num text-emerald-300">{money(c.paidAmount || 0, '')}</div><Progress value={c.paidPct} className="mt-1 !h-1 w-20" /></td>
                    <td className={cx('num font-bold', c.balance > 0 ? 'text-rose-300' : 'text-emerald-300')}>{money(c.balance, '')}</td>
                    <td className="text-slate-300">{fmtDate(c.creditStartDate)}</td>
                    <td className="num text-slate-300">{c.creditPeriodDays}d</td>
                    <td className="text-slate-300">{fmtDate(c.due)}</td>
                    <td className="num text-slate-300">{c.daysSinceStart}d</td>
                    <td><StatusBadge c={c} /></td>
                    <td className="text-xs text-slate-300">{c.balance > 0 ? c.bucket : '—'}</td>
                    <td className="max-w-[200px]">{c.groupName ? (<><div className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-200"><span className="h-2 w-2 rounded-full" style={{ background: c.groupColor }} />{c.groupName}</div><div className="truncate text-xs text-slate-500">{c.collectors}</div></>) : <span className="text-xs text-slate-500">Unassigned</span>}</td>
                    <td className="text-xs text-slate-400">{c.lastActivityAt ? `${fmtDate(c.lastActivityAt)}${c.lastOutcome === 'no_payment' ? ' · missed' : ''}` : '—'}</td>
                    {actions && <td onClick={(e) => e.stopPropagation()}>{actions(c)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* mobile */}
          <div className="divide-y divide-white/[0.05] md:hidden">
            {list.slice(0, limit).map((c) => (
              <div key={c._id} className="flex items-center gap-3 p-3 active:bg-white/[0.03]" onClick={() => onOpen?.(c)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate font-semibold text-white">{c.name}</span>{c.company && <span className="text-[10px] font-bold text-slate-500">{c.company}</span>}<StatusBadge c={c} /></div>
                  <div className="mt-0.5 text-xs text-slate-500">Due {fmtDate(c.due)} · {c.daysSinceStart}d since start · {c.groupName || 'Unassigned'}</div>
                  <Progress value={c.paidPct} className="mt-2 !h-1" />
                </div>
                <div className="text-right">
                  <div className="num font-bold text-rose-300">{short(c.balance)}</div>
                  <div className="num text-[11px] text-slate-500">of {short(c.amount)}</div>
                </div>
                {actions ? <div onClick={(e) => e.stopPropagation()}>{actions(c)}</div> : <ChevronRight className="h-4 w-4 text-slate-600" />}
              </div>
            ))}
          </div>
          {list.length > limit && (
            <div className="border-t border-white/[0.06] p-3 text-center">
              <button className="btn btn-ghost btn-sm" onClick={() => setLimit((l) => l + 100)}>Show more ({list.length - limit} left)</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
