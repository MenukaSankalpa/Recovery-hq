// One-time fix for a database that is already loaded and in use.
// Keeps users, groups, payments, promises and login logs. Changes only how totals are stored so they tally with Excel:
//  - customer AR value = signed sum of all its lines (credit customers become negative instead of 0)
//  - the "already collected" import payment is tied to its own invoice
//  - aging default = days since invoice date
//   node fix-figures.js
const fs = require('fs');
const mongoose = require('mongoose');

const uri = fs.readFileSync(require('path').join(__dirname, '.env.local'), 'utf8').match(/MONGODB_URI=(.*)/)[1].trim();
const r2 = (n) => Math.round(n * 100) / 100;
const f2 = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const custs = await db.collection('customers').find({ 'invoices.0': { $exists: true } }).toArray();
  let changed = 0;
  for (const c of custs) {
    const net = r2(c.invoices.reduce((s, x) => s + x.amount, 0));
    const set = {};
    if (Math.abs((c.amount || 0) - net) > 0.001) set.amount = net;
    if (c.creditBalance) set.creditBalance = 0;
    // tie "already collected" lines to their invoice
    let inv = c.invoices;
    if (inv.some((x) => /already collected/i.test(x.note || '') && !(x.paid > 0) && x.amount > 0)) {
      inv = inv.map((x) => (/already collected/i.test(x.note || '') && x.amount > 0 ? { ...x, paid: x.amount } : x));
      set.invoices = inv;
      const refs = inv.filter((x) => /already collected/i.test(x.note || '') && x.amount > 0).map((x) => ({ ref: x.ref, amount: x.amount }));
      await db.collection('collections').updateMany({ customer: c._id, type: 'payment', method: 'Import', allocations: { $exists: false } }, { $set: { allocations: refs } });
    }
    if (Object.keys(set).length) {
      await db.collection('customers').updateOne({ _id: c._id }, { $set: set });
      changed++;
    }
  }
  const st = (await db.collection('settings').findOne({ key: 'app' })) || {};
  await db.collection('settings').updateOne({ key: 'app' }, { $set: {
    agingBasis: 'age',
    companyName: st.companyName || 'Recovery HQ',
    currency: st.currency || 'LKR',
    agingBuckets: Array.isArray(st.agingBuckets) && st.agingBuckets.length ? st.agingBuckets : [30, 60, 90],
  } }, { upsert: true });

  const all = await db.collection('customers').find().toArray();
  const lines = all.flatMap((c) => (c.invoices?.length ? c.invoices : [{ amount: c.amount }]));
  const plus = lines.filter((x) => x.amount > 0), minus = lines.filter((x) => x.amount < 0);
  const paid = all.reduce((s, c) => s + (c.paidAmount || 0), 0);
  console.log(`✅ ${db.databaseName}: ${changed} customers updated (users, groups and payments untouched)\n`);
  console.log('   Type            Count             Total');
  console.log(`   Positive (+) ${String(plus.length).padStart(7)}  ${f2(plus.reduce((s, x) => s + x.amount, 0)).padStart(16)}`);
  console.log(`   Negative (-) ${String(minus.length).padStart(7)}  ${f2(minus.reduce((s, x) => s + x.amount, 0)).padStart(16)}`);
  console.log(`   All amounts  ${String(lines.length).padStart(7)}  ${f2(lines.reduce((s, x) => s + x.amount, 0)).padStart(16)}`);
  console.log(`   Collected in system      ${f2(-paid).padStart(16)}`);
  console.log(`   Outstanding now          ${f2(lines.reduce((s, x) => s + x.amount, 0) - paid).padStart(16)}`);
  process.exit(0);
})().catch((e) => { console.log('❌', e.message); process.exit(1); });
