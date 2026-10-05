import { HttpError } from './auth';
import { Group } from '@/models';

/** Company codes a user may see on the dashboard. null = all (CEO). */
export function companyScope(user) {
  if (user.role === 'ceo') return null;
  if (!user.canDashboard) throw new HttpError(403, 'No dashboard access');
  const list = (user.companies || []).map((c) => String(c).toUpperCase());
  if (!list.length) throw new HttpError(403, 'No companies are assigned to you yet');
  return list;
}

export const inScope = (scope, company) => !scope || scope.includes(String(company || '').toUpperCase());

// A staff member may see a customer when: it is in an active group assigned to them,
// or it belongs to one of their dashboard companies.
export async function assertCustomerAccess(user, customer) {
  if (user.role === 'ceo' || user.canEnter) return null;
  if (user.canDashboard && customer.company && inScope((user.companies || []).map((c) => c.toUpperCase()), customer.company)) return null;
  if (!customer.group) throw new HttpError(403, 'This customer is not assigned to you');
  const g = await Group.findById(customer.group).lean();
  if (!g || g.status !== 'active' || !g.assignees.map(String).includes(user._id))
    throw new HttpError(403, 'This customer is not assigned to you');
  return g;
}
