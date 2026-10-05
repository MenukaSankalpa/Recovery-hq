import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { assertCustomerAccess } from '@/lib/access';
import { invoiceStatus } from '@/lib/metrics';
import { round2 } from '@/lib/util';
import { Customer, Collection } from '@/models';

export const dynamic = 'force-dynamic';

/**
 * Match the customer's own receipts / credit notes (negative lines) to their invoices.
 * Not new money: the customer's balance stays the same, but invoices get closed / reduced
 * so that the invoices add up to what the customer really owes.
 * body: { refs?: ['INV1','INV2'], credits?: ['CP1'] }  -> apply these receipts (default: all) to these invoices in this order (default: oldest due first)
 */
export const POST = handle(async (req, ctx) => {
  const { user } = await requireAuth({ perm: 'collect', touch: true });
  const { id } = await ctx.params;
  const { refs, credits: crRefs } = await readBody(req);
  const c = await Customer.findById(id);
  if (!c) throw new HttpError(404, 'Customer not found');
  if (user.role !== 'ceo') await assertCustomerAccess({ ...user, canEnter: false, canDashboard: false }, c);
  if (!c.invoices?.length) throw new HttpError(400, 'This customer has no invoice lines');

  const st = invoiceStatus(c.toObject());
  const only = Array.isArray(crRefs) && crRefs.length ? new Set(crRefs.map(String)) : null;
  const credits = st.creditRows.filter((r) => r.open < -0.009 && (!only || only.has(r.ref))).sort((a, b) => a.date - b.date).map((r) => ({ ref: r.ref, left: -r.open }));
  if (!credits.length) throw new HttpError(400, 'No receipts or credit notes left to apply');
  let targets = st.rows.filter((r) => r.open > 0.009);
  if (Array.isArray(refs) && refs.length) {
    const order = refs.map(String);
    targets = order.map((ref) => targets.find((r) => r.ref === ref)).filter(Boolean);
    if (!targets.length) throw new HttpError(400, 'None of the chosen invoices are open');
  }
  const used = [];
  const onInv = [];
  for (const t of targets) {
    let need = t.open;
    for (const cr of credits) {
      if (need <= 0.009) break;
      if (cr.left <= 0.009) continue;
      const a = round2(Math.min(need, cr.left));
      cr.left = round2(cr.left - a);
      need = round2(need - a);
      used.push({ ref: cr.ref, amount: a });
      onInv.push({ ref: t.ref, amount: a });
    }
  }
  if (!onInv.length) throw new HttpError(400, 'Nothing to apply');
  const sum = (arr) => Object.values(arr.reduce((m, x) => ((m[x.ref] = { ref: x.ref, amount: round2((m[x.ref]?.amount || 0) + x.amount) }), m), {}));
  const invTotals = sum(onInv);
  const crTotals = sum(used);
  for (const x of invTotals) {
    const inv = c.invoices.find((i) => i.ref === x.ref && i.amount > 0);
    inv.credited = round2((inv.credited || 0) + x.amount);
  }
  for (const x of crTotals) {
    const cr = c.invoices.find((i) => i.ref === x.ref && i.amount < 0);
    cr.applied = round2((cr.applied || 0) + x.amount);
  }
  c.lastActivityAt = new Date();
  await c.save();
  const total = round2(invTotals.reduce((s, x) => s + x.amount, 0));
  const entry = await Collection.create({
    customer: c._id, group: null, user: user._id, type: 'apply', amount: total, date: new Date(),
    allocations: invTotals, credits: crTotals,
    note: `Receipts ${crTotals.map((x) => x.ref).join(', ')} applied to ${invTotals.length} invoice(s)`,
  });
  return json({ entry, applied: total, invoices: invTotals, credits: crTotals });
});
