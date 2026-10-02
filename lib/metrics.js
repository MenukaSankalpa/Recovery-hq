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

// signed: negative = customer is in credit (credit notes / receipts bigger than invoices)
/** Net receivable = sum of every invoice line incl. negative (credit) lines — same as the Excel total */
export function netOf(c) {
  if (c.invoices?.length) return Math.round(c.invoices.reduce((s, x) => s + (x.amount || 0), 0) * 100) / 100;
  return c.amount || 0;
}
/** can be negative when the customer is in credit */
export const balanceOf = (c) => Math.round((netOf(c) - (c.paidAmount || 0)) * 100) / 100;

/**
 * Every invoice line with what is paid and what is still open.
 *  - payments recorded against a specific invoice (invoice.paid) reduce that invoice;
 *  - payments recorded without choosing invoices clear the oldest invoices first;
 *  - credit notes / receipts (negative lines) are NOT used to clear invoices: they stay as their own (−) line.
 * Customers entered by hand (no invoice lines) behave as one invoice.
 */
export function invoiceStatus(c) {
  const inv = c.invoices?.length
    ? c.invoices
    : [{ ref: c.invoiceNo, date: c.creditStartDate, dueDate: c.dueDate || new Date(new Date(c.creditStartDate).getTime() + (c.creditPeriodDays || 0) * DAY), amount: c.amount }];
  const pos = inv.filter((x) => x.amount > 0);
  const tied = pos.reduce((s, x) => s + Math.min(x.amount, x.paid || 0), 0);
  let pool = Math.max(0, (c.paidAmount || 0) - tied);
  const rows = [...pos].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).map((x) => {
    const paid = Math.min(x.amount, x.paid || 0);
    const start = x.amount - paid;
    const auto = Math.min(pool, start);
    pool -= auto;
    const open = Math.round((start - auto) * 100) / 100;
    return {
      ref: x.ref, date: new Date(x.date), due: new Date(x.dueDate), amount: x.amount, creditPeriodDays: x.creditPeriodDays,
      paid, auto: Math.round(auto * 100) / 100, open: open > 0.009 ? open : 0,
      state: open <= 0.009 ? 'paid' : paid + auto > 0.009 ? 'part' : 'open',
    };
  });
  const creditRows = inv.filter((x) => x.amount < 0).map((x) => ({
    ref: x.ref, date: new Date(x.date), due: new Date(x.dueDate || x.date), amount: x.amount, open: x.amount, credit: true, state: 'credit',
  }));
  return { rows, creditRows };
}

/** Open (+) invoice slices only — what collectors chase */
export function openParts(c) {
  return invoiceStatus(c).rows.filter((r) => r.open > 0).map((r) => ({ ref: r.ref, date: r.date, due: r.due, amount: r.amount, paid: r.paid, open: r.open }));
}

export function enrich(c, now = new Date()) {
  const net = netOf(c);
  const balance = balanceOf(c);
  const st = invoiceStatus(c);
  const openInv = st.rows.filter((r) => r.open > 0).map((r) => ({ ref: r.ref, date: r.date, due: r.due, amount: r.amount, paid: r.paid, open: r.open }));
  // parts = every open line: (+) invoices still due, then (−) credit lines. Aging sums these, so totals tally with the file.
  const parts = [...openInv, ...st.creditRows.map((r) => ({ ref: r.ref, date: r.date, due: r.due, amount: r.amount, open: r.amount, credit: true }))];
  parts.forEach((p) => {
    p.daysSince = Math.max(0, daysBetween(p.date, now));
    p.overdueDays = Math.max(0, -daysBetween(now, p.due));
  });
  const oldest = openInv[0];
  const due = oldest ? oldest.due : new Date(c.dueDate || new Date(c.creditStartDate).getTime() + (c.creditPeriodDays || 0) * DAY);
  const start = oldest ? oldest.date : new Date(c.creditStartDate);
  const daysSinceStart = Math.max(0, daysBetween(start, now));
  const daysToDue = daysBetween(now, due);
  const overdueDays = balance > 0 && oldest ? Math.max(0, -daysToDue) : 0;
  const overdueAmt = parts.filter((p) => p.overdueDays > 0).reduce((s, p) => s + p.open, 0);
  const status = balance < -0.009 ? 'credit' : balance <= 0.009 ? 'settled' : overdueDays > 0 ? 'overdue' : 'current';
  const invs = c.invoices?.length ? c.invoices : [{ amount: c.amount }];
  return {
    ...c, amount: net, due, balance, parts, daysSinceStart, daysToDue, overdueDays, overdueAmt, status,
    invoiceCount: invs.length,
    plusLines: invs.filter((x) => x.amount > 0).length, plusTotal: invs.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0),
    minusLines: invs.filter((x) => x.amount < 0).length, minusTotal: invs.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0),
    paidPct: net > 0 ? ((c.paidAmount || 0) / net) * 100 : 0,
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

/** amount -> spread over the customer's open invoices oldest first (credit lines are skipped) */
export function allocateToParts(parts, amount) {
  const out = parts.map(() => 0);
  let left = amount;
  for (let i = 0; i < parts.length && left > 0; i++) {
    if (parts[i].open <= 0) continue;
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
  // basis 'age' = days since invoice date; 'overdue' = days past due date (invoice date + credit period)
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
    const bal = Math.max(0, m.balance ?? balanceOf(m));
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
