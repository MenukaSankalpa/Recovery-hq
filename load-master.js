// Creates a NEW clean database and loads the AR master Excel file into it.
//
//   node load-master.js "Master_File_for_200Mn_1.xlsx"              -> database "recovery_live"
//   node load-master.js "Master_File_for_200Mn_1.xlsx" my_db_name   -> other database name
//   node load-master.js "Master_File_for_200Mn_1.xlsx" --clean      -> FULL clean start: deletes every database of this
//        app on the cluster (old recovery_hq, demo data, users, login logs, settings) and loads only the Excel data
//
// Only customer / invoice data is loaded. No users, no demo data.
// Afterwards: put the printed MONGODB_URI into .env.local, run the app, open /setup to create the CEO.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const readXlsxFile = require('read-excel-file/node');
const readline = require('readline');
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()); }); });
const APP_COLLECTIONS = ['customers', 'collections', 'groups', 'sessions', 'settings', 'users'];

const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');
const pos = args.filter((a) => !a.startsWith('--'));
const FILE = pos[0];
const DB = (pos[1] || 'recovery_live').trim();
const SHEET = process.env.SHEET || 'Master File';
const DAY = 86400000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

if (!FILE || !fs.existsSync(FILE)) {
  console.log('❌ Excel file not found.\n   Usage: node load-master.js "C:\\path\\Master_File_for_200Mn_1.xlsx"');
  process.exit(1);
}

// ---- read .env.local and point it at the new database
const env = {};
fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const i = l.indexOf('=');
  if (i > 0 && !l.trim().startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
if (!env.MONGODB_URI || /xxxxx/.test(env.MONGODB_URI)) {
  console.log('❌ Put your real MONGODB_URI in .env.local first.');
  process.exit(1);
}
const u = new URL(env.MONGODB_URI);
u.pathname = '/' + DB;
const URI = u.toString();

// ---- helpers (same rules as the in-app import)
const round2 = (n) => Math.round(n * 100) / 100;
function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * DAY));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    const [mo, d] = a > 12 ? [b, a] : [a, b]; // Excel text dates are month/day
    return new Date(y, mo - 1, d);
  }
  return null;
}
function toNum(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[\s\u00a0,]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!s || s === '-') return NaN;
  return Number(s.replace(/[^0-9.\-]/g, ''));
}
function asOfDate(rows) {
  for (const r of rows.slice(0, 15)) for (const c of r || []) {
    const t = String(c ?? '');
    let m = t.match(/as\s*of\s*\[?(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,})[\s,-]+(\d{4})/i);
    if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return new Date(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1]);
    m = t.match(/as\s*of\s*\[?(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  }
  return new Date(new Date().setHours(0, 0, 0, 0));
}

(async () => {
  // ---- read Excel
  const rows = await readXlsxFile(FILE, { sheet: SHEET });
  const hi = rows.findIndex((r) => (r || []).some((c) => /customer\s*name/i.test(String(c || ''))));
  if (hi < 0) throw new Error(`No "Customer Name" header found in sheet "${SHEET}"`);
  const head = rows[hi].map((h) => String(h ?? '').trim());
  const col = (...res) => { for (const re of res) { const i = head.findIndex((h) => re.test(h)); if (i >= 0) return i; } return -1; };
  const C = {
    company: col(/^company$/i, /company/i), code: col(/customer\s*code/i), name: col(/customer\s*name/i), ref: col(/reference/i, /^invoice$/i),
    date: col(/inv.*date/i, /^date$/i), credit: col(/credit\s*period/i), amount: col(/^amount$/i, /^balance$/i, /amount/i),
  };
  let status = -1;
  for (let c = 0; c < 30 && status < 0; c++) if (!Object.values(C).includes(c) && rows.slice(hi + 1).some((r) => /collect/i.test(String(r[c] || '')))) status = c;
  const missing = ['name', 'date', 'amount'].filter((k) => C[k] < 0);
  if (missing.length) throw new Error('Missing columns: ' + missing.join(', '));
  const asOf = asOfDate(rows);

  const custs = new Map();
  const bad = [];
  let lines = 0, fileTotal = null, readTotal = 0;
  rows.slice(hi + 1).forEach((r, i) => {
    const name = String(r[C.name] ?? '').trim();
    const amount = toNum(r[C.amount]);
    if (!name) { if (isFinite(amount) && amount && fileTotal == null) fileTotal = amount; return; }
    const date = toDate(r[C.date]);
    if (!date || !isFinite(amount)) return bad.push(`row ${hi + i + 2} ${name}`);
    const company = C.company >= 0 ? String(r[C.company] ?? '').trim().toUpperCase() : '';
    const cp = Math.max(0, Math.round(C.credit >= 0 ? toNum(r[C.credit]) || 0 : 30));
    const key = `${company}|${name.toUpperCase()}`;
    if (!custs.has(key)) custs.set(key, { company, name, code: '', creditPeriodDays: cp, invoices: [], collected: 0 });
    const c = custs.get(key);
    if (!c.code && C.code >= 0 && r[C.code]) c.code = String(r[C.code]).trim();
    const collected = status >= 0 && /collect/i.test(String(r[status] || ''));
    c.invoices.push({ ref: C.ref >= 0 ? String(r[C.ref] ?? '').trim() : '', date, creditPeriodDays: cp, dueDate: new Date(date.getTime() + cp * DAY), amount: round2(amount), note: collected ? 'Already collected (per import file)' : '' });
    if (collected && amount > 0) c.collected += amount;
    lines++;
    readTotal += amount;
  });
  if (bad.length) console.log(`⚠  Skipped ${bad.length} unreadable rows: ${bad.slice(0, 5).join(', ')}`);

  // ---- build customer documents
  const now = new Date();
  const docs = [...custs.values()].map((c) => {
    const inv = c.invoices.sort((a, b) => a.date - b.date);
    const net = round2(inv.reduce((s, x) => s + x.amount, 0));
    const pos = inv.filter((x) => x.amount > 0);
    const first = pos[0] || inv[0];
    const due = pos.length ? pos.reduce((m, x) => (x.dueDate < m ? x.dueDate : m), pos[0].dueDate) : first.dueDate;
    const collected = Math.min(Math.max(0, net), round2(c.collected));
    return {
      name: c.name, company: c.company, code: c.code, phone: '', contactPerson: '', address: '',
      invoiceNo: inv.length === 1 ? inv[0].ref : `${inv.length} invoices`,
      amount: Math.max(0, net), creditStartDate: first.date, creditPeriodDays: c.creditPeriodDays, dueDate: due,
      paidAmount: collected, creditBalance: net < 0 ? -net : 0,
      lastPaymentAt: collected ? asOf : undefined, lastActivityAt: collected ? asOf : undefined, lastOutcome: collected ? 'payment' : '',
      group: null, notes: net < 0 ? `Credit balance ${net.toLocaleString()} in file` : '', invoices: inv,
      createdAt: now, updatedAt: now, __v: 0,
    };
  });

  // ---- write to the NEW database
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  if (CLEAN) {
    // find every database on the cluster that belongs to this app
    const admin = mongoose.connection.client.db('admin');
    const { databases } = await admin.command({ listDatabases: 1, nameOnly: true });
    const ours = [];
    for (const { name } of databases) {
      if (['admin', 'local', 'config'].includes(name)) continue;
      const cols = (await mongoose.connection.client.db(name).listCollections().toArray()).map((c) => c.name);
      const looksLikeApp = name.startsWith('recovery') || (cols.includes('customers') && cols.includes('collections'));
      if (looksLikeApp || name === DB) ours.push({ name, cols });
      else console.log(`   (keeping "${name}" — not part of this app)`);
    }
    console.log('\n⚠  CLEAN START — these databases will be DELETED completely (users, logins, settings, demo data, everything):');
    ours.forEach((d) => console.log(`   • ${d.name}  [${d.cols.join(', ') || 'empty'}]`));
    const ok = await ask('\nType YES to delete them and load only the Excel data: ');
    if (ok !== 'YES') { console.log('Cancelled — nothing changed.'); process.exit(0); }
    for (const d of ours) {
      await mongoose.connection.client.db(d.name).dropDatabase();
      console.log(`   🗑  dropped ${d.name}`);
    }
  }

  const existing = await db.collection('customers').countDocuments();
  if (existing) console.log(`ℹ  Database "${DB}" had ${existing} customers — replacing them (users kept; use --clean to remove everything).`);
  await Promise.all(['customers', 'groups', 'collections'].map((n) => db.collection(n).deleteMany({})));
  const ins = await db.collection('customers').insertMany(docs);
  const ids = Object.values(ins.insertedIds);
  const pays = docs.map((d, i) => d.paidAmount > 0 && {
    customer: ids[i], group: null, user: null, type: 'payment', amount: d.paidAmount, method: 'Import',
    reference: '', reason: '', note: 'Marked "already collected" in AR master file', date: asOf, createdAt: now, updatedAt: now, __v: 0,
  }).filter(Boolean);
  if (pays.length) await db.collection('collections').insertMany(pays);
  await db.collection('customers').createIndex({ company: 1, name: 1 });
  await db.collection('customers').createIndex({ group: 1 });
  await db.collection('collections').createIndex({ date: -1 });
  await db.collection('collections').createIndex({ customer: 1, date: -1 });
  const users = await db.collection('users').countDocuments();

  // ---- report
  const ar = docs.reduce((s, d) => s + d.amount, 0);
  const credit = docs.reduce((s, d) => s + d.creditBalance, 0);
  const byCo = {};
  docs.forEach((d) => { byCo[d.company] ||= [0, 0]; byCo[d.company][0]++; byCo[d.company][1] += d.amount - d.creditBalance; });
  console.log(`\n✅ Loaded into database "${DB}"`);
  console.log(`   ${docs.length} customers · ${lines} invoice lines · ${Object.keys(byCo).length} companies`);
  Object.entries(byCo).sort((a, b) => b[1][1] - a[1][1]).forEach(([co, [n, t]]) => console.log(`   ${co.padEnd(6)} ${String(n).padStart(4)} customers  ${t.toLocaleString('en-US', { maximumFractionDigits: 2 }).padStart(16)}`));
  console.log(`   Receivable ${ar.toLocaleString('en-US', { maximumFractionDigits: 2 })} − credit balances ${credit.toLocaleString('en-US', { maximumFractionDigits: 2 })} = ${(ar - credit).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  if (fileTotal != null) console.log(`   File total row ${fileTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${Math.abs(fileTotal - readTotal) < 1 ? '✓ matches' : '✗ CHECK — does not match'}`);
  if (pays.length) console.log(`   ${pays.length} "already collected" line(s) recorded as paid on ${asOf.toDateString()}`);
  console.log(`\n👉 Next steps:`);
  console.log(`   1. In .env.local set:\n      MONGODB_URI=${URI.replace(/:([^@/:]+)@/, ':<your-password>@')}`);
  console.log(`   2. npm run dev`);
  console.log(users ? `   3. Sign in with your existing users (${users} found in this database)` : `   3. Open http://localhost:3000/setup and create the CEO account (setup key = SETUP_KEY in .env.local)`);
  process.exit(0);
})().catch((e) => { console.log('❌', e.message); process.exit(1); });
