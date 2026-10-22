/**
 * One measure, one column per day. A single series, so no legend: the title
 * names it. Columns grow from one baseline, square at the bottom and rounded at
 * the data end, never wider than 24px, 2px apart; only the highest day carries
 * its number, every other value is on hover and in the table below.
 */
export function DailyColumns({
  title,
  days,
  values,
}: {
  title: string;
  days: string[];
  values: number[];
}) {
  const max = Math.max(...values, 0);
  const total = values.reduce((s, v) => s + v, 0);
  const peak = values.indexOf(max);
  const label = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  return (
    <figure className="rounded-2xl border border-border bg-surface p-4">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-extrabold">{title}</span>
        <span className="batta-tabular text-[12px] text-muted">{total.toLocaleString("fr-FR")} au total</span>
      </figcaption>

      {max === 0 ? (
        <p className="mt-6 pb-6 text-center text-[12.5px] text-muted">Rien sur la période.</p>
      ) : (
        <div className="mt-6">
          <div className="flex h-36 items-end gap-[2px] border-b border-border" role="img" aria-label={`${title} : ${total} sur ${days.length} jours, au plus ${max} le ${label(days[peak])}`}>
            {values.map((v, i) => (
              <div key={days[i]} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                {i === peak && (
                  <span className="batta-tabular absolute -top-5 text-[10.5px] font-bold text-foreground">{v}</span>
                )}
                <div
                  className="w-full max-w-6 rounded-t-[4px] bg-gold transition-opacity group-hover:opacity-80"
                  style={{ height: v > 0 ? `${Math.max((v / max) * 100, 3)}%` : 0 }}
                />
                <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-surface-2 px-2 py-1 text-[11px] text-foreground shadow-lg ring-1 ring-border group-hover:block">
                  {label(days[i])} · <span className="batta-tabular font-bold">{v}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10.5px] text-muted">
            <span>{label(days[0])}</span>
            <span>{label(days[days.length - 1])}</span>
          </div>
        </div>
      )}
    </figure>
  );
}
