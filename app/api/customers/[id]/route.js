import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { assertCustomerAccess } from '@/lib/access';
import { addDays } from '@/lib/util';
import { Customer, Collection, Group } from '@/models';
import { customerFields } from '@/lib/customerFields';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req, ctx) => {
  const { user } = await requireAuth();
  const { id } = await ctx.params;
  const c = await Customer.findById(id)
    .populate({ path: 'group', select: 'name status startDate endDate assignees color', populate: { path: 'assignees', select: 'name team' } })
    .lean();
  if (!c) throw new HttpError(404, 'Customer not found');
  await assertCustomerAccess(user, { group: c.group?._id });
  const entries = await Collection.find({ customer: id })
    .populate('user', 'name team')
    .populate('group', 'name')
    .sort({ date: -1, createdAt: -1 })
    .lean();
  return json({ customer: c, entries });
});

export const PATCH = handle(async (req, ctx) => {
  await requireAuth({ perm: 'enter', touch: true });
  const { id } = await ctx.params;
  const c = await Customer.findById(id);
  if (!c) throw new HttpError(404, 'Customer not found');
  const f = customerFields(await readBody(req), true);
  if (c.invoices?.length) {
    // totals of imported customers come from their invoice lines
    delete f.amount;
    delete f.creditStartDate;
    delete f.creditPeriodDays;
  }
  Object.assign(c, f);
  if (c.amount < c.paidAmount) throw new HttpError(400, `AR amount cannot be less than already paid (${c.paidAmount})`);
  if (!c.invoices?.length) c.dueDate = addDays(c.creditStartDate, c.creditPeriodDays);
  await c.save();
  return json({ customer: c });
});

export const DELETE = handle(async (req, ctx) => {
  await requireAuth({ roles: ['ceo'], touch: true });
  const { id } = await ctx.params;
  const c = await Customer.findById(id);
  if (!c) throw new HttpError(404, 'Customer not found');
  await Collection.deleteMany({ customer: c._id });
  await Group.updateMany({ customers: c._id }, { $pull: { customers: c._id } });
  await c.deleteOne();
  return json({ ok: true });
});
