'use client';
import { useMemo, useState } from 'react';
import { short, fmtDateShort } from '@/lib/format';

/** Lightweight SVG area chart: points = [{ date, value, count }] */
export default function TrendChart({ points, height = 190 }) {
  const [hover, setHover] = useState(null);
  const W = 600;
  const H = height;
  const P = { l: 8, r: 8, t: 14, b: 22 };
  const max = Math.max(1, ...points.map((p) => p.value));
  const geo = useMemo(() => {
    const n = points.length;
    const x = (i) => P.l + (n <= 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (n - 1));
    const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const area = n ? `${line} L${x(n - 1)},${H - P.b} L${x(0)},${H - P.b} Z` : '';
    return { x, y, line, area };
  }, [points, max, H]);

  if (!points.length) return <div className="grid h-40 place-items-center text-sm text-slate-500">No data</div>;
  const step = Math.max(1, Math.ceil(points.length / 7));
  const h = hover != null ? points[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((rel - P.l) / (W - P.l - P.r)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}>
        <defs>
          <linearGradient id="tg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#10b981" stopOpacity=".45" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={P.l} x2={W - P.r} y1={geo.y(max * f)} y2={geo.y(max * f)} stroke="rgba(255,255,255,.05)" />
        ))}
        <path d={geo.area} fill="url(#tg)" />
        <path d={geo.line} fill="none" stroke="#34d399" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {h && <line x1={geo.x(hover)} x2={geo.x(hover)} y1={P.t} y2={H - P.b} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        {points.map((p, i) => (i % step === 0 || i === points.length - 1) && (
          <text key={i} x={geo.x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#64748b">{fmtDateShort(p.date)}</text>
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: `${(geo.x(hover) / W) * 100}%`, transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})` }}>
          <div className="text-slate-400">{fmtDateShort(h.date)}</div>
          <div className="num font-bold text-emerald-300">{short(h.value)}</div>
          <div className="text-slate-500">{h.count} payment{h.count === 1 ? '' : 's'}</div>
        </div>
      )}
    </div>
  );
}
