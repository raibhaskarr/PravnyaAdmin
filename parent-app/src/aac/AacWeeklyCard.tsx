import { useEffect, useState } from "react";
import { api } from "../api/client";

// Shown on parent Home once the child has started using the board: a one-line "said X 42 times this
// week" plus the top words tapped. Hidden when there's nothing yet (no board, zero taps).

export function AacWeeklyCard({ token, kidId, kidName }: { token: string; kidId: string; kidName: string }) {
  const [stats, setStats] = useState<{ words: number; activeDays: number; topWords: { label: string; count: number }[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(api.getAacStats(token, kidId))
      .then((r) => {
        if (cancelled || !r) return;
        if (!r.stats || r.stats.totals.words === 0) return setStats(null);
        setStats({ words: r.stats.totals.words, activeDays: r.stats.totals.activeDays, topWords: r.stats.topWords });
      })
      .catch(() => setStats(null));
    return () => { cancelled = true; };
  }, [token, kidId]);

  if (!stats) return null;
  const top = stats.topWords.slice(0, 5);
  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">🗣️</span>
        <span className="text-sm font-medium text-[var(--pv-ink-faint)]">{kidName}'s week on the board</span>
      </div>
      <p className="text-[0.98rem] text-[var(--pv-ink)]">
        {kidName} said <strong>{stats.words}</strong> word{stats.words === 1 ? "" : "s"} across <strong>{stats.activeDays}</strong> day{stats.activeDays === 1 ? "" : "s"}.
      </p>
      {top.length ? (
        <div className="flex flex-wrap gap-1.5">
          {top.map((w) => (
            <span key={w.label} className="rounded-full bg-[var(--pv-green-100)] px-2.5 py-1 text-xs font-semibold text-[var(--pv-ink)]">
              {w.label} · {w.count}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
