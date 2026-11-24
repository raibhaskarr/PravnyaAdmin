import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";

// Therapist-facing stats for the child's AAC board. Light-touch: a 4-week calendar of taps-per-day,
// the top words the child "said", pages they haven't opened and cells they've never tapped so the
// therapist can trim unused cells or add missing vocabulary.

type Stats = {
  perDay: { date: string; words: number }[];
  topWords: { label: string; count: number; lastAt: string }[];
  byHour: number[];
  quietPages: { pageId: string; name: string }[];
  neverTapped: { cellId: string; pageId: string; pageName: string; label: string }[];
  totals: { words: number; activeDays: number; windowDays: number };
};

const WINDOWS = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 28 days", value: 28 },
  { label: "Last 90 days", value: 90 }
];

function dayLabel(d: string) {
  // "2026-11-24" -> "Mon 24"
  const date = new Date(`${d}T00:00:00Z`);
  const wk = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
  return `${wk} ${date.getUTCDate()}`;
}

function HourBars({ byHour }: { byHour: number[] }) {
  const max = Math.max(1, ...byHour);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, alignItems: "end", height: 70 }}>
      {byHour.map((n, h) => (
        <div key={h} title={`${String(h).padStart(2, "0")}:00 · ${n} tap${n === 1 ? "" : "s"}`} style={{ background: n ? "var(--pv-green-700, #136b4d)" : "var(--pv-border, #e3ebe4)", height: `${(n / max) * 100}%`, minHeight: 2, borderRadius: 2 }} />
      ))}
    </div>
  );
}

function DayBars({ perDay }: { perDay: Stats["perDay"] }) {
  const max = Math.max(1, ...perDay.map((d) => d.words));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${perDay.length}, 1fr)`, gap: 2, alignItems: "end", height: 90 }}>
      {perDay.map((d) => (
        <div key={d.date} title={`${dayLabel(d.date)} · ${d.words} tap${d.words === 1 ? "" : "s"}`} style={{ background: d.words ? "var(--pv-green-700, #136b4d)" : "var(--pv-border, #e3ebe4)", height: `${(d.words / max) * 100}%`, minHeight: 2, borderRadius: 3 }} />
      ))}
    </div>
  );
}

export function AacStats({ kidId, kidName }: { kidId: string; kidName: string }) {
  const { token } = useAuth();
  const [window, setWindow] = useState(28);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getAacStats(token!, kidId, window)
      .then((r) => { if (!cancelled) setStats(r.stats); })
      .catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, kidId, window]);

  if (loading && !stats) return <div className="card"><p className="empty-state">Loading usage…</p></div>;
  if (!stats) return null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
        <strong>How {kidName} is using the board</strong>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Dropdown value={window} options={WINDOWS} onChange={(e) => setWindow(e.value)} />
          <Button icon="pi pi-refresh" className="p-button-text p-button-sm" onClick={() => setWindow(window)} />
        </div>
      </div>
      {stats.totals.words === 0 ? (
        <p className="hint-text">Nothing tapped yet in this window. Taps appear within a minute of use.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            <div><div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{stats.totals.words}</div><div className="hint-text">words said</div></div>
            <div><div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{stats.totals.activeDays}<span className="hint-text" style={{ fontWeight: 400 }}> of {stats.totals.windowDays}</span></div><div className="hint-text">days with a tap</div></div>
          </div>
          <div>
            <div className="hint-text" style={{ marginBottom: 4 }}>Taps per day</div>
            <DayBars perDay={stats.perDay} />
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--pv-ink-faint, #8b998f)", fontSize: "0.72rem", marginTop: 4 }}>
              <span>{dayLabel(stats.perDay[0]?.date ?? "")}</span>
              <span>{dayLabel(stats.perDay[stats.perDay.length - 1]?.date ?? "")}</span>
            </div>
          </div>
          <div>
            <div className="hint-text" style={{ marginBottom: 4 }}>Time of day (00 - 23)</div>
            <HourBars byHour={stats.byHour} />
          </div>
          <div>
            <div className="hint-text" style={{ marginBottom: 4 }}>Top words</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              {stats.topWords.map((w) => (
                <span key={w.label} className="p-tag" style={{ background: "var(--pv-green-100, #e8f6ef)", color: "var(--pv-ink, #1c2b22)" }}>
                  {w.label} · <strong>{w.count}</strong>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
      {stats.quietPages.length ? (
        <div>
          <div className="hint-text">Pages not opened in this window</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: 4 }}>
            {stats.quietPages.map((p) => (
              <span key={p.pageId} className="p-tag" style={{ background: "var(--pv-orange-100, #fde9d3)" }}>{p.name}</span>
            ))}
          </div>
        </div>
      ) : null}
      {stats.neverTapped.length ? (
        <div>
          <div className="hint-text">Cells never tapped (good candidates to review or remove)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: 4 }}>
            {stats.neverTapped.map((c) => (
              <span key={c.cellId} className="p-tag" style={{ background: "var(--pv-border, #e3ebe4)" }}>{c.label}<span className="hint-text" style={{ marginLeft: 4 }}> · {c.pageName}</span></span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
