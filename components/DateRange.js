'use client';
import { CalendarRange } from 'lucide-react';
import { cx } from './ui';
import { toInputDate } from '@/lib/format';

const DAY = 86400000;
export function presetRange(key) {
  const now = new Date();
  const t = toInputDate(now);
  const back = (n) => toInputDate(new Date(now.getTime() - n * DAY));
  switch (key) {
    case 'today': return { from: t, to: t };
    case 'yesterday': return { from: back(1), to: back(1) };
    case '7d': return { from: back(6), to: t };
    case '30d': return { from: back(29), to: t };
    case '60d': return { from: back(59), to: t };
    case '90d': return { from: back(89), to: t };
    case 'mtd': return { from: toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: t };
    default: return null;
  }
}

const PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yest.'], ['7d', '7D'], ['30d', '30D'], ['60d', '60D'], ['90d', '90D'], ['mtd', 'MTD'],
];

export default function DateRange({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-white/[0.07] bg-ink-850/70 p-1">
        {PRESETS.map(([k, l]) => (
          <button key={k} onClick={() => onChange({ ...presetRange(k), preset: k })}
            className={cx('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', value.preset === k ? 'bg-emerald-500 text-ink-950' : 'text-slate-400 hover:text-white')}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-ink-850/70 px-2 py-1">
        <CalendarRange className="h-4 w-4 text-slate-500" />
        <input type="date" className="w-[124px] bg-transparent py-1 text-xs text-slate-200 outline-none" value={value.from} max={value.to}
          onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value, preset: 'custom' })} />
        <span className="text-slate-600">→</span>
        <input type="date" className="w-[124px] bg-transparent py-1 text-xs text-slate-200 outline-none" value={value.to} min={value.from}
          onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value, preset: 'custom' })} />
      </div>
    </div>
  );
}
