import bcrypt from 'bcryptjs';
import { handle, json, requireAuth, HttpError } from '@/lib/auth';
import { addDays } from '@/lib/util';
import { User, Customer, Group, Collection } from '@/models';

export const dynamic = 'force-dynamic';

// Loads demo data so the CEO can try every screen. Only runs on an empty customer list.
export const POST = handle(async () => {
  const { user: ceo } = await requireAuth({ roles: ['ceo'], touch: true });
  if ((await Customer.countDocuments()) > 0) throw new HttpError(400, 'Demo data can only be loaded when there are no customers');

  const hash = await bcrypt.hash('pass1234', 10);
  const team = [
    ['Ruwan', 'ruwan', 'Team Alpha'],
    ['Nimali', 'nimali', 'Team Bravo'],
    ['Kasun', 'kasun', 'Team Charlie'],
    ['Dilani', 'dilani', 'Team Delta'],
    ['Suresh', 'suresh', 'Team Echo'],
  ];
  const collectors = [];
  for (const [name, username, t] of team) {
    const u = (await User.findOne({ username })) || (await User.create({ name, username, team: t, passwordHash: hash, canCollect: true }));
    collectors.push(u);
  }
  if (!(await User.findOne({ username: 'entry' })))
    await User.create({ name: 'Data Entry', username: 'entry', passwordHash: hash, canEnter: true, canCollect: false, team: 'Accounts' });

  const names = [
    'Lanka Freight Ltd', 'Harbour Line Traders', 'Colombo Cargo Hub', 'Galle Marine Supplies', 'Kandy Agro Exports',
    'Seaview Logistics', 'Negombo Fisheries', 'Island Tea Holdings', 'Blue Ocean Imports', 'Ceylon Spice Co',
    'Trinco Port Services', 'Matara Hardware', 'Western Textiles', 'Jaffna Motors', 'Sunrise Pharma',
    'Delta Construction', 'Pearl Hotels Group', 'Ruhuna Rice Mills', 'Metro Electricals', 'Hill Country Dairies',
    'Coastal Fuel Traders', 'Prime Packaging', 'Emerald Garments', 'Unity Foods',
  ];
  const periods = [15, 30, 45, 60, 90];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const custs = await Customer.insertMany(
    names.map((name, i) => {
      const creditPeriodDays = periods[i % periods.length];
      const creditStartDate = addDays(today, -Math.round(10 + rnd() * 150));
      return {
        name,
        code: `C${String(i + 1).padStart(3, '0')}`,
        phone: `07${Math.floor(10000000 + rnd() * 89999999)}`,
        invoiceNo: `INV-${2400 + i}`,
        amount: Math.round((200000 + rnd() * 4800000) / 1000) * 1000,
        creditStartDate,
        creditPeriodDays,
        dueDate: addDays(creditStartDate, creditPeriodDays),
        createdBy: ceo._id,
      };
    })
  );

  const g1 = await Group.create({
    name: 'Colombo Overdue Sweep', customers: custs.slice(0, 6).map((c) => c._id), assignees: [collectors[0]._id, collectors[1]._id],
    startDate: addDays(today, -4), endDate: addDays(today, 3), color: '#10b981', createdBy: ceo._id,
  });
  const g2 = await Group.create({
    name: 'Southern Region', customers: custs.slice(6, 10).map((c) => c._id), assignees: [collectors[2]._id],
    startDate: addDays(today, -10), endDate: addDays(today, -1), color: '#f59e0b', createdBy: ceo._id,
  });
  const g3 = await Group.create({
    name: 'Top 5 Big Balances', customers: custs.slice(10, 14).map((c) => c._id), assignees: [collectors[3]._id, collectors[4]._id],
    startDate: addDays(today, -2), endDate: addDays(today, 12), color: '#6366f1', createdBy: ceo._id,
  });
  for (const g of [g1, g2, g3]) await Customer.updateMany({ _id: { $in: g.customers } }, { group: g._id });

  // some partial payments + missed visits
  const entries = [];
  const groupsFor = [[g1, 0, 6], [g2, 6, 10], [g3, 10, 14]];
  for (const [g, a, b] of groupsFor) {
    for (let i = a; i < b; i++) {
      const c = custs[i];
      let paid = 0;
      const visits = 1 + Math.floor(rnd() * 3);
      for (let v = 0; v < visits; v++) {
        const who = g.assignees[Math.floor(rnd() * g.assignees.length)];
        let date = new Date(addDays(today, -Math.floor(rnd() * 4)).getTime() + (9 + rnd() * 8) * 3600000);
        if (date > new Date()) date = new Date(Date.now() - Math.floor(rnd() * 3 * 3600000));
        if (rnd() < 0.7) {
          const amt = Math.round((c.amount - paid) * (0.15 + rnd() * 0.35) / 1000) * 1000;
          if (amt <= 0) continue;
          paid += amt;
          entries.push({ customer: c._id, group: g._id, user: who, type: 'payment', amount: amt, method: rnd() < 0.5 ? 'Cash' : 'Cheque', date });
        } else {
          entries.push({ customer: c._id, group: g._id, user: who, type: 'no_payment', reason: ['Owner not available', 'Asked to come next week', 'Cheque not ready', 'Disputing invoice'][Math.floor(rnd() * 4)], promiseDate: addDays(today, Math.floor(rnd() * 3)), date });
        }
      }
      if (paid) await Customer.updateOne({ _id: c._id }, { paidAmount: paid, lastPaymentAt: new Date(), lastActivityAt: new Date(), lastOutcome: 'payment' });
    }
  }
  await Collection.insertMany(entries);
  return json({ ok: true, customers: custs.length, collectors: collectors.length, entries: entries.length });
});
