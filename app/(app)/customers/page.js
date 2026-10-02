'use client';
import { useMemo, useState } from 'react';
import { Plus, Upload, Pencil, Trash2, FileSpreadsheet, Sheet } from 'lucide-react';
import MasterImport from '@/components/MasterImport';
import { PageHeader, useMe } from '@/components/AppShell';
import { Card, Modal, Field, PageLoader, toast } from '@/components/ui';
import CustomerTable from '@/components/CustomerTable';
import CustomerDrawer from '@/components/CustomerDrawer';
import { api, useLive } from '@/lib/client';
import { enrich, buckets, bucketOf, DAY } from '@/lib/metrics';
import { short, toInputDate, dayStartISO, fmtDate } from '@/lib/format';

const blank = () => ({ company: '', name: '', code: '', phone: '', contactPerson: '', address: '', invoiceNo: '', amount: '', creditStartDate: toInputDate(), creditPeriodDays: 30, notes: '' });

function CustomerForm({ open, onClose, initial, onSaved, currency }) {
  const [f, setF] = useState(() => (initial ? { ...blank(), ...initial, creditStartDate: toInputDate(initial.creditStartDate) } : blank()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const locked = !!f.invoices?.length;
  const due = f.creditStartDate ? new Date(new Date(`${f.creditStartDate}T00:00`).getTime() + Number(f.creditPeriodDays || 0) * DAY) : null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const { invoices, group, paidAmount, ...rest } = f;
      const body = { ...rest, amount: Number(f.amount), creditPeriodDays: Number(f.creditPeriodDays), creditStartDate: dayStartISO(f.creditStartDate) };
      if (initial?._id) await api(`/api/customers/${initial._id}`, { method: 'PATCH', body });
      else await api('/api/customers', { method: 'POST', body });
      toast(initial?._id ? 'Customer updated' : `Added ${f.name}`);
      onSaved();
      if (initial?._id) onClose();
      else setF({ ...blank(), creditStartDate: f.creditStartDate, creditPeriodDays: f.creditPeriodDays });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial?._id ? 'Edit customer' : 'Add customer'} wide
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" disabled={busy || !f.name || !(Number(f.amount) >= 0) || f.amount === ''} onClick={save}>{busy ? 'Saving…' : initial?._id ? 'Save' : 'Save & add another'}</button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name *"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Company (e.g. CLL, CTL)"><input className="input" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value.toUpperCase() })} /></Field>
        {locked && <div className="rounded-xl bg-sky-500/10 p-3 text-xs text-sky-100 sm:col-span-2">This customer came from the AR master file with {f.invoices.length} invoice lines, so AR value, dates and credit period follow those invoices. Re-import the file to change them.</div>}
        <Field label={`AR value — amount they must pay (${currency}) *`}><input className="input num" type="number" inputMode="decimal" min="0" disabled={locked} value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Invoice / reference no."><input className="input" value={f.invoiceNo} onChange={set('invoiceNo')} /></Field>
        <Field label="Credit (payment) start date *"><input className="input" type="date" disabled={locked} value={f.creditStartDate} onChange={set('creditStartDate')} /></Field>
        <Field label="Credit period (days) *" hint={due && `Due date: ${fmtDate(due)}`}>
          <input className="input num" type="number" min="0" disabled={locked} value={f.creditPeriodDays} onChange={set('creditPeriodDays')} />
          <div className="mt-2 flex flex-wrap gap-1.5">{[7, 14, 30, 45, 60, 90].map((n) => <button type="button" key={n} className="chip hover:bg-white/10" onClick={() => setF({ ...f, creditPeriodDays: n })}>{n}</button>)}</div>
        </Field>
        <Field label="Customer code"><input className="input" value={f.code} onChange={set('code')} /></Field>
        <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Contact person"><input className="input" value={f.contactPerson} onChange={set('contactPerson')} /></Field>
        <Field label="Address"><input className="input" value={f.address} onChange={set('address')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className="input" value={f.notes} onChange={set('notes')} /></Field>
      </div>
      {err && <div className="mt-3 text-sm font-medium text-rose-300">{err}</div>}
    </Modal>
  );
}

function parseDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function ImportModal({ open, onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const rows = useMemo(() => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const head = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    const idx = (...names) => head.findIndex((h) => names.includes(h));
    const I = { name: idx('name', 'customer', 'customername'), amount: idx('amount', 'ar', 'arvalue', 'value', 'balance'), start: idx('creditstartdate', 'startdate', 'date', 'invoicedate', 'paymentstartdate'), period: idx('creditperioddays', 'creditperiod', 'period', 'days'), code: idx('code', 'customercode'), phone: idx('phone', 'mobile'), inv: idx('invoiceno', 'invoice', 'ref') };
    return lines.slice(1).map((l) => {
      const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
      const d = parseDate(c[I.start]);
      return {
        name: c[I.name], amount: Number(String(c[I.amount] || '').replace(/,/g, '')), creditStartDate: d ? d.toISOString() : '', creditPeriodDays: Number(c[I.period] || 30),
        code: I.code >= 0 ? c[I.code] : '', phone: I.phone >= 0 ? c[I.phone] : '', invoiceNo: I.inv >= 0 ? c[I.inv] : '',
      };
    });
  }, [text]);

  async function go() {
    setBusy(true);
    setErr('');
    try {
      const r = await api('/api/customers/import', { method: 'POST', body: { rows } });
      toast(`Imported ${r.inserted} customers`);
      setText('');
      onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import customers (paste from Excel / CSV)" wide
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!rows.length || busy} onClick={go}>{busy ? 'Importing…' : `Import ${rows.length} rows`}</button></>}>
      <p className="mb-2 text-sm text-slate-400">First row must be headers. Needed columns: <b className="text-slate-200">name, amount, creditStartDate, creditPeriodDays</b>. Optional: code, phone, invoiceNo. Dates as yyyy-mm-dd or dd/mm/yyyy. You can copy cells straight from Excel.</p>
      <textarea className="input num min-h-[200px] text-xs" value={text} onChange={(e) => setText(e.target.value)}
        placeholder={'name,amount,creditStartDate,creditPeriodDays,invoiceNo\nLanka Freight Ltd,1250000,2026-08-01,30,INV-1001\nHarbour Line Traders,480000,15/08/2026,45,INV-1002'} />
      {rows.length > 0 && (
        <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-white/[0.06]">
          <table className="tbl text-xs"><thead><tr><th>Name</th><th>Amount</th><th>Start</th><th>Period</th></tr></thead>
            <tbody>{rows.slice(0, 50).map((r, i) => <tr key={i}><td>{r.name || <span className="text-rose-300">missing</span>}</td><td className="num">{isFinite(r.amount) ? short(r.amount) : <span className="text-rose-300">bad</span>}</td><td>{r.creditStartDate ? fmtDate(r.creditStartDate) : <span className="text-rose-300">bad date</span>}</td><td>{r.creditPeriodDays}d</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {err && <div className="mt-3 text-sm font-medium text-rose-300">{err}</div>}
    </Modal>
  );
}

export default function Customers() {
  const me = useMe();
  const isCeo = me.user.role === 'ceo';
  const currency = me.settings.currency;
  const { data, reload } = useLive('/api/customers', 30000);
  const [form, setForm] = useState(null); // null | 'new' | customer
  const [imp, setImp] = useState(false);
  const [master, setMaster] = useState(false);
  const [open, setOpen] = useState(null);

  const V = useMemo(() => {
    if (!data) return null;
    const bs = buckets(me.settings.agingBuckets, me.settings.agingBasis);
    const rows = data.customers.map((c0) => {
      const g = c0.group;
      const c = enrich({ ...c0, group: g?._id || null });
      const act = g?.status === 'active';
      return { ...c, raw: c0, bucket: bucketOf(c, bs).label, groupId: act ? String(g._id) : '', groupName: act ? g.name : '', groupColor: g?.color, collectors: act ? g.assignees.map((a) => a.name).join(', ') : '' };
    });
    const companies = [...new Set(rows.map((r) => r.company).filter(Boolean))].sort();
    const groups = [...new Map(data.customers.filter((c) => c.group?.status === 'active').map((c) => [String(c.group._id), { _id: String(c.group._id), name: c.group.name }])).values()];
    const t = rows.reduce((a, c) => ({ ar: a.ar + c.amount, bal: a.bal + c.balance, od: a.od + c.overdueAmt }), { ar: 0, bal: 0, od: 0 });
    return { rows, groups, bs, t, companies };
  }, [data, me.settings]);

  async function del(c) {
    if (!confirm(`Delete ${c.name} and all its collection records? This cannot be undone.`)) return;
    try { await api(`/api/customers/${c._id}`, { method: 'DELETE' }); toast('Customer deleted'); reload(); } catch (e) { toast(e.message, 'err'); }
  }

  if (!V) return <PageLoader />;
  return (
    <div>
      <PageHeader title="Customers" subtitle="Enter each customer's AR value, credit start date and credit period. Due date is calculated automatically.">
        {isCeo && <button className="btn btn-ghost" onClick={() => setMaster(true)}><Sheet className="h-4 w-4" />Import AR master (Excel)</button>}
        <button className="btn btn-ghost" onClick={() => setImp(true)}><Upload className="h-4 w-4" />Paste list</button>
        <button className="btn btn-primary" onClick={() => setForm('new')}><Plus className="h-4 w-4" />Add customer</button>
      </PageHeader>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[['Customers', V.rows.length, 'text-white', false], ['Balance due', V.t.bal, 'text-rose-300', true], ['Overdue', V.t.od, 'text-amber-300', true]].map(([l, v, c, m]) => (
          <Card key={l} className="p-4"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{l}</div><div className={`num mt-1 text-xl font-bold sm:text-2xl ${c}`}>{m ? short(v) : v}</div></Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        {!V.rows.length ? (
          <div className="flex flex-col items-center py-16 text-center">
            <FileSpreadsheet className="mb-3 h-10 w-10 text-slate-500" />
            <div className="font-semibold text-white">No customers yet</div>
            <div className="mt-1 text-sm text-slate-400">Add them one by one or paste a list from Excel.</div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">{isCeo && <button className="btn btn-ghost" onClick={() => setMaster(true)}>Import AR master (Excel)</button>}<button className="btn btn-ghost" onClick={() => setImp(true)}>Paste list</button><button className="btn btn-primary" onClick={() => setForm('new')}>Add customer</button></div>
          </div>
        ) : (
          <CustomerTable rows={V.rows} companyOptions={V.companies} bucketOptions={V.bs.map((b) => b.label)} groupOptions={V.groups} onOpen={(c) => setOpen(c._id)} currency={currency}
            actions={(c) => (
              <div className="flex gap-1">
                <button className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" onClick={() => setForm(c.raw)} title="Edit"><Pencil className="h-4 w-4" /></button>
                {isCeo && <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300" onClick={() => del(c)} title="Delete"><Trash2 className="h-4 w-4" /></button>}
              </div>
            )} />
        )}
      </Card>
      {form && <CustomerForm open initial={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={reload} currency={currency} />}
      <MasterImport open={master} onClose={() => setMaster(false)} onDone={reload} existing={V.rows.length} />
      <ImportModal open={imp} onClose={() => setImp(false)} onDone={reload} />
      <CustomerDrawer id={open} open={!!open} onClose={() => setOpen(null)} onChanged={reload} canCollect={isCeo} canDelete={isCeo} currency={currency} />
    </div>
  );
}
