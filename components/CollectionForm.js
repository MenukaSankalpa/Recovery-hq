'use client';
import { useEffect, useState } from 'react';
import { Modal, Field, toast, cx } from './ui';
import { api } from '@/lib/client';
import { money, toInputDateTime, toInputDate, dayStartISO } from '@/lib/format';
import { balanceOf } from '@/lib/metrics';

const METHODS = ['Cash', 'Cheque', 'Bank transfer', 'Card', 'Online'];
const REASONS = ['Owner not available', 'Promised to pay later', 'Cheque not ready', 'Disputing invoice', 'Shop closed', 'No answer on phone'];

export default function CollectionForm({ open, onClose, customer, mode = 'payment', currency = 'LKR', onSaved, promised = 0 }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bal = customer ? balanceOf(customer) : 0;

  useEffect(() => {
    if (open) {
      setF({ amount: '', method: 'Cash', reference: '', date: toInputDateTime(), note: '', reason: '', promiseDate: '' });
      setErr('');
    }
  }, [open, mode]);

  if (!customer) return null;
  const isPay = mode === 'payment';
  const isPromise = mode === 'promise';
  const free = Math.max(0, bal - promised);
  const plus = (n) => toInputDate(new Date(Date.now() + n * 86400000));

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const body = { customerId: customer._id, type: mode, date: new Date(f.date).toISOString(), note: f.note };
      if (isPay) Object.assign(body, { amount: Number(f.amount), method: f.method, reference: f.reference });
      else if (isPromise) Object.assign(body, { amount: Number(f.amount), promiseDate: dayStartISO(f.promiseDate), reason: f.reason });
      else Object.assign(body, { reason: f.reason, promiseDate: f.promiseDate ? dayStartISO(f.promiseDate) : undefined });
      const r = await api('/api/collections', { method: 'POST', body });
      toast(isPay ? `Recorded ${money(body.amount, currency)} from ${customer.name}` : isPromise ? `Promise saved: ${money(body.amount, currency)} on ${f.promiseDate}` : `Logged: not collected — ${customer.name}`);
      onSaved?.(r);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const after = Math.max(0, bal - Number(f.amount || 0));
  return (
    <Modal open={open} onClose={onClose} title={isPay ? 'Record payment' : isPromise ? 'Promise to pay' : 'Not collected'}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className={cx('btn', isPay ? 'btn-primary' : isPromise ? 'bg-violet-500 text-white hover:bg-violet-400' : 'btn-amber')}
          disabled={busy || (isPay ? !(Number(f.amount) > 0) : isPromise ? !(Number(f.amount) > 0) || !f.promiseDate : !f.reason?.trim())} onClick={save}>
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
          <Field label={`Amount received (${currency})`} hint={f.amount ? `Balance after this: ${money(after, currency)}` : 'Partial payments are fine — record each one separately.'}>
            <input className="input num text-lg" type="number" inputMode="decimal" min="0" step="0.01" max={bal} autoFocus
              value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(bal) })}>Full balance</button>
            <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(Math.round(bal / 2)) })}>50%</button>
            <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(Math.round(bal / 4)) })}>25%</button>
          </div>
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
