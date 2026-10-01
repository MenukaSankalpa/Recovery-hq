import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { toDate } from '@/lib/util';
import { Group, Customer } from '@/models';
import { validateMembers } from '@/lib/groupMembers';

export const dynamic = 'force-dynamic';

const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16'];

export const GET = handle(async (req) => {
  await requireAuth({ roles: ['ceo'] });
  const status = new URL(req.url).searchParams.get('status');
  const q = status ? { status } : {};
  const groups = await Group.find(q).populate('assignees', 'name team').sort({ createdAt: -1 }).lean();
  return json({ groups });
});

export const POST = handle(async (req) => {
  const { user } = await requireAuth({ roles: ['ceo'], touch: true });
  const b = await readBody(req);
  if (!b.name || !String(b.name).trim()) throw new HttpError(400, 'Group name is required');
  const startDate = toDate(b.startDate, 'start date');
  const endDate = toDate(b.endDate, 'end date');
  if (endDate < startDate) throw new HttpError(400, 'End date must be after start date');
  const { ids, aIds } = await validateMembers({ customerIds: b.customerIds, assigneeIds: b.assigneeIds });
  const n = await Group.countDocuments();
  const g = await Group.create({
    name: String(b.name).trim(),
    customers: ids,
    assignees: aIds,
    startDate,
    endDate,
    notes: b.notes || '',
    color: b.color || COLORS[n % COLORS.length],
    createdBy: user._id,
  });
  await Customer.updateMany({ _id: { $in: ids } }, { group: g._id });
  return json({ group: g }, 201);
});
