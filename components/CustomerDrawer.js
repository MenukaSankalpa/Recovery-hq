'use client';
import { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, XCircle, Trash2, CalendarClock, Phone, Hash, Users, Handshake, Ban, Receipt } from 'lucide-react';
import { Drawer, Progress, StatusBadge, Spinner, Badge, toast } from './ui';
import CollectionForm from './CollectionForm';
import { api } from '@/lib/client';
import { enrich, promiseState, promiseLeft } from '@/lib/metrics';
import { PromiseBadge } from './PromiseBadge';
import { money, fmtDate, fmtDateTime, short } from '@/lib/format';
import { useMe } from './AppShell';

export default function CustomerDrawer({ id, open, onClose, onChanged, canCollect, canDelete, currency = 'LKR' }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [showInv, setShowInv] = useState(false);
  const me = useMe();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setD(await api(`/api/customers/${id}`));
    } catch (e) {
      toast(e.message, 'err');
    }
  }, [id]);

  useEffect(() => {
    setD(null);
    if (open) load();
  }, [open, load]);

  const c = d ? enrich(d.customer) : null;
  const pays = d?.entries.filter((e) => e.type === 'payment') || [];
  const openProms = d?.entries.filter((e) => e.type === 'promise' && e.status === 'open') || [];
  const promised = openProms.reduce((s, p) => s + promiseLeft(p), 0);

  async function cancelPromise(e) {
    const why = prompt('Cancel this promise? Reason (optional):');
    if (why === null) return;
    try {
      await api(`/api/collections/${e._id}`, { method: 'PATCH', body: { status: 'cancelled', reason: why } });
      toast('Promise cancelled');
      load();
      onChanged?.();
    } catch (x) {
      toast(x.message, 'err');
    }
  }

  async function remove(e) {
    if (!confirm(`Delete this ${e.type === 'payment' ? `payment of ${money(e.amount, currency)}` : 'entry'}? The balance will be corrected.`)) return;
    try {
      await api(`/api/collections/${e._id}`, { method: 'DELETE' });
      toast('Entry removed');
      load();
      onChanged?.();
    } catch (x) {
      toast(x.message, 'err');
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={c?.name || 'Customer'} subtitle={c && [c.company, c.code, c.invoiceNo].filter(Boolean).join(' · ')}>
      {!c ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {[
              ['AR value', c.amount, 'text-white'],
              ['Recovered', c.paidAmount, 'text-emerald-300'],
              ['Balance due', c.balance, c.balance > 0 ? 'text-rose-300' : 'text-emerald-300'],
            ].map(([l, v, cls]) => (
              <div key={l} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{l}</div>
                <div className={`num mt-1 text-lg font-bold ${cls}`}>{short(v)}</div>
                <div className="num text-[11px] text-slate-500">{money(v, '')}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-slate-400"><span>{Math.round(c.paidPct)}% recovered · {pays.length} payment{pays.length === 1 ? '' : 's'}</span><StatusBadge c={c} /></div>
            <Progress value={c.paidPct} />
          </div>

          {promised > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-violet-500/25 bg-violet-500/[0.07] p-3 text-sm">
              <span className="flex items-center gap-2 text-violet-100"><Handshake className="h-4 w-4" />Promised, not yet received</span>
              <span className="text-right"><b className="num text-violet-200">{money(promised, '')}</b><span className="block text-[11px] text-violet-200/60">net still unpromised {money(Math.max(0, c.balance - promised), '')}</span></span>
            </div>
          )}

          {c.invoices?.length > 0 && (
            <div className="rounded-2xl border border-white/[0.06]">
              <button className="flex w-full items-center justify-between p-3 text-sm font-semibold text-white" onClick={() => setShowInv(!showInv)}>
                <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-slate-400" />{c.invoices.length} invoice lines · {c.parts.length} still open</span>
                <span className="text-xs text-slate-400">{showInv ? 'Hide' : 'Show'}</span>
              </button>
              {showInv && (
                <div className="max-h-72 overflow-auto border-t border-white/[0.06]">
                  <table className="tbl text-xs">
                    <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Amount</th><th>Open</th><th>Overdue</th></tr></thead>
                    <tbody>
                      {[...c.invoices].sort((a, b) => new Date(a.date) - new Date(b.date)).map((iv, i) => {
                        const p = c.parts.find((x) => x.ref === iv.ref && Math.abs(x.amount - iv.amount) < 0.01);
                        return (
                          <tr key={i} className={iv.amount < 0 ? 'text-sky-300' : ''}>
                            <td className="font-semibold">{iv.ref || '—'}{iv.note && <div className="text-[10px] text-emerald-300">{iv.note}</div>}</td>
                            <td>{fmtDate(iv.date)}</td><td>{iv.amount < 0 ? '—' : fmtDate(iv.dueDate)}</td>
                            <td className="num">{money(iv.amount, '')}</td>
                            <td className={`num ${p ? 'text-rose-300' : 'text-emerald-300'}`}>{iv.amount < 0 ? 'credit' : p ? money(p.open, '') : 'cleared'}</td>
                            <td className="num">{p?.overdueDays ? `${p.overdueDays}d` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-white/[0.06] p-4 text-sm">
            {[
              ['Credit start date', fmtDate(c.creditStartDate)],
              ['Credit period', `${c.creditPeriodDays} days`],
              ['Due date', fmtDate(c.due)],
              ['Days since credit start', `${c.daysSinceStart} days`],
              [c.status === 'overdue' ? 'Overdue by' : 'Days to due', c.status === 'overdue' ? `${c.overdueDays} days` : c.status === 'settled' ? '—' : `${c.daysToDue} days`],
              ['Last payment', c.lastPaymentAt ? fmtDateTime(c.lastPaymentAt) : 'None yet'],
            ].map(([l, v]) => (
              <div key={l}><div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{l}</div><div className="mt-0.5 font-semibold text-slate-100">{v}</div></div>
            ))}
            {c.phone && <div className="col-span-2 flex items-center gap-2 text-slate-300"><Phone className="h-3.5 w-3.5 text-slate-500" /><a href={`tel:${c.phone}`} className="hover:text-emerald-300">{c.phone}</a>{c.contactPerson && <span className="text-slate-500">· {c.contactPerson}</span>}</div>}
          </div>

          {c.group ? (
            <div className="rounded-2xl border border-white/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.group.color }} />{c.group.name}
                <Badge tone={c.group.status === 'active' ? 'settled' : 'slate'}>{c.group.status}</Badge></div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{fmtDate(c.group.startDate)} → {fmtDate(c.group.endDate)}</span>
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{c.group.assignees.map((a) => a.name).join(', ')}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">Not assigned to any collection group</div>
          )}

          {canCollect && c.balance > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <button className="btn btn-primary !px-2" onClick={() => setForm('payment')}><CircleDollarSign className="h-4 w-4" />Collected</button>
              <button className="btn !px-2 border border-violet-400/30 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25" onClick={() => setForm('promise')}><Handshake className="h-4 w-4" />Promise</button>
              <button className="btn btn-amber !px-2" onClick={() => setForm('no_payment')}><XCircle className="h-4 w-4" />Not collected</button>
            </div>
          )}

          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Recovery timeline ({d.entries.length})</div>
            {!d.entries.length && <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No collection attempts yet</div>}
            <ol className="relative space-y-3 border-l border-white/10 pl-5">
              {d.entries.map((e) => (
                <li key={e._id} className="relative">
                  <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-ink-900 ${e.type === 'payment' ? 'bg-emerald-400' : e.type === 'promise' ? 'bg-violet-400' : 'bg-amber-400'}`} />
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {e.type === 'payment' ? (
                          <div className="num font-bold text-emerald-300">+ {money(e.amount, currency)}</div>
                        ) : e.type === 'promise' ? (
                          <div className="flex flex-wrap items-center gap-2"><span className="num font-bold text-violet-200">Promise {money(e.amount, currency)} on {fmtDate(e.promiseDate)}</span><PromiseBadge p={e} /></div>
                        ) : (
                          <div className="font-semibold text-amber-200">Not collected</div>
                        )}
                        <div className="mt-0.5 text-xs text-slate-400">{fmtDateTime(e.date)} · by <b className="text-slate-300">{e.user?.name || '—'}</b>{e.group?.name && <> · {e.group.name}</>}</div>
                      </div>
                      {e.type === 'promise' && e.status === 'open' && (me?.user?.role === 'ceo' || String(e.user?._id) === me?.user?._id) && <button onClick={() => cancelPromise(e)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200" title="Cancel promise"><Ban className="h-3.5 w-3.5" /></button>}
                      {canDelete && <button onClick={() => remove(e)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300" title="Delete entry"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                    {e.type === 'payment' && (e.method || e.reference) && <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-400"><Hash className="h-3 w-3" />{[e.method, e.reference].filter(Boolean).join(' · ')}</div>}
                    {e.reason && <div className="mt-1.5 text-sm text-slate-200">“{e.reason}”</div>}
                    {e.type === 'promise' && e.fulfilled > 0 && e.status !== 'kept' && <div className="mt-1 text-xs text-violet-200/80">Received so far {money(e.fulfilled, '')} · {money(promiseLeft(e), '')} still to come</div>}
                    {e.type !== 'promise' && e.promiseDate && <div className="mt-1 text-xs font-semibold text-sky-300">Said they will pay: {fmtDate(e.promiseDate)}</div>}
                    {e.note && <div className="mt-1 text-xs text-slate-500">{e.note}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      <CollectionForm open={!!form} mode={form} customer={d?.customer} promised={promised} currency={currency} onClose={() => setForm(null)}
        onSaved={() => { load(); onChanged?.(); }} />
    </Drawer>
  );
}
