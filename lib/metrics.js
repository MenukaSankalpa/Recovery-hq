// Shared recovery maths (runs in the browser so the CEO can slice instantly)
export const DAY = 86400000;

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

export const balanceOf = (c) => Math.max(0, Math.round(((c.amount || 0) - (c.paidAmount || 0)) * 100) / 100);

/**
 * Open invoice slices: payments + credit notes are applied to the oldest invoices first.
 * Customers entered by hand (no invoice lines) behave as one invoice.
 */
export function openParts(c) {
  const inv = c.invoices?.length
    ? c.invoices
    : [{ ref: c.invoiceNo, date: c.creditStartDate, dueDate: c.dueDate || new Date(new Date(c.creditStartDate).getTime() + (c.creditPeriodDays || 0) * DAY), amount: c.amount }];
  const credits = inv.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0);
  let pool = (c.paidAmount || 0) + credits;
  const parts = [];
  [...inv].filter((x) => x.amount > 0).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).forEach((x) => {
    const applied = Math.min(pool, x.amount);
    pool -= applied;
    const open = Math.round((x.amount - applied) * 100) / 100;
    if (open > 0.009) parts.push({ ref: x.ref, date: new Date(x.date), due: new Date(x.dueDate), amount: x.amount, open });
  });
  return parts;
}

export function enrich(c, now = new Date()) {
  const balance = balanceOf(c);
  const parts = balance > 0 ? openParts(c) : [];
  // keep part totals equal to the balance (rounding / hand-edited amounts)
  const sumParts = parts.reduce((s, p) => s + p.open, 0);
  if (parts.length && Math.abs(sumParts - balance) > 0.01) {
    const k = balance / sumParts;
    parts.forEach((p) => (p.open = Math.round(p.open * k * 100) / 100));
  }
  parts.forEach((p) => {
    p.daysSince = Math.max(0, daysBetween(p.date, now));
    p.overdueDays = Math.max(0, -daysBetween(now, p.due));
  });
  const oldest = parts[0];
  const due = oldest ? oldest.due : new Date(c.dueDate || new Date(c.creditStartDate).getTime() + (c.creditPeriodDays || 0) * DAY);
  const start = oldest ? oldest.date : new Date(c.creditStartDate);
  const daysSinceStart = Math.max(0, daysBetween(start, now));
  const daysToDue = daysBetween(now, due);
  const overdueDays = balance > 0 ? Math.max(0, -daysToDue) : 0;
  const overdueAmt = parts.filter((p) => p.overdueDays > 0).reduce((s, p) => s + p.open, 0);
  const status = balance <= 0 ? 'settled' : overdueDays > 0 ? 'overdue' : 'current';
  return {
    ...c, due, balance, parts, daysSinceStart, daysToDue, overdueDays, overdueAmt, status,
    invoiceCount: c.invoices?.length || 1,
    paidPct: c.amount ? ((c.paidAmount || 0) / c.amount) * 100 : 0,
  };
}

/** Promise status for display: open | today | broken | kept | late-kept | cancelled */
export function promiseState(p, now = new Date()) {
  if (p.status === 'cancelled') return 'cancelled';
  const pd = endOfDay(p.promiseDate);
  if (p.status === 'kept') return p.keptAt && new Date(p.keptAt) > pd ? 'late' : 'kept';
  if (now > pd) return 'broken';
  if (now >= startOfDay(p.promiseDate)) return 'today';
  return 'open';
}
export const promiseLeft = (p) => Math.max(0, (p.amount || 0) - (p.fulfilled || 0));

/** amount -> spread over the customer's open parts oldest first (for "aging minus promised") */
export function allocateToParts(parts, amount) {
  const out = parts.map(() => 0);
  let left = amount;
  for (let i = 0; i < parts.length && left > 0; i++) {
    const a = Math.min(parts[i].open, left);
    out[i] = a;
    left -= a;
  }
  return out;
}

/** Bucket definitions from CEO values e.g. [30,60,90] */
export function buckets(values = [30, 60, 90], basis = 'overdue') {
  const v = [...values].sort((a, b) => a - b);
  const list = [];
  if (basis === 'overdue') list.push({ key: 'nd', label: 'Not due', test: (c) => c.overdueDays <= 0 });
  let prev = basis === 'overdue' ? 1 : 0;
  v.forEach((n) => {
    const lo = prev;
    list.push({ key: `${lo}-${n}`, label: `${lo}–${n}d`, test: (c) => { const d = basis === 'overdue' ? c.overdueDays : c.daysSinceStart; return d >= lo && d <= n && (basis !== 'overdue' || d > 0); } });
    prev = n + 1;
  });
  const last = v[v.length - 1] ?? 0;
  list.push({ key: `${last}+`, label: `${last}+d`, test: (c) => (basis === 'overdue' ? c.overdueDays : c.daysSinceStart) > last });
  return list;
}

/** which bucket an open invoice slice falls in */
export function bucketOfPart(p, bs, basis = 'overdue') {
  const fake = { overdueDays: p.overdueDays, daysSinceStart: p.daysSince };
  return bs.find((b) => b.test(fake)) || bs[bs.length - 1];
}

export function bucketOf(c, bs) {
  return bs.find((b) => b.test(c)) || bs[bs.length - 1];
}

export function groupDays(g) {
  return Math.max(1, daysBetween(g.startDate, g.endDate) + 1);
}

/** groupPaidMap: key `${groupId}|${customerId}` -> total collected inside that group */
export function groupStats(g, custMap, groupPaidMap, now = new Date()) {
  const members = (g.customers || []).map((id) => custMap[String(id)]).filter(Boolean);
  let outstanding = 0;
  let collected = 0;
  let settled = 0;
  for (const m of members) {
    const bal = m.balance ?? balanceOf(m);
    const got = groupPaidMap[`${g._id}|${m._id}`] || 0;
    // once a group is closed, only count what the group itself collected
    outstanding += g.status === 'closed' ? 0 : bal;
    collected += got;
    if (bal <= 0) settled++;
  }
  const target = outstanding + collected;
  const totalDays = groupDays(g);
  const end = new Date(g.endDate);
  const daysLeft = daysBetween(now, end);
  const expired = now > end && outstanding > 0 && g.status === 'active';
  return {
    members,
    outstanding,
    collected,
    target,
    pct: target > 0 ? (collected / target) * 100 : 100,
    settled,
    totalDays,
    daysLeft,
    expired,
    daily: target / totalDays,
  };
}
