import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { addDays, round2 } from '@/lib/util';
import { Customer, Group, Collection } from '@/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * AR master import (CEO).
 * body: {
 *   rows: [{ company, code, name, ref, date, creditPeriodDays, amount, collected }],
 *   replace: true           -> removes ALL existing customers, groups and collection records first (users are kept)
 *   collectedDate: ISO      -> date used for rows marked "already collected"
 * }
 * Invoice lines are grouped into one customer per company + customer name.
 */
export const POST = handle(async (req) => {
  const { user } = await requireAuth({ roles: ['ceo'], touch: true });
  const { rows, replace, collectedDate } = await readBody(req);
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'No rows to import');
  if (rows.length > 20000) throw new HttpError(400, 'Max 20,000 lines per import');

  const custs = new Map();
  const errors = [];
  rows.forEach((r, i) => {
    const name = String(r.name || '').trim();
    const amount = Number(r.amount);
    const date = new Date(r.date);
    if (!name) return errors.push(`Line ${i + 1}: missing customer name`);
    if (!isFinite(amount)) return errors.push(`Line ${i + 1}: bad amount`);
    if (!r.date || isNaN(date)) return errors.push(`Line ${i + 1} (${name}): bad invoice date`);
    const company = String(r.company || '').trim().toUpperCase();
    const key = `${company}|${name.toUpperCase()}`;
    const cp = Math.max(0, Math.round(Number(r.creditPeriodDays) || 0));
    if (!custs.has(key)) custs.set(key, { company, name, code: String(r.code || '').trim(), creditPeriodDays: cp, invoices: [], collected: 0 });
    const c = custs.get(key);
    if (!c.code && r.code) c.code = String(r.code).trim();
    c.invoices.push({ ref: String(r.ref || '').trim(), date, creditPeriodDays: cp, dueDate: addDays(date, cp), amount: round2(amount), note: r.collected ? 'Already collected (per import file)' : '' });
    if (r.collected && amount > 0) c.collected += amount;
  });
  if (errors.length) throw new HttpError(400, errors.slice(0, 8).join(' · ') + (errors.length > 8 ? ` · …and ${errors.length - 8} more` : ''));

  if (replace) {
    await Promise.all([Collection.deleteMany({}), Group.deleteMany({}), Customer.deleteMany({})]);
  }

  const docs = [...custs.values()].map((c) => {
    const inv = c.invoices.sort((a, b) => a.date - b.date);
    const net = round2(inv.reduce((s, x) => s + x.amount, 0));
    const pos = inv.filter((x) => x.amount > 0);
    const first = pos[0] || inv[0];
    const earliestDue = pos.length ? pos.reduce((m, x) => (x.dueDate < m ? x.dueDate : m), pos[0].dueDate) : first.dueDate;
    return {
      name: c.name,
      company: c.company,
      code: c.code,
      invoiceNo: inv.length === 1 ? inv[0].ref : `${inv.length} invoices`,
      amount: Math.max(0, net),
      creditStartDate: first.date,
      creditPeriodDays: c.creditPeriodDays,
      dueDate: earliestDue,
      paidAmount: 0,
      creditBalance: net < 0 ? -net : 0,
      invoices: inv,
      notes: net < 0 ? `Credit balance ${net.toLocaleString()} in file` : '',
      createdBy: user._id,
      _collected: Math.min(Math.max(0, net), round2(c.collected)),
    };
  });

  const inserted = await Customer.insertMany(docs.map(({ _collected, ...d }) => d));
  // rows marked "already collected" become payment records so the totals still reconcile
  const when = collectedDate ? new Date(collectedDate) : new Date();
  const pays = [];
  inserted.forEach((c, i) => {
    const amt = docs[i]._collected;
    if (amt > 0) pays.push({ customer: c._id, user: user._id, type: 'payment', amount: amt, method: 'Import', note: 'Marked "already collected" in AR master file', date: when });
  });
  if (pays.length) {
    await Collection.insertMany(pays);
    await Promise.all(pays.map((p) => Customer.updateOne({ _id: p.customer }, { $set: { paidAmount: p.amount, lastPaymentAt: when, lastActivityAt: when, lastOutcome: 'payment' } })));
  }

  const total = docs.reduce((s, d) => s + d.amount, 0);
  const credit = docs.reduce((s, d) => s + d.creditBalance, 0);
  return json({
    customers: inserted.length,
    invoices: rows.length,
    total: round2(total),
    credit: round2(credit),
    net: round2(total - credit),
    creditCustomers: docs.filter((d) => d.creditBalance > 0).length,
    collected: round2(pays.reduce((s, p) => s + p.amount, 0)),
    companies: [...new Set(docs.map((d) => d.company))].filter(Boolean).length,
    replaced: !!replace,
  }, 201);
});
