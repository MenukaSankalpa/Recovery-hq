import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { assertCustomerAccess } from '@/lib/access';
import { toDate, num, round2 } from '@/lib/util';
import { Customer, Collection } from '@/models';
import { recomputePromises, openPromisedFor } from '@/lib/promises';
import { invoiceStatus } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const { user } = await requireAuth();
  const p = new URL(req.url).searchParams;
  const q = {};
  if (p.get('from') || p.get('to')) {
    q.date = {};
    if (p.get('from')) q.date.$gte = new Date(p.get('from'));
    if (p.get('to')) q.date.$lte = new Date(p.get('to'));
  }
  if (p.get('group')) q.group = p.get('group');
  if (p.get('customer')) q.customer = p.get('customer');
  if (user.role !== 'ceo') q.user = user._id;
  else if (p.get('user')) q.user = p.get('user');
  const entries = await Collection.find(q)
    .populate('user', 'name')
    .populate('customer', 'name')
    .populate('group', 'name')
    .sort({ date: -1 })
    .limit(Number(p.get('limit') || 500))
    .lean();
  return json({ entries });
});

/**
 * Record a collection attempt.
 *  type=payment    -> amount > 0 (full or partial; many partials allowed until the balance is 0)
 *  type=no_payment -> reason required, optional promiseDate
 */
export const POST = handle(async (req) => {
  const { user } = await requireAuth({ perm: 'collect', touch: true });
  const b = await readBody(req);
  const c = await Customer.findById(b.customerId);
  if (!c) throw new HttpError(404, 'Customer not found');
  if (user.role !== 'ceo') {
    // staff (even data-entry staff) may only collect from customers assigned to them
    await assertCustomerAccess({ ...user, canEnter: false }, c);
  }
  const type = ['no_payment', 'promise'].includes(b.type) ? b.type : 'payment';
  const date = b.date ? toDate(b.date) : new Date();
  if (date.getTime() > Date.now() + 5 * 60000) throw new HttpError(400, 'Date cannot be in the future');

  const entry = { customer: c._id, group: c.group || null, user: user._id, type, date, note: b.note || '' };
  let allocs = [];
  if (type === 'payment') {
    // optional: split the payment by invoice, e.g. [{ ref: 'INV-1', amount: 50 }] (part payments allowed)
    if (Array.isArray(b.allocations) && b.allocations.some((a) => Number(a.amount) > 0)) {
      if (!c.invoices?.length) throw new HttpError(400, 'This customer has no invoice lines');
      const open = Object.fromEntries(invoiceStatus(c.toObject()).rows.map((r) => [r.ref, r.open]));
      const seen = new Set();
      for (const a of b.allocations) {
        const amt = num(a.amount, `amount for ${a.ref}`);
        if (amt <= 0) continue;
        const ref = String(a.ref);
        if (seen.has(ref)) throw new HttpError(400, `Invoice ${ref} is listed twice`);
        seen.add(ref);
        if (!c.invoices.some((x) => x.ref === ref && x.amount > 0)) throw new HttpError(400, `Invoice ${ref} does not belong to this customer`);
        if (amt > (open[ref] || 0) + 0.001) throw new HttpError(400, `Invoice ${ref} has only ${(open[ref] || 0).toLocaleString()} open`);
        allocs.push({ ref, amount: amt });
      }
    }
    const amount = allocs.length ? round2(allocs.reduce((s, a) => s + a.amount, 0)) : num(b.amount, 'amount');
    if (amount <= 0) throw new HttpError(400, 'Amount must be more than 0');
    const balance = round2(c.amount - c.paidAmount);
    if (amount > balance + 0.001) throw new HttpError(400, `Amount is more than the balance due (${balance.toLocaleString()})`);
    entry.amount = amount;
    if (allocs.length) entry.allocations = allocs;
    entry.method = b.method || 'Cash';
    entry.reference = b.reference || '';
  } else if (type === 'promise') {
    const amount = num(b.amount, 'amount');
    if (amount <= 0) throw new HttpError(400, 'Promised amount must be more than 0');
    if (!b.promiseDate) throw new HttpError(400, 'Pick the date the customer will pay');
    const pd = toDate(b.promiseDate, 'promise date');
    const today = new Date(Date.now() - 86400000);
    if (pd < today) throw new HttpError(400, 'Promise date cannot be in the past');
    const free = round2(c.amount - c.paidAmount - (await openPromisedFor(c._id)));
    if (amount > free + 0.001) throw new HttpError(400, `Only ${Math.max(0, free).toLocaleString()} is left that is not already promised`);
    Object.assign(entry, { amount, promiseDate: pd, status: 'open', fulfilled: 0, reason: String(b.reason || '').trim() });
  } else {
    if (!b.reason || !String(b.reason).trim()) throw new HttpError(400, 'Please give the reason it was not collected');
    entry.reason = String(b.reason).trim();
    if (b.promiseDate) entry.promiseDate = toDate(b.promiseDate, 'promise date');
  }

  const doc = await Collection.create(entry);
  c.lastActivityAt = new Date();
  c.lastOutcome = type;
  if (type === 'payment') {
    c.paidAmount = round2((c.paidAmount || 0) + entry.amount);
    c.lastPaymentAt = date;
    for (const a of allocs) {
      const inv = c.invoices.find((x) => x.ref === a.ref && x.amount > 0);
      inv.paid = round2((inv.paid || 0) + a.amount);
    }
  }
  await c.save();
  const updated = c.toObject();
  if (type === 'payment') await recomputePromises(c._id);
  return json({ entry: doc, customer: updated }, 201);
});
