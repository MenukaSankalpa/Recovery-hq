export const DAY = 86400000;

export function addDays(date, days) {
  return new Date(new Date(date).getTime() + Number(days || 0) * DAY);
}

export function toDate(v, field = 'date') {
  const d = new Date(v);
  if (!v || isNaN(d.getTime())) {
    const e = new Error(`Invalid ${field}`);
    e.status = 400;
    throw e;
  }
  return d;
}

export function num(v, field = 'number', { min = 0 } = {}) {
  const n = Number(v);
  if (!isFinite(n) || n < min) {
    const e = new Error(`Invalid ${field}`);
    e.status = 400;
    throw e;
  }
  return Math.round(n * 100) / 100;
}

export const round2 = (n) => Math.round(n * 100) / 100;
