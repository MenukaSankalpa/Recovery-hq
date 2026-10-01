import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { toDate } from '@/lib/util';
import { validateMembers } from '@/lib/groupMembers';
import { Group, Customer, Collection } from '@/models';

export const dynamic = 'force-dynamic';

// Group detail with every collection attempt (who / when / how much / why not)
export const GET = handle(async (req, ctx) => {
  await requireAuth({ roles: ['ceo'] });
  const { id } = await ctx.params;
  const g = await Group.findById(id).populate('assignees', 'name team').lean();
  if (!g) throw new HttpError(404, 'Group not found');
  const customers = await Customer.find({ _id: { $in: g.customers } }).lean();
  const entries = await Collection.find({ group: g._id })
    .populate('user', 'name')
    .populate('customer', 'name')
    .sort({ date: -1 })
    .lean();
  return json({ group: g, customers, entries });
});

export const PATCH = handle(async (req, ctx) => {
  await requireAuth({ roles: ['ceo'], touch: true });
  const { id } = await ctx.params;
  const b = await readBody(req);
  const g = await Group.findById(id);
  if (!g) throw new HttpError(404, 'Group not found');

  if (b.status === 'closed' && g.status === 'active') {
    g.status = 'closed';
    g.closedAt = new Date();
    await g.save();
    await Customer.updateMany({ _id: { $in: g.customers }, group: g._id }, { group: null });
    return json({ group: g });
  }
  if (g.status !== 'active') throw new HttpError(400, 'Closed groups cannot be edited');

  if (b.name !== undefined) g.name = String(b.name).trim() || g.name;
  if (b.notes !== undefined) g.notes = b.notes;
  if (b.color) g.color = b.color;
  if (b.startDate) g.startDate = toDate(b.startDate, 'start date');
  if (b.endDate) g.endDate = toDate(b.endDate, 'end date');
  if (g.endDate < g.startDate) throw new HttpError(400, 'End date must be after start date');

  if (b.customerIds || b.assigneeIds) {
    const { ids, aIds } = await validateMembers({
      customerIds: b.customerIds || g.customers,
      assigneeIds: b.assigneeIds || g.assignees,
      groupId: g._id,
    });
    const removed = g.customers.map(String).filter((c) => !ids.includes(c));
    g.customers = ids;
    g.assignees = aIds;
    await Customer.updateMany({ _id: { $in: removed }, group: g._id }, { group: null });
    await Customer.updateMany({ _id: { $in: ids } }, { group: g._id });
  }
  await g.save();
  return json({ group: g });
});

export const DELETE = handle(async (req, ctx) => {
  await requireAuth({ roles: ['ceo'], touch: true });
  const { id } = await ctx.params;
  const g = await Group.findById(id);
  if (!g) throw new HttpError(404, 'Group not found');
  if (await Collection.exists({ group: g._id }))
    throw new HttpError(400, 'This group already has collection records — close it instead of deleting');
  await Customer.updateMany({ group: g._id }, { group: null });
  await g.deleteOne();
  return json({ ok: true });
});
