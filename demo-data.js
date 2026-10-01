// Demo data for Recovery HQ
//   node demo-data.js add      -> adds demo customers, groups, payments
//   node demo-data.js delete   -> removes ONLY the demo records (real data is untouched)
const fs = require('fs');
const mongoose = require('mongoose');

const env = {};
fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach((l) => {
  const i = l.indexOf('=');
  if (i > 0 && !l.trim().startsWith('#')) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const DAY = 86400000;
const today = new Date(); today.setHours(0, 0, 0, 0);
const daysAgo = (n) => new Date(today.getTime() - n * DAY);
const at = (n, hour, min = 0) => { // n days ago at hh:mm, never in the future
  const d = new Date(daysAgo(n).getTime() + (hour * 60 + min) * 60000);
  return d > new Date() ? new Date(Date.now() - (n + 1) * 7 * 60000) : d;
};

// name, AR amount, credit started (days ago), credit period days, phone, contact
const CUSTOMERS = [
  ['Lanka Freight Ltd',       1250000, 75, 30, '0771234501', 'Mr. Perera'],
  ['Harbour Line Traders',     980000, 60, 30, '0771234502', 'Ms. Silva'],
  ['Colombo Cargo Hub',       3200000, 40, 45, '0771234503', 'Mr. Fernando'],
  ['Galle Marine Supplies',    450000, 95, 60, '0771234504', 'Mr. Jayasinghe'],
  ['Kandy Agro Exports',      2100000, 20, 30, '0771234505', 'Mrs. Bandara'],
  ['Seaview Logistics',        760000, 50, 15, '0771234506', 'Mr. Wickrama'],
  ['Negombo Fisheries',        320000, 130, 30, '0771234507', 'Mr. Costa'],
  ['Island Tea Holdings',     4500000, 35, 60, '0771234508', 'Ms. Herath'],
  ['Blue Ocean Imports',      1800000, 110, 45, '0771234509', 'Mr. Rajapakse'],
  ['Ceylon Spice Co',          560000, 10, 30, '0771234510', 'Mrs. Dias'],
  ['Trinco Port Services',    2750000, 70, 30, '0771234511', 'Mr. Kumar'],
  ['Matara Hardware',          210000, 45, 15, '0771234512', 'Mr. Gunawardena'],
  ['Western Textiles',        1340000, 25, 45, '0771234513', 'Ms. Fonseka'],
  ['Jaffna Motors',            890000, 150, 60, '0771234514', 'Mr. Siva'],
  ['Sunrise Pharma',          1560000, 5, 30, '0771234515', 'Dr. Mendis'],
  ['Delta Construction',      3900000, 100, 90, '0771234516', 'Mr. Weerasinghe'],
  ['Pearl Hotels Group',      2450000, 55, 30, '0771234517', 'Ms. Amarasinghe'],
  ['Ruhuna Rice Mills',        670000, 85, 30, '0771234518', 'Mr. Samarakoon'],
  ['Metro Electricals',        430000, 15, 15, '0771234519', 'Mr. Nanayakkara'],
  ['Hill Country Dairies',    1120000, 65, 45, '0771234520', 'Mrs. Rathnayake'],
];

// group name, customer indexes, assignee usernames, started (days ago), length days, colour
const GROUPS = [
  ['Colombo Overdue Sweep', [0, 1, 2, 5, 16], ['ruwan', 'nimali'], 4, 8, '#10b981'],
  ['Southern Region',       [3, 6, 11, 17],   ['kasun'],           10, 9, '#f59e0b'],
  ['Top Big Balances',      [7, 8, 10, 15],   ['dilani', 'suresh'], 2, 14, '#6366f1'],
];

// customer index, collector username, days ago, hour, amount (0 = not collected), method or reason, promise days ahead
const ENTRIES = [
  [0, 'ruwan', 3, 10, 300000, 'Cash'],
  [0, 'ruwan', 1, 11, 200000, 'Cash'],
  [0, 'nimali', 0, 9, 200000, 'Cheque'],
  [1, 'nimali', 2, 14, 0, 'Owner not available', 1],
  [1, 'nimali', 0, 10, 480000, 'Bank transfer'],
  [2, 'ruwan', 3, 15, 800000, 'Cheque'],
  [2, 'ruwan', 0, 9, 0, 'Cheque not ready', 2],
  [5, 'nimali', 1, 16, 760000, 'Cash'],
  [16, 'ruwan', 2, 12, 0, 'Disputing invoice', 3],
  [3, 'kasun', 8, 11, 150000, 'Cash'],
  [3, 'kasun', 5, 10, 100000, 'Cash'],
  [6, 'kasun', 6, 13, 0, 'Shop closed', 0],
  [11, 'kasun', 4, 9, 210000, 'Cash'],
  [17, 'kasun', 2, 15, 200000, 'Cheque'],
  [7, 'dilani', 1, 10, 1500000, 'Bank transfer'],
  [7, 'suresh', 0, 8, 500000, 'Cheque'],
  [8, 'suresh', 1, 14, 0, 'Asked to come next week', 5],
  [10, 'dilani', 0, 9, 750000, 'Cash'],
  [15, 'suresh', 0, 8, 0, 'Owner overseas', 4],
];

async function remove(db) {
  const r = await Promise.all([
    db.collection('collections').deleteMany({ demo: true }),
    db.collection('groups').deleteMany({ demo: true }),
    db.collection('customers').deleteMany({ demo: true }),
  ]);
  console.log(`🗑  Removed demo data: ${r[2].deletedCount} customers, ${r[1].deletedCount} groups, ${r[0].deletedCount} entries`);
}

async function add(db) {
  if (await db.collection('customers').countDocuments({ demo: true })) {
    console.log('Demo data already exists. Run "node demo-data.js delete" first.');
    return;
  }
  const users = await db.collection('users').find().toArray();
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  const ceo = users.find((u) => u.role === 'ceo');
  const missing = ['ruwan', 'nimali', 'kasun', 'dilani', 'suresh'].filter((u) => !byName[u]);
  if (missing.length) {
    console.log('❌ Missing users:', missing.join(', '), '— run "node add-users.js" first.');
    return;
  }
  const now = new Date();

  // customers
  const custDocs = CUSTOMERS.map(([name, amount, startAgo, period, phone, contact], i) => {
    const creditStartDate = daysAgo(startAgo);
    return {
      name, code: `D${String(i + 1).padStart(3, '0')}`, phone, contactPerson: contact, address: '', invoiceNo: `INV-D${1001 + i}`,
      amount, creditStartDate, creditPeriodDays: period, dueDate: new Date(creditStartDate.getTime() + period * DAY),
      paidAmount: 0, lastOutcome: '', group: null, notes: 'Demo customer', createdBy: ceo?._id,
      demo: true, createdAt: now, updatedAt: now, __v: 0,
    };
  });
  const ins = await db.collection('customers').insertMany(custDocs);
  const custIds = Object.values(ins.insertedIds);

  // groups
  const groupOf = {};
  for (const [name, idx, who, startAgo, len, color] of GROUPS) {
    const startDate = daysAgo(startAgo);
    const endDate = new Date(startDate.getTime() + len * DAY - 1);
    const g = await db.collection('groups').insertOne({
      name, customers: idx.map((i) => custIds[i]), assignees: who.map((u) => byName[u]._id),
      startDate, endDate, status: 'active', color, notes: '', createdBy: ceo?._id, demo: true, createdAt: now, updatedAt: now, __v: 0,
    });
    idx.forEach((i) => (groupOf[i] = g.insertedId));
    await db.collection('customers').updateMany({ _id: { $in: idx.map((i) => custIds[i]) } }, { $set: { group: g.insertedId } });
  }

  // payments + not-collected visits
  const paid = {};
  const last = {};
  const docs = ENTRIES.map(([ci, who, ago, hour, amount, info, promise]) => {
    const date = at(ago, hour, (ci * 7) % 60);
    const base = { customer: custIds[ci], group: groupOf[ci] || null, user: byName[who]._id, date, note: '', demo: true, createdAt: date, updatedAt: date, __v: 0 };
    last[ci] = { date, type: amount ? 'payment' : 'no_payment' };
    if (amount) {
      paid[ci] = (paid[ci] || 0) + amount;
      return { ...base, type: 'payment', amount, method: info, reference: info === 'Cheque' ? `CHQ-${100200 + ci}` : '', reason: '' };
    }
    return { ...base, type: 'no_payment', amount: 0, method: '', reference: '', reason: info, promiseDate: new Date(today.getTime() + (promise || 0) * DAY) };
  });
  await db.collection('collections').insertMany(docs);
  for (const [ci, l] of Object.entries(last)) {
    const set = { lastActivityAt: l.date, lastOutcome: l.type, paidAmount: Math.min(paid[ci] || 0, CUSTOMERS[ci][1]) };
    if (paid[ci]) set.lastPaymentAt = l.date;
    await db.collection('customers').updateOne({ _id: custIds[ci] }, { $set: set });
  }
  console.log(`✅ Added demo data: ${custDocs.length} customers, ${GROUPS.length} groups, ${docs.length} payments/visits`);
  console.log('   Open http://localhost:3000 and sign in as radesh');
}

(async () => {
  const mode = process.argv[2];
  if (!['add', 'delete'].includes(mode)) {
    console.log('Usage:\n  node demo-data.js add\n  node demo-data.js delete');
    process.exit(1);
  }
  await mongoose.connect(env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (mode === 'add') await add(db);
  else await remove(db);
  process.exit(0);
})().catch((e) => { console.log('❌', e.message); process.exit(1); });
