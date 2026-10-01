import mongoose from 'mongoose';
import { HttpError } from './auth';
import { Group, Customer, User } from '@/models';

export async function validateMembers({ customerIds, assigneeIds, groupId }) {
  const ids = [...new Set((customerIds || []).map(String))];
  if (!ids.length) throw new HttpError(400, 'Add at least one customer to the group');
  if (!ids.every((i) => mongoose.isValidObjectId(i))) throw new HttpError(400, 'Invalid customer id');
  const custs = await Customer.find({ _id: { $in: ids } }).lean();
  if (custs.length !== ids.length) throw new HttpError(400, 'Some customers no longer exist');
  const taken = custs.filter((c) => c.group && String(c.group) !== String(groupId || ''));
  if (taken.length) {
    const active = await Group.find({ _id: { $in: taken.map((c) => c.group) }, status: 'active' }).lean();
    if (active.length) {
      const names = taken.filter((c) => active.some((g) => String(g._id) === String(c.group))).map((c) => c.name);
      if (names.length) throw new HttpError(409, `Already in another active group: ${names.slice(0, 5).join(', ')}`);
    }
  }
  const aIds = [...new Set((assigneeIds || []).map(String))];
  if (!aIds.length) throw new HttpError(400, 'Assign at least one user');
  const users = await User.find({ _id: { $in: aIds }, active: true }).lean();
  if (users.length !== aIds.length) throw new HttpError(400, 'Some assigned users are missing or disabled');
  return { ids, aIds };
}

