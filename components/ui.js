'use client';
import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { statusDot } from '@/lib/format';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Card({ className, children, ...p }) {
  return <div className={cx('card', className)} {...p}>{children}</div>;
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cx('animate-spin', className || 'h-5 w-5 text-emerald-400')} />;
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8 text-emerald-400" />
    </div>
  );
}

export function Empty({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <div className="mb-3 rounded-2xl bg-white/[0.04] p-3"><Icon className="h-6 w-6 text-slate-400" /></div>}
      <div className="font-semibold text-slate-200">{title}</div>
      {text && <div className="mt-1 max-w-sm text-sm text-slate-400">{text}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cx('rise relative flex max-h-[92vh] w-full flex-col rounded-t-3xl border border-white/10 bg-ink-900 shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h3 className="text-base font-bold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, subtitle, children }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-ink-900 shadow-2xl" style={{ animation: 'rise .3s ease both' }}>
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-white">{title}</h3>
            {subtitle && <div className="mt-0.5 text-sm text-slate-400">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Progress({ value, className, color }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const c = color || (v >= 100 ? 'bg-emerald-400' : v >= 50 ? 'bg-amber-400' : 'bg-rose-500');
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div className={cx('h-full rounded-full transition-all duration-700', c)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Dot({ pct, className }) {
  const s = statusDot(pct);
  return <span title={s.label} className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', s.cls, className)} />;
}

const BADGE = {
  overdue: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  current: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  settled: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  amber: 'bg-amber-400/15 text-amber-200 border-amber-400/25',
  slate: 'bg-white/[0.05] text-slate-300 border-white/10',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
};
export function Badge({ tone = 'slate', children, className }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', BADGE[tone], className)}>{children}</span>;
}
export function StatusBadge({ c }) {
  if (c.status === 'settled') return <Badge tone="settled">Settled</Badge>;
  if (c.status === 'credit') return <Badge tone="current">In credit</Badge>;
  if (c.status === 'overdue') return <Badge tone="overdue">{c.overdueDays}d overdue</Badge>;
  return <Badge tone="current">{c.daysToDue === 0 ? 'Due today' : `${c.daysToDue}d left`}</Badge>;
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('inline-flex max-w-full overflow-x-auto rounded-xl border border-white/[0.07] bg-ink-850/70 p-1', className)}>
      {tabs.map((t) => {
        const v = typeof t === 'string' ? t : t.value;
        const l = typeof t === 'string' ? t : t.label;
        return (
          <button key={v} onClick={() => onChange(v)}
            className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition', value === v ? 'bg-white/10 text-white shadow' : 'text-slate-400 hover:text-slate-200')}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

// ---- tiny toast system ----
let push = null;
export function toast(msg, tone = 'ok') {
  push?.({ id: Math.random(), msg, tone });
}
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    push = (t) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 3800);
    };
    return () => { push = null; };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-[92%] max-w-sm -translate-x-1/2 flex-col gap-2 lg:bottom-6">
      {items.map((t) => (
        <div key={t.id} className={cx('rise rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur',
          t.tone === 'err' ? 'border-rose-500/30 bg-rose-950/90 text-rose-100' : 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100')}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
