'use client';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Field, toast, cx } from './ui';
import { api } from '@/lib/client';
import { money, toInputDateTime, toInputDate, dayStartISO } from '@/lib/format';
import { balanceOf, invoiceStatus, daysBetween } from '@/lib/metrics';
import { fmtDate } from '@/lib/format';

const METHODS = ['Cash', 'Cheque', 'Bank transfer', 'Card', 'Online'];
const REASONS = ['Owner not available', 'Promised to pay later', 'Cheque not ready', 'Disputing invoice', 'Shop closed', 'No answer on phone'];

export default function CollectionForm({ open, onClose, customer, mode = 'payment', currency = 'LKR', onSaved, promised = 0 }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bal = customer ? balanceOf(customer) : 0;

  useEffect(() => {
    if (open) {
      setF({ amount: '', method: 'Cash', reference: '', date: toInputDateTime(), note: '', reason: '', promiseDate: '', split: customer?.invoices?.length ? 'pick' : 'auto', alloc: {} });
      setErr('');
    }
  }, [open, mode]);

  const invRows = useMemo(() => (customer?.invoices?.length ? invoiceStatus(customer).rows.filter((r) => r.open > 0) : []), [customer]);
  if (!customer) return null;
  const isPay = mode === 'payment';
  const picking = isPay && f.split === 'pick' && invRows.length > 0;
  const alloc = f.alloc || {};
  const allocTotal = Math.round(Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100;
  const payAmount = picking ? allocTotal : Number(f.amount || 0);
  const setAlloc = (ref, v) => setF({ ...f, alloc: { ...alloc, [ref]: v } });
  const toggleInv = (r) => {
    const n = { ...alloc };
    if (n[r.ref] !== undefined) delete n[r.ref];
    else n[r.ref] = String(r.open);
    setF({ ...f, alloc: n });
  };
  const badAlloc = picking && invRows.some((r) => alloc[r.ref] !== undefined && (Number(alloc[r.ref]) < 0 || Number(alloc[r.ref]) > r.open + 0.001));
  const isPromise = mode === 'promise';
  const free = Math.max(0, bal - promised);
  const plus = (n) => toInputDate(new Date(Date.now() + n * 86400000));

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const body = { customerId: customer._id, type: mode, date: new Date(f.date).toISOString(), note: f.note };
      if (isPay) Object.assign(body, {
        amount: payAmount, method: f.method, reference: f.reference,
        allocations: picking ? Object.entries(alloc).filter(([, v]) => Number(v) > 0).map(([ref, v]) => ({ ref, amount: Number(v) })) : undefined,
      });
      else if (isPromise) Object.assign(body, { amount: Number(f.amount), promiseDate: dayStartISO(f.promiseDate), reason: f.reason });
      else Object.assign(body, { reason: f.reason, promiseDate: f.promiseDate ? dayStartISO(f.promiseDate) : undefined });
      const r = await api('/api/collections', { method: 'POST', body });
      toast(isPay ? `Recorded ${money(body.amount, currency)} from ${customer.name}${body.allocations ? ` (${body.allocations.length} invoice${body.allocations.length > 1 ? 's' : ''})` : ''}` : isPromise ? `Promise saved: ${money(body.amount, currency)} on ${f.promiseDate}` : `Logged: not collected — ${customer.name}`);
      onSaved?.(r);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const after = Math.max(0, bal - payAmount);
  return (
    <Modal open={open} onClose={onClose} title={isPay ? 'Record payment' : isPromise ? 'Promise to pay' : 'Not collected'}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className={cx('btn', isPay ? 'btn-primary' : isPromise ? 'bg-violet-500 text-white hover:bg-violet-400' : 'btn-amber')}
          disabled={busy || (isPay ? !(payAmount > 0) || badAlloc : isPromise ? !(Number(f.amount) > 0) || !f.promiseDate : !f.reason?.trim())} onClick={save}>
          {busy ? 'Saving…' : isPay ? 'Save payment' : isPromise ? 'Save promise' : 'Save reason'}
        </button>
      </>}>
      <div className="mb-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="font-bold text-white">{customer.name}</div>
        <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
          <div><div className="text-slate-500">AR value</div><div className="num text-slate-200">{money(customer.amount, '')}</div></div>
          <div><div className="text-slate-500">Paid</div><div className="num text-emerald-300">{money(customer.paidAmount, '')}</div></div>
          <div><div className="text-slate-500">Balance due</div><div className="num font-bold text-rose-300">{money(bal, '')}</div></div>
        </div>
      </div>

      {isPromise ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-violet-500/10 p-3 text-xs text-violet-100">Not counted as collected. It shows as <b>promised</b> on the dashboard (aging minus promised) until the money arrives — then record the payment and the promise is marked kept automatically.</div>
          <Field label={`Amount promised (${currency})`} hint={promised > 0 ? `Already promised: ${money(promised, currency)} · free to promise: ${money(free, currency)}` : undefined}>
            <input className="input num text-lg" type="number" inputMode="decimal" min="0" step="0.01" max={free} autoFocus
              value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(free) })}>Full balance</button>
            <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(Math.round(free / 2)) })}>50%</button>
          </div>
          <Field label="Will pay on">
            <input className="input" type="date" min={toInputDate()} value={f.promiseDate} onChange={(e) => setF({ ...f, promiseDate: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {[['Tomorrow', 1], ['+3 days', 3], ['+1 week', 7], ['+2 weeks', 14], ['+30 days', 30]].map(([l, n]) => (
              <button type="button" key={l} className={cx('chip hover:bg-white/10', f.promiseDate === plus(n) && '!border-violet-400/50 !text-violet-200')} onClick={() => setF({ ...f, promiseDate: plus(n) })}>{l}</button>
            ))}
          </div>
          <Field label="What did they say? (optional)">
            <input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Cheque will be ready on Monday" />
          </Field>
        </div>
      ) : isPay ? (
        <div className="space-y-4">
          {invRows.length > 0 && (
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-ink-850/70 p-1">
              {[['pick', 'Choose invoices'], ['auto', 'Oldest first (auto)']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setF({ ...f, split: v })}
                  className={cx('rounded-lg py-1.5 text-xs font-semibold', f.split === v ? 'bg-white/10 text-white' : 'text-slate-400')}>{l}</button>
              ))}
            </div>
          )}
          {picking ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="label !mb-0">Tick the invoices paid · edit the amount for a part payment</span>
                <button type="button" className="text-xs font-semibold text-slate-400 hover:text-emerald-300" onClick={() => setF({ ...f, alloc: {} })}>Clear</button>
              </div>
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {invRows.map((r) => {
                  const on = alloc[r.ref] !== undefined;
                  const v = Number(alloc[r.ref] || 0);
                  const left = Math.round((r.open - v) * 100) / 100;
                  const late = Math.max(0, -daysBetween(new Date(), r.due));
                  return (
                    <div key={r.ref} className={cx('rounded-xl border p-2.5 transition', on ? 'border-emerald-400/40 bg-emerald-500/[0.06]' : 'border-white/[0.07]')}>
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={on} onChange={() => toggleInv(r)} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{r.ref || 'Invoice'}</div>
                          <div className="text-[11px] text-slate-500">{fmtDate(r.date)} · due {fmtDate(r.due)}{late > 0 && <span className="text-rose-300"> · {late}d late</span>}{r.state === 'part' && <span className="text-amber-300"> · part paid</span>}</div>
                        </div>
                        <div className="text-right"><div className="num text-sm font-bold text-rose-300">{money(r.open, '')}</div><div className="text-[10px] text-slate-500">open{r.open < r.amount && ` of ${money(r.amount, '')}`}</div></div>
                      </label>
                      {on && (
                        <div className="mt-2 flex items-center gap-2 pl-6">
                          <input className="input num !py-1.5" type="number" inputMode="decimal" min="0" step="0.01" max={r.open} value={alloc[r.ref]} onChange={(e) => setAlloc(r.ref, e.target.value)} />
                          <span className={cx('shrink-0 text-[11px]', v > r.open + 0.001 ? 'text-rose-300' : left > 0 ? 'text-amber-300' : 'text-emerald-300')}>
                            {v > r.open + 0.001 ? `max ${money(r.open, '')}` : left > 0 ? `${money(left, '')} stays open` : 'fully paid'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5">
                <span className="text-sm text-slate-300">Total payment · {Object.values(alloc).filter((x) => Number(x) > 0).length} invoice(s)</span>
                <span className="num text-lg font-bold text-emerald-300">{money(allocTotal, currency)}</span>
              </div>
              {payAmount > 0 && <div className="mt-1 text-right text-xs text-slate-500">Customer balance after this: {money(after, currency)}</div>}
            </div>
          ) : (
            <>
              <Field label={`Amount received (${currency})`} hint={f.amount ? `Balance after this: ${money(after, currency)}` : invRows.length ? 'Applied to the oldest open invoices first.' : 'Partial payments are fine — record each one separately.'}>
                <input className="input num text-lg" type="number" inputMode="decimal" min="0" step="0.01" max={bal} autoFocus
                  value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(bal) })}>Full balance</button>
                <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(Math.round(bal / 2)) })}>50%</button>
                <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(Math.round(bal / 4)) })}>25%</button>
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reference / cheque #">
              <input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
            </Field>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Reason not collected">
            <textarea className="input min-h-[80px]" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="What happened?" />
          </Field>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button type="button" key={r} className={cx('chip hover:bg-white/10', f.reason === r && '!border-amber-400/50 !text-amber-200')} onClick={() => setF({ ...f, reason: r })}>{r}</button>
            ))}
          </div>
          <Field label="Customer promised to pay on (optional)">
            <input className="input" type="date" min={toInputDate()} value={f.promiseDate} onChange={(e) => setF({ ...f, promiseDate: e.target.value })} />
          </Field>
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date & time">
          <input className="input" type="datetime-local" max={toInputDateTime()} value={f.date || ''} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Note (optional)">
          <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
      {err && <div className="mt-3 text-sm font-medium text-rose-300">{err}</div>}
    </Modal>
  );
}
