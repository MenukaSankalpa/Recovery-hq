export function money(n, cur = 'LKR') {
  const v = Number(n || 0);
  return `${cur} ${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function short(n) {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return String(Math.round(v));
}

export const pct = (a, b) => (b > 0 ? (a / b) * 100 : a > 0 ? 100 : 0);
export const fmtPct = (p) => `${Math.round(p)}%`;

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
export function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDateTime(d) {
  if (!d) return '—';
  return `${fmtDateShort(d)}, ${fmtTime(d)}`;
}
export function fmtDuration(ms) {
  const m = Math.round((ms || 0) / 60000);
  if (m < 1) return '<1m';
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}
export function timeAgo(d) {
  if (!d) return 'never';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// yyyy-mm-dd in local time (for <input type="date">)
export function toInputDate(d) {
  const x = d ? new Date(d) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}
export function toInputDateTime(d) {
  const x = d ? new Date(d) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${toInputDate(x)}T${p(x.getHours())}:${p(x.getMinutes())}`;
}
// local midnight / end of day -> ISO
export const dayStartISO = (s) => new Date(`${s}T00:00:00`).toISOString();
export const dayEndISO = (s) => new Date(`${s}T23:59:59.999`).toISOString();

export function statusDot(p) {
  if (p >= 100) return { emoji: '🟢', cls: 'bg-emerald-400', text: 'text-emerald-300', label: 'On target' };
  if (p >= 50) return { emoji: '🟡', cls: 'bg-amber-400', text: 'text-amber-300', label: 'Close' };
  return { emoji: '🔴', cls: 'bg-rose-500', text: 'text-rose-300', label: 'Behind' };
}

export function deviceOf(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' · ');
}
