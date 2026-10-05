'use client';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Field, toast, cx } from './ui';
import { api } from '@/lib/client';
import { money, toInputDateTime, toInputDate, dayStartISO } from '@/lib/format';
import { balanceOf, invoiceStatus, daysBetween } from '@/lib/metrics';
import { applyReceipts } from './applyReceipts';
import { fmtDate } from '@/lib/format';

const METHODS = ['Cash', 'Cheque', 'Bank transfer', 'Card', 'Online', 'WHT'];
const REASONS = ['Owner not available', 'Promised to pay later', 'Cheque not ready', 'Disputing invoice', 'Shop closed', 'No answer on phone'];

export default function CollectionForm({ open, onClose, customer, mode = 'payment', currency = 'LKR', onSaved, promised = 0 }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bal = customer ? balanceOf(customer) : 0;

  useEffect(() => {
    if (open) {
      setF({ amount: '', method: 'Cash', reference: '', date: toInputDateTime(), note: '', reason: '', promiseDate: '', split: customer?.invoices?.length ? 'pick' : 'auto', alloc: {}, crs: {} });
      setErr('');
    }
  }, [open, mode]);

  const allRows = useMemo(() => {
    if (!customer?.invoices?.length) return [];
    const st = invoiceStatus(customer);
    return [...st.rows, ...st.creditRows].sort((a, b) => a.date - b.date);
  }, [customer]);
  const invRows = useMemo(() => allRows.filter((r) => r.open > 0), [allRows]);
  if (!customer) return null;
  const isPay = mode === 'payment';
  const whtPending = Math.max(0, Math.round(((customer.whtDeclared || 0) - (customer.whtReceived || 0)) * 100) / 100);
  const cashDue = Math.max(0, Math.round((bal - whtPending) * 100) / 100);
  const isCert = isPay && f.method === 'WHT certificate';
  const isWht = isPay && f.method === 'WHT';
  const picking = isPay && !isCert && f.split === 'pick' && invRows.length > 0;
  const alloc = f.alloc || {};
  const allocTotal = Math.round(Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100;
  const crs = f.crs || {};
  const crTicked = allRows.filter((r) => r.credit && r.open < -0.009 && crs[r.ref]);
  const crTotal = Math.round(crTicked.reduce((s, r) => s - r.open, 0) * 100) / 100;
  const crUse = picking ? Math.min(crTotal, allocTotal) : 0;
  const payAmount = picking ? Math.round((allocTotal - crUse) * 100) / 100 : Number(f.amount || 0);
  const toggleCr = (ref) => setF({ ...f, crs: { ...crs, [ref]: !crs[ref] } });
  const tickAll = () => setF({ ...f, alloc: Object.fromEntries(invRows.map((r) => [r.ref, String(r.open)])), crs: Object.fromEntries(allRows.filter((r) => r.credit && r.open < -0.009).map((r) => [r.ref, true])) });
  // WHT: just tick it — whatever is left of the selected amount after the cash becomes WHT
  const whtBase = picking ? invRows.filter((r) => alloc[r.ref] !== undefined).reduce((s, r) => s + r.open, 0) : cashDue;
  const whtNow = isPay && !isCert && f.whtOn ? Math.max(0, Math.round((Math.min(whtBase, cashDue) - payAmount) * 100) / 100) : 0;
  const setAlloc = (ref, v) => setF({ ...f, alloc: { ...alloc, [ref]: v } });
  const toggleInv = (r) => {
    const n = { ...alloc };
    if (n[r.ref] !== undefined) delete n[r.ref];
    else n[r.ref] = String(r.open);
    setF({ ...f, alloc: n });
  };
  const unapplied = customer?.invoices?.length ? Math.round(invoiceStatus(customer).creditRows.reduce((s, r) => s - Math.min(0, r.open), 0) * 100) / 100 : 0;
  const tickedRefs = Object.keys(alloc);
  async function doApply() {
    const ok = await applyReceipts(customer, tickedRefs, currency);
    if (ok) { setF({ ...f, alloc: {} }); onSaved?.(); }
  }
  const badAlloc = picking && invRows.some((r) => alloc[r.ref] !== undefined && (Number(alloc[r.ref]) < 0 || Number(alloc[r.ref]) > r.open + 0.001));
  const isPromise = mode === 'promise';
  const free = Math.max(0, bal - promised);
  const plus = (n) => toInputDate(new Date(Date.now() + n * 86400000));

  async function save() {
    setBusy(true);
    setErr('');
    try {
      let applied = 0;
      let allocNow = alloc;
      if (picking && crUse > 0.009) {
        const refsInOrder = invRows.filter((r) => Number(alloc[r.ref]) > 0).map((r) => r.ref);
        const ar = await api(`/api/customers/${customer._id}/apply-credits`, { method: 'POST', body: { refs: refsInOrder, credits: crTicked.map((r) => r.ref) } });
        applied = ar.applied || 0;
        allocNow = { ...alloc };
        for (const x of ar.invoices || []) allocNow[x.ref] = String(Math.max(0, Math.round((Number(allocNow[x.ref] || 0) - x.amount) * 100) / 100));
        if (payAmount <= 0.009 && !(whtNow > 0)) {
          toast(`Receipts ${money(applied, currency)} matched to ${(ar.invoices || []).length} invoice(s) for ${customer.name}`);
          onSaved?.(); onClose(); return;
        }
      }
      const body = { customerId: customer._id, type: mode, date: new Date(f.date).toISOString(), note: f.note };
      if (isPay) Object.assign(body, {
        amount: picking ? Math.round(Object.values(allocNow).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100 : payAmount, method: f.method, reference: f.reference, wht: whtNow || undefined,
        allocations: picking ? Object.entries(allocNow).filter(([, v]) => Number(v) > 0).map(([ref, v]) => ({ ref, amount: Number(v) })) : undefined,
      });
      else if (isPromise) Object.assign(body, { amount: Number(f.amount), promiseDate: dayStartISO(f.promiseDate), reason: f.reason });
      else Object.assign(body, { reason: f.reason, promiseDate: f.promiseDate ? dayStartISO(f.promiseDate) : undefined });
      const r = await api('/api/collections', { method: 'POST', body });
      toast(isWht ? `WHT ${money(body.amount, currency)} marked for ${customer.name}${body.allocations ? ` (${body.allocations.length} invoice${body.allocations.length > 1 ? 's' : ''} closed)` : ''}` : isPay ? `Recorded ${isCert ? 'WHT certificate ' : ''}${money(body.amount, currency)}${whtNow ? ` + WHT ${money(whtNow, currency)}` : ''} from ${customer.name}${body.allocations ? ` (${body.allocations.length} invoice${body.allocations.length > 1 ? 's' : ''})` : ''}${applied ? ` + receipts ${money(applied, currency)} matched` : ''}` : isPromise ? `Promise saved: ${money(body.amount, currency)} on ${f.promiseDate}` : `Logged: not collected — ${customer.name}`);
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
    <Modal open={open} onClose={onClose} title={isWht ? 'Mark invoices as WHT' : isPay ? 'Record payment' : isPromise ? 'Promise to pay' : 'Not collected'}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className={cx('btn', isWht ? 'btn-amber' : isPay ? 'btn-primary' : isPromise ? 'bg-violet-500 text-white hover:bg-violet-400' : 'btn-amber')}
          disabled={busy || (isPay ? !(payAmount > 0 || whtNow > 0 || crUse > 0.009) || badAlloc || (isCert && payAmount > whtPending + 0.001) : isPromise ? !(Number(f.amount) > 0) || !f.promiseDate : !f.reason?.trim())} onClick={save}>
          {busy ? 'Saving…' : isWht ? 'Save WHT' : isPay ? 'Save payment' : isPromise ? 'Save promise' : 'Save reason'}
        </button>
      </>}>
      <div className="mb-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="font-bold text-white">{customer.name}</div>
        <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
          <div><div className="text-slate-500">AR value</div><div className="num text-slate-200">{money(customer.amount, '')}</div></div>
          <div><div className="text-slate-500">Paid</div><div className="num text-emerald-300">{money(customer.paidAmount, '')}</div></div>
          <div><div className="text-slate-500">Balance due</div><div className="num font-bold text-rose-300">{money(bal, '')}</div></div>
        </div>
        {whtPending > 0 && (
          <div className="mt-2 flex justify-between rounded-lg bg-amber-400/10 px-2.5 py-1.5 text-xs text-amber-100">
            <span>Cash due <b className="num">{money(cashDue, '')}</b></span><span>WHT pending (certificate) <b className="num">{money(whtPending, '')}</b></span>
          </div>
        )}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <select className="input" value={f.method} onChange={(e) => {
                const m = e.target.value;
                // WHT on chosen invoices = the whole open amount of each ticked invoice
                const a = m === 'WHT' ? Object.fromEntries(Object.keys(alloc).map((ref) => [ref, String(invRows.find((r) => r.ref === ref)?.open ?? alloc[ref])])) : alloc;
                setF({ ...f, method: m, alloc: a, split: m === 'WHT' && invRows.length ? 'pick' : f.split });
              }}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label={isWht ? 'WHT certificate # (optional)' : 'Reference / cheque #'}>
              <input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
            </Field>
          </div>
          {false && unapplied > 0.009 && !isCert && !isWht && (
            <div className="rounded-xl border border-sky-400/30 bg-sky-500/[0.08] p-3 text-xs text-sky-100">
              <div><b className="num">{money(unapplied, currency)}</b> of this customer&apos;s receipts are not matched to invoices yet, so the invoices add up to more than the customer owes ({money(bal, currency)}).</div>
              <button type="button" onClick={doApply} className="btn btn-sm mt-2 border border-sky-400/40 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30">
                Apply receipts to {tickedRefs.length ? `the ${tickedRefs.length} ticked invoice(s)` : 'oldest invoices'}
              </button>
            </div>
          )}
          {invRows.length > 0 && !isCert && !isWht && (
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
                <span className="label !mb-0">{f.method === 'WHT' ? 'Tick the invoices to mark as WHT' : 'Tick the invoices paid · edit the amount for a part payment'} <span className="normal-case text-slate-500">({invRows.length} open of {allRows.length} lines)</span></span>
                <span className="flex shrink-0 gap-3"><button type="button" className="text-xs font-semibold text-emerald-300 hover:text-emerald-200" onClick={tickAll}>Tick all</button><button type="button" className="text-xs font-semibold text-slate-400 hover:text-emerald-300" onClick={() => setF({ ...f, alloc: {}, crs: {} })}>Clear</button></span>
              </div>
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {allRows.map((r) => {
                  if (r.credit) {
                    const avail = r.open < -0.009;
                    const on = avail && !!crs[r.ref];
                    return (
                      <label key={'cr' + r.ref} className={cx('flex items-center gap-2.5 rounded-xl border p-2.5', avail ? 'cursor-pointer' : 'opacity-60', on ? 'border-sky-400/50 bg-sky-500/[0.08]' : 'border-sky-400/20 bg-sky-500/[0.03]')}>
                        <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={on || !avail} disabled={!avail} onChange={() => toggleCr(r.ref)} />
                        <div className="min-w-0 flex-1">
                          <div className={cx('truncate text-sm font-semibold', avail ? 'text-sky-100' : 'text-slate-300 line-through decoration-slate-500')}>{r.ref || 'Receipt'}</div>
                          <div className="text-[11px] text-slate-500">{fmtDate(r.date)} · receipt / credit (−)</div>
                        </div>
                        <div className="text-right"><div className="num text-sm font-bold text-sky-200">{money(avail ? r.open : r.amount, '')}</div><div className="text-[10px] font-semibold text-sky-300">{avail ? (r.applied > 0.009 ? `left of ${money(r.amount, '')}` : 'receipt') : 'used on invoices'}</div></div>
                      </label>
                    );
                  }
                  if (!(r.open > 0)) return (
                    <div key={r.ref} className="flex items-center gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.01] p-2.5 opacity-60">
                      <input type="checkbox" className="h-4 w-4" checked disabled readOnly />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-300 line-through decoration-slate-500">{r.ref || 'Invoice'}</div>
                        <div className="text-[11px] text-slate-500">{fmtDate(r.date)} · due {fmtDate(r.due)}</div>
                      </div>
                      <div className="text-right"><div className="num text-sm text-slate-400">{money(r.amount, '')}</div><div className="text-[10px] font-semibold text-sky-300">{r.credited > 0.009 && r.paid + r.auto < 0.01 ? 'closed by receipt' : r.credited > 0.009 ? 'paid + receipt' : 'paid'}</div></div>
                    </div>
                  );
                  const on = alloc[r.ref] !== undefined;
                  const v = Number(alloc[r.ref] || 0);
                  const left = Math.round((r.open - v) * 100) / 100;
                  const late = Math.max(0, -daysBetween(new Date(), r.due));
                  return (
                    <div key={r.ref} className={cx('rounded-xl border p-2.5 transition', on ? (isWht ? 'border-amber-400/40 bg-amber-400/[0.06]' : 'border-emerald-400/40 bg-emerald-500/[0.06]') : 'border-white/[0.07]')}>
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={on} onChange={() => toggleInv(r)} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">{r.ref || 'Invoice'}</div>
                          <div className="text-[11px] text-slate-500">{fmtDate(r.date)} · due {fmtDate(r.due)}{late > 0 && <span className="text-rose-300"> · {late}d late</span>}{r.state === 'part' && <span className="text-amber-300"> · part paid</span>}</div>
                        </div>
                        <div className="text-right"><div className="num text-sm font-bold text-rose-300">{money(r.open, '')}</div><div className="text-[10px] text-slate-500">open{r.open < r.amount && ` of ${money(r.amount, '')}`}</div></div>
                      </label>
                      {on && f.method === 'WHT' && <div className="mt-1.5 pl-6 text-[11px] font-semibold text-amber-300">WHT {money(r.open, '')} — invoice closes</div>}
                      {on && f.method !== 'WHT' && (
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
                <span className="text-sm text-slate-300">{isWht ? 'Total WHT' : 'Total payment'} · {Object.values(alloc).filter((x) => Number(x) > 0).length} invoice(s)</span>
                <span className={cx('num text-lg font-bold', isWht ? 'text-amber-300' : 'text-emerald-300')}>{money(payAmount, currency)}</span>
              </div>
              {crUse > 0.009 && <div className="mt-1 flex justify-between px-3 text-xs text-sky-200"><span>Invoices {money(allocTotal, '')} − receipts {money(crUse, '')}</span><span>{isWht ? 'WHT' : 'cash'} {money(payAmount, '')}</span></div>}
              {crTotal > allocTotal + 0.009 && <div className="mt-1 px-3 text-xs text-amber-300">Receipts ticked ({money(crTotal, '')}) are more than the invoices ticked — tick more invoices; the rest stays unmatched.</div>}
              {(payAmount > 0 || crUse > 0) && <div className="mt-1 text-right text-xs text-slate-500">Customer balance after this: {money(after, currency)}</div>}
            </div>
          ) : (
            <>
              <Field label={isCert ? `WHT certificate amount (${currency})` : isWht ? `WHT amount (${currency})` : `Cash received (${currency})`}
                hint={isCert ? `WHT pending: ${money(whtPending, currency)}` : f.amount ? `Balance after this: ${money(after, currency)}` : invRows.length ? 'Applied to the oldest open invoices first. Pay in one go or many times.' : 'Pay in one go or many times — record each payment separately.'}>
                <input className="input num text-lg" type="number" inputMode="decimal" min="0" step="0.01" max={isCert ? whtPending : cashDue} autoFocus
                  value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" />
              </Field>
              <div className="flex flex-wrap gap-2">
                {isCert ? <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(whtPending) })}>Full WHT pending</button> : <>
                <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(cashDue) })}>Full cash due</button>
                <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(Math.round(bal / 2)) })}>50%</button>
                <button type="button" className="chip hover:bg-white/10" onClick={() => setF({ ...f, amount: String(Math.round(bal / 4)) })}>25%</button>
                </>}
              </div>
            </>
          )}
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
