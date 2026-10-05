import { HttpError } from './auth';
import { Group } from '@/models';

// A staff member may see / collect from a customer only while it sits in an active group assigned to them.
export async function assertCustomerAccess(user, customer) {
  if (user.role === 'ceo' || user.canEnter) return null;
  if (!customer.group) throw new HttpError(403, 'This customer is not assigned to you');
  const g = await Group.findById(customer.group).lean();
  if (!g || g.status !== 'active' || !g.assignees.map(String).includes(user._id))
    throw new HttpError(403, 'This customer is not assigned to you');
  return g;
}
