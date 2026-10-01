import { handle, json, requireAuth, publicUser, IDLE_MINUTES } from '@/lib/auth';
import { Customer, Group, Collection, User, Session, getSettings } from '@/models';

export const dynamic = 'force-dynamic';

// Everything the CEO dashboard needs in one call; the browser slices it by range / dimension.
export const GET = handle(async (req) => {
  await requireAuth({ roles: ['ceo'] });
  const p = new URL(req.url).searchParams;
  const now = new Date();
  const from = p.get('from') ? new Date(p.get('from')) : new Date(now.getTime() - 30 * 86400000);
  const to = p.get('to') ? new Date(p.get('to')) : now;
  const todayFrom = p.get('todayFrom') ? new Date(p.get('todayFrom')) : new Date(now.toDateString());
  const todayTo = p.get('todayTo') ? new Date(p.get('todayTo')) : now;
  const qFrom = from < todayFrom ? from : todayFrom;
  const qTo = to > todayTo ? to : todayTo;

  const [customers, groups, users, entries, groupPaid, promises, onlineIds, settings] = await Promise.all([
    Customer.find()
      .select('name company code phone invoiceNo amount paidAmount creditBalance creditStartDate creditPeriodDays dueDate group lastPaymentAt lastActivityAt lastOutcome invoices')
      .lean(),
    Group.find({ $or: [{ status: 'active' }, { endDate: { $gte: qFrom } }, { closedAt: { $gte: qFrom } }] })
      .populate('assignees', 'name team')
      .sort({ endDate: 1 })
      .lean(),
    User.find({ active: true }).sort({ name: 1 }).lean(),
    Collection.find({ date: { $gte: qFrom, $lte: qTo } })
      .populate('user', 'name')
      .populate('customer', 'name')
      .sort({ date: -1 })
      .limit(10000)
      .lean(),
    Collection.aggregate([
      { $match: { type: 'payment', group: { $ne: null } } },
      { $group: { _id: { g: '$group', c: '$customer' }, total: { $sum: '$amount' } } },
    ]),
    // promise-to-pay: every open promise + any promise due inside the range (for kept / broken stats)
    Collection.find({ type: 'promise', status: { $ne: 'cancelled' }, $or: [{ status: 'open' }, { promiseDate: { $gte: qFrom } }, { date: { $gte: qFrom } }] })
      .populate('customer', 'name company amount paidAmount group')
      .populate('user', 'name')
      .sort({ promiseDate: 1 })
      .lean(),
    Session.find({ logoutAt: null, lastActivityAt: { $gte: new Date(Date.now() - IDLE_MINUTES * 60000) } }).distinct('user'),
    getSettings(),
  ]);

  const online = new Set(onlineIds.map(String));
  return json({
    serverTime: now,
    customers,
    groups,
    users: users.map((u) => ({ ...publicUser(u), online: online.has(String(u._id)) })),
    entries,
    groupPaid: groupPaid.map((r) => ({ group: String(r._id.g), customer: String(r._id.c), total: r.total })),
    promises,
    settings: { companyName: settings.companyName, currency: settings.currency, agingBuckets: settings.agingBuckets, agingBasis: settings.agingBasis },
  });
});
