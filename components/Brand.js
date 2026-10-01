export default function Brand({ name = 'Recovery HQ', small }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 shadow-[0_8px_24px_-6px_rgba(16,185,129,.7)]">
        <svg viewBox="0 0 64 64" className="h-5 w-5"><path d="M14 42l11-12 8 7 17-18" stroke="#05080f" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      {!small && (
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight text-white">{name}</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400/80">Recovery war room</div>
        </div>
      )}
    </div>
  );
}
