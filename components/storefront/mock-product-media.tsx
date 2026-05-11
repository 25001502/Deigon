type MockProductMediaProps = {
  title: string;
  vendor: string;
  badge: string;
  themeClass: string;
  className?: string;
};

export function MockProductMedia({
  title,
  vendor,
  badge,
  themeClass,
  className = "",
}: MockProductMediaProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-4xl border border-white/20 p-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${themeClass} ${className}`}
    >
      <div className="absolute -right-10 top-6 h-32 w-32 rounded-full border border-white/15 bg-white/5 blur-[2px]" />
      <div className="absolute bottom-4 right-5 h-24 w-24 rounded-full border border-white/10 bg-black/10" />
      <div className="relative flex h-full min-h-60 flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <span className="rounded-full border border-white/20 bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/85">
            {badge}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
            Demo art direction
          </span>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/65">{vendor}</p>
          <h3 className="mt-3 max-w-[10ch] font-display text-5xl leading-none text-white sm:text-6xl">
            {title}
          </h3>
        </div>
      </div>
    </div>
  );
}