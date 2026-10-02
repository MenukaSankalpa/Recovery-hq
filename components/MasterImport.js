'use client';
import { useMemo, useState } from 'react';
import { FileSpreadsheet, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Modal, Field, Spinner, Badge, toast, cx } from './ui';
import { api } from '@/lib/client';
import { short, money, toInputDate, dayStartISO, fmtDate } from '@/lib/format';

const FIELDS = [
  { key: 'company', label: 'Company', re: [/^company$/i, /^branch/i, /company/i] },
  { key: 'code', label: 'Customer code', re: [/customer\s*code/i, /cust.*code/i, /^code$/i] },
  { key: 'name', label: 'Customer name *', re: [/customer\s*name/i, /business\s*partner/i, /^customer$/i, /^name$/i] },
  { key: 'ref', label: 'Invoice / reference no.', re: [/reference/i, /^invoice$/i, /^ref/i, /inv.*no/i] },
  { key: 'date', label: 'Invoice date *', re: [/inv.*date/i, /^date$/i, /document\s*date/i, /date/i] },
  { key: 'credit', label: 'Credit period (days)', re: [/credit\s*period/i, /credit/i, /terms/i] },
  { key: 'amount', label: 'Amount (balance due) *', re: [/^amount$/i, /^balance$/i, /^open$/i, /amount/i, /balance/i] },
  { key: 'status', label: 'Status / remarks (e.g. “Already collected”)', re: [/status/i, /remark/i, /comment/i] },
];

function excelDate(v) {
  if (v instanceof Date && !isNaN(v)) return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    // Excel text dates are usually month/day; switch when that is impossible
    const [mo, d] = a > 12 ? [b, a] : [a, b];
    return new Date(y, mo - 1, d);
  }
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toNum(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[\s ,]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!s || s === '-') return NaN;
  return Number(s.replace(/[^0-9.\-]/g, ''));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** finds "as of 20th Sep 2026" / "as of 9/20/2026" in the top rows of the sheet */
function guessAsOf(data) {
  for (const r of data.slice(0, 15)) {
    for (const c of r || []) {
      const t = String(c ?? '');
      let m = t.match(/as\s*of\s*\[?(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,})[\s,-]+(\d{4})/i);
      if (m && MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) >= 0) return new Date(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1]);
      m = t.match(/as\s*of\s*\[?(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
      if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    }
  }
  return null;
}

function guessHeader(data) {
  for (let i = 0; i < Math.min(25, data.length); i++) {
    const r = data[i] || [];
    if (r.some((c) => /customer\s*name|business\s*partner/i.test(String(c || '')))) return i;
  }
  return 0;
}

function guessMap(head, data, hi) {
  const map = {};
  const used = new Set();
  FIELDS.forEach((f) => {
    for (const re of f.re) {
      const i = head.findIndex((h, idx) => !used.has(idx) && h && re.test(String(h).trim()));
      if (i >= 0) { map[f.key] = i; used.add(i); return; }
    }
    map[f.key] = -1;
  });
  if (map.status < 0) {
    // a column without a header that says "collected" somewhere
    const width = Math.max(...data.slice(hi, hi + 3000).map((r) => r.length));
    for (let c = 0; c < width; c++) {
      if (used.has(c)) continue;
      if (data.slice(hi + 1).some((r) => /collect/i.test(String(r[c] || '')))) { map.status = c; break; }
    }
  }
  return map;
}

export default function MasterImport({ open, onClose, onDone, existing = 0 }) {
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [sheet, setSheet] = useState('');
  const [data, setData] = useState(null);
  const [hi, setHi] = useState(0);
  const [map, setMap] = useState({});
  const [defCompany, setDefCompany] = useState('');
  const [defCredit, setDefCredit] = useState(30);
  const [collectedMode, setCollectedMode] = useState('record');
  const [collectedDate, setCollectedDate] = useState(toInputDate());
  const [replace, setReplace] = useState(true);
  const [skipBad, setSkipBad] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function loadSheet(f, name) {
    const readXlsxFile = (await import('read-excel-file')).default;
    const rows = await readXlsxFile(f, { sheet: name });
    const h = guessHeader(rows);
    setData(rows);
    setHi(h);
    setMap(guessMap(rows[h] || [], rows, h));
    setSheet(name);
    const asOf = guessAsOf(rows);
    if (asOf) setCollectedDate(toInputDate(asOf));
  }

  async function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setResult(null);
    try {
      const readXlsxFile = (await import('read-excel-file')).default;
      const names = (await readXlsxFile(f, { getSheets: true })).map((s) => s.name);
      setFile(f);
      setSheets(names);
      const best = names.find((n) => /master/i.test(n)) || names[0];
      await loadSheet(f, best);
    } catch (x) {
      toast('Could not read this file: ' + x.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  const head = data?.[hi] || [];
  const P = useMemo(() => {
    if (!data) return null;
    const out = [];
    const bad = [];
    let fileTotal = null;
    data.slice(hi + 1).forEach((r, i) => {
      const line = hi + i + 2;
      const get = (k) => (map[k] >= 0 ? r[map[k]] : null);
      const name = String(get('name') ?? '').trim();
      const amount = toNum(get('amount'));
      if (!name) {
        if (isFinite(amount) && amount !== 0 && fileTotal == null) fileTotal = amount;
        return;
      }
      if (/customer\s*name/i.test(name)) return;
      const date = excelDate(get('date'));
      const status = String(get('status') ?? '').trim();
      const company = String(get('company') ?? '').trim() || defCompany.trim();
      const credit = map.credit >= 0 ? toNum(get('credit')) : Number(defCredit);
      const row = { line, company, code: String(get('code') ?? '').trim(), name, ref: String(get('ref') ?? '').trim(), date, creditPeriodDays: isFinite(credit) ? credit : Number(defCredit), amount, collected: /collect/i.test(status) };
      if (!date || !isFinite(amount)) bad.push({ ...row, why: !date ? 'bad date' : 'bad amount' });
      else out.push(row);
    });
    const use = out.filter((r) => !(r.collected && collectedMode === 'skip'));
    const byCo = {};
    const custs = new Set();
    use.forEach((r) => {
      byCo[r.company || '—'] ||= { lines: 0, total: 0, custs: new Set() };
      byCo[r.company || '—'].lines++;
      byCo[r.company || '—'].total += r.amount;
      byCo[r.company || '—'].custs.add(r.name.toUpperCase());
      custs.add(`${r.company}|${r.name.toUpperCase()}`);
    });
    const total = use.reduce((s, r) => s + r.amount, 0);
    const credits = use.filter((r) => r.amount < 0);
    const coll = out.filter((r) => r.collected);
    const totalAll = out.reduce((s, r) => s + r.amount, 0);
    return { rows: use, bad, total, totalAll, fileTotal, credits, coll, custs: custs.size, byCo: Object.entries(byCo).sort((a, b) => b[1].total - a[1].total) };
  }, [data, hi, map, defCompany, defCredit, collectedMode]);

  async function go() {
    if (!P?.rows.length) return;
    if (P.bad.length && !skipBad) return toast('Fix or skip the rows with errors first', 'err');
    if (replace && existing > 0 && !confirm(`This deletes ALL ${existing} current customers, every group and every payment / promise record, then loads ${P.custs} customers from the file. Users and login logs are kept.\n\nContinue?`)) return;
    setBusy(true);
    try {
      const rows = P.rows.map((r) => ({ company: r.company, code: r.code, name: r.name, ref: r.ref, date: r.date.toISOString(), creditPeriodDays: r.creditPeriodDays, amount: r.amount, collected: collectedMode === 'record' && r.collected }));
      const res = await api('/api/import', { method: 'POST', body: { rows, replace, collectedDate: dayStartISO(collectedDate) } });
      setResult(res);
      toast(`Imported ${res.customers} customers (${short(res.total)})`);
      onDone?.();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  const close = () => { setResult(null); onClose(); };
  return (
    <Modal open={open} onClose={close} wide title="Import AR master file (Excel)"
      footer={result ? <button className="btn btn-primary" onClick={close}>Done</button> : <>
        <button className="btn btn-ghost" onClick={close}>Cancel</button>
        <button className="btn btn-primary" disabled={!P?.rows.length || busy} onClick={go}>
          {busy ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}{replace ? 'Replace data & import' : 'Add to existing'} {P ? `(${P.custs} customers)` : ''}
        </button>
      </>}>
      {result ? (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
          <div className="mt-3 text-lg font-bold text-white">Import complete</div>
          <div className="mt-1 text-sm text-slate-400">{result.customers} customers · {result.invoices} invoice lines · {result.companies} companies</div>
          <div className="num mt-2 text-2xl font-bold text-emerald-300">{money(result.total, 'LKR')}</div>
          {result.collected > 0 && <div className="mt-2 text-sm text-slate-400">{money(result.collected, '')} recorded as already collected</div>}
        </div>
      ) : (
        <div className="space-y-5">
          <label className={cx('flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition', file ? 'border-emerald-400/40 bg-emerald-500/[0.04]' : 'border-white/10 hover:border-white/25')}>
            <input type="file" accept=".xlsx" className="hidden" onChange={pick} />
            {busy && !data ? <Spinner /> : <FileSpreadsheet className="h-8 w-8 text-emerald-400" />}
            <div className="mt-2 font-semibold text-white">{file ? file.name : 'Choose the .xlsx file'}</div>
            <div className="text-xs text-slate-400">{file ? 'Click to choose another file' : 'One row per invoice: company, customer, invoice no, date, credit period, amount'}</div>
          </label>

          {data && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Sheet">
                  <select className="input" value={sheet} onChange={(e) => loadSheet(file, e.target.value)}>
                    {sheets.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Header row">
                  <select className="input" value={hi} onChange={(e) => { const h = +e.target.value; setHi(h); setMap(guessMap(data[h] || [], data, h)); }}>
                    {data.slice(0, 25).map((r, i) => <option key={i} value={i}>Row {i + 1}: {r.filter(Boolean).slice(0, 3).join(' | ').slice(0, 50) || '(empty)'}</option>)}
                  </select>
                </Field>
                <Field label="Default credit period" hint="Used when there is no credit column">
                  <input className="input num" type="number" min="0" value={defCredit} onChange={(e) => setDefCredit(e.target.value)} />
                </Field>
              </div>

              <div>
                <div className="label">Column mapping — check each field points to the right column</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <span className="w-40 shrink-0 text-xs font-semibold text-slate-300">{f.label}</span>
                      <select className={cx('input !py-1.5 text-xs', map[f.key] < 0 && /\*/.test(f.label) && '!border-rose-500/50')} value={map[f.key] ?? -1} onChange={(e) => setMap({ ...map, [f.key]: +e.target.value })}>
                        <option value={-1}>— not in file —</option>
                        {head.map((h, i) => <option key={i} value={i}>{String.fromCharCode(65 + (i % 26))}: {String(h ?? '(no header)').slice(0, 30)}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {map.company < 0 && (
                  <Field label="Company code for every row (no company column)" className="mt-2">
                    <input className="input" placeholder="e.g. CLL" value={defCompany} onChange={(e) => setDefCompany(e.target.value.toUpperCase())} />
                  </Field>
                )}
              </div>

              {P && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[['Invoice lines', P.rows.length], ['Customers', P.custs], ['Companies', P.byCo.length], ['Total AR', short(P.total)]].map(([l, v]) => (
                      <div key={l} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="text-[11px] uppercase tracking-wider text-slate-500">{l}</div><div className="num mt-1 text-xl font-bold text-white">{v}</div></div>
                    ))}
                  </div>
                  {P.fileTotal != null && (
                    <div className={cx('flex items-center gap-2 rounded-xl p-3 text-sm', Math.abs(P.fileTotal - P.totalAll) < 1 ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-400/10 text-amber-100')}>
                      <CheckCircle2 className="h-4 w-4 shrink-0" />File total row: <b className="num">{money(P.fileTotal, '')}</b> · Lines read: <b className="num">{money(P.totalAll, '')}</b> {Math.abs(P.fileTotal - P.totalAll) < 1 ? '✓ matches' : '— check the mapping'}
                    </div>
                  )}

                  <div className="max-h-56 overflow-auto rounded-xl border border-white/[0.06]">
                    <table className="tbl text-xs">
                      <thead><tr><th>Company</th><th>Customers</th><th>Lines</th><th>Total</th></tr></thead>
                      <tbody>{P.byCo.map(([co, v]) => <tr key={co}><td className="font-bold text-white">{co}</td><td className="num">{v.custs.size}</td><td className="num">{v.lines}</td><td className="num">{money(v.total, '')}</td></tr>)}</tbody>
                    </table>
                  </div>

                  <div className="space-y-2 text-sm">
                    {P.credits.length > 0 && <div className="rounded-xl bg-white/[0.03] p-3 text-slate-300"><b className="text-white">{P.credits.length}</b> negative lines (credit notes / unapplied payments, {money(P.credits.reduce((s, r) => s + r.amount, 0), '')}) will be set off against the same customer&apos;s oldest invoices.</div>}
                    {P.coll.length > 0 && (
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-slate-300"><b className="text-white">{P.coll.length}</b> line(s) marked “collected” ({money(P.coll.reduce((s, r) => s + r.amount, 0), '')}): {P.coll.slice(0, 3).map((r) => r.name).join(', ')}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select className="input !w-auto !py-1.5 text-xs" value={collectedMode} onChange={(e) => setCollectedMode(e.target.value)}>
                            <option value="record">Import & record as collected on</option>
                            <option value="skip">Skip these lines</option>
                            <option value="open">Import as still due</option>
                          </select>
                          {collectedMode === 'record' && <input type="date" className="input !w-auto !py-1.5 text-xs" value={collectedDate} onChange={(e) => setCollectedDate(e.target.value)} />}
                        </div>
                      </div>
                    )}
                    {P.bad.length > 0 && (
                      <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-3 text-rose-100">
                        <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{P.bad.length} line(s) can&apos;t be read</div>
                        <div className="mt-1 text-xs">{P.bad.slice(0, 5).map((r) => `Row ${r.line} ${r.name}: ${r.why}`).join(' · ')}</div>
                        <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={skipBad} onChange={(e) => setSkipBad(e.target.checked)} />Skip them and import the rest</label>
                      </div>
                    )}
                  </div>

                  <label className={cx('flex items-start gap-3 rounded-xl border p-3', replace ? 'border-rose-500/30 bg-rose-500/[0.06]' : 'border-white/10')}>
                    <input type="checkbox" className="mt-1" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                    <span className="text-sm">
                      <b className="text-white">Remove old data first</b>
                      <span className="block text-xs text-slate-400">Deletes all {existing} existing customers, groups, payments and promises (demo data included). Users and login logs are kept. Untick to add on top.</span>
                    </span>
                  </label>
                  <div className="text-xs text-slate-500">Preview of first lines: {P.rows.slice(0, 3).map((r) => `${r.company} · ${r.name} · ${r.ref} · ${fmtDate(r.date)} · ${r.creditPeriodDays}d · ${short(r.amount)}`).join('  |  ')}</div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
