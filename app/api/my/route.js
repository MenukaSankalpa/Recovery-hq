import { handle, json, requireAuth } from '@/lib/auth';
import { Customer, Group, Collection } from '@/models';

export const dynamic = 'force-dynamic';

// Collector's workspace: groups the CEO assigned to me, their customers and all attempts on them
export const GET = handle(async (req) => {
  const { user } = await requireAuth({ perm: 'collect' });
  const groups = await Group.find({ status: 'active', assignees: user._id })
    .populate('assignees', 'name')
    .sort({ endDate: 1 })
    .lean();
  const custIds = groups.flatMap((g) => g.customers);
  const [customers, entries] = await Promise.all([
    Customer.find({ _id: { $in: custIds } }).lean(),
    Collection.find({ customer: { $in: custIds } })
      .populate('user', 'name')
      .sort({ date: -1 })
      .lean(),
  ]);
  const p = new URL(req.url).searchParams;
  const todayFrom = p.get('todayFrom') ? new Date(p.get('todayFrom')) : new Date(new Date().toDateString());
  const mine = await Collection.find({ user: user._id, date: { $gte: todayFrom } })
    .populate('customer', 'name')
    .sort({ date: -1 })
    .lean();
  return json({ groups, customers, entries, today: mine });
});
