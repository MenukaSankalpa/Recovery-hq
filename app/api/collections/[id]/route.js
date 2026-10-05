import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { recomputePromises } from '@/lib/promises';
import { Customer, Collection } from '@/models';

export const dynamic = 'force-dynamic';

// Cancel a promise (CEO, or the collector who recorded it)
export const PATCH = handle(async (req, ctx) => {
  const { user } = await requireAuth({ touch: true });
  const { id } = await ctx.params;
  const b = await readBody(req);
  const e = await Collection.findById(id);
  if (!e) throw new HttpError(404, 'Entry not found');
  if (e.type !== 'promise') throw new HttpError(400, 'Only promises can be changed');
  if (user.role !== 'ceo' && String(e.user) !== user._id) throw new HttpError(403, 'Not allowed');
  if (b.status === 'cancelled') {
    e.status = 'cancelled';
    if (b.reason) e.note = [e.note, `Cancelled: ${b.reason}`].filter(Boolean).join(' · ');
    await e.save();
  }
  return json({ entry: e });
});

// CEO can reverse a wrong entry; the customer's paid total and promise status are corrected automatically
export const DELETE = handle(async (req, ctx) => {
  await requireAuth({ roles: ['ceo'], touch: true });
  const { id } = await ctx.params;
  const e = await Collection.findById(id);
  if (!e) throw new HttpError(404, 'Entry not found');
  if (e.type === 'payment' && e.amount) {
    const c = await Customer.findById(e.customer);
    if (c) {
      c.paidAmount = Math.max(0, Math.round((c.paidAmount - e.amount) * 100) / 100);
      if (e.wht) c.whtDeclared = Math.max(0, Math.round(((c.whtDeclared || 0) - e.wht) * 100) / 100);
      if (e.method === 'WHT certificate') c.whtReceived = Math.max(0, Math.round(((c.whtReceived || 0) - e.amount) * 100) / 100);
      for (const a of e.allocations || []) {
        const inv = c.invoices.find((x) => x.ref === a.ref && x.amount > 0);
        if (inv) inv.paid = Math.max(0, Math.round(((inv.paid || 0) - a.amount) * 100) / 100);
      }
      await c.save();
    }
  }
  await e.deleteOne();
  await recomputePromises(e.customer);
  return json({ ok: true });
});
