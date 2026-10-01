import { handle, json, readBody, requireAuth, HttpError } from '@/lib/auth';
import { addDays } from '@/lib/util';
import { customerFields } from '@/lib/customerFields';
import { Customer } from '@/models';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAuth({ perm: 'enter' });
  const customers = await Customer.find()
    .populate({ path: 'group', select: 'name status endDate assignees color', populate: { path: 'assignees', select: 'name' } })
    .sort({ createdAt: -1 })
    .lean();
  return json({ customers });
});

export const POST = handle(async (req) => {
  const { user } = await requireAuth({ perm: 'enter', touch: true });
  const f = customerFields(await readBody(req));
  f.dueDate = addDays(f.creditStartDate, f.creditPeriodDays);
  f.createdBy = user._id;
  const c = await Customer.create(f);
  return json({ customer: c }, 201);
});
