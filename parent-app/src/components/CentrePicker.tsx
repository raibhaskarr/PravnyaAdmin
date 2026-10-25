import { useEffect, useState } from "react";
import { api, type Centre } from "../api/client";

// Hand-rolled dropdown, same shape as home/Home.tsx's KidSwitcher and home/opener.tsx -- a
// relative-positioned input backing an absolutely-positioned filtered panel, with a full-screen
// invisible button to catch outside clicks and close it. No PrimeReact in this app, so this is the
// app's own established "pick from a short list" pattern, not a new one. Also offers an inline
// "add new centre" affordance (createCentre is an idempotent find-or-create server-side, so even a
// near-simultaneous duplicate submit can't create two rows for the same name).
export function CentrePicker({
  token,
  value,
  onChange,
  placeholder = "Centre or therapist (optional)"
}: {
  token: string;
  value: Centre | null;
  onChange: (centre: Centre | null) => void;
  placeholder?: string;
}) {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listCentres(token).then(setCentres);
  }, [token]);

  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value?.id]);

  const needle = query.trim().toLowerCase();
  const matches = needle ? centres.filter((c) => c.name.toLowerCase().includes(needle)) : centres;
  const exactMatch = centres.find((c) => c.name.toLowerCase() === needle);
  const showCreateHint = needle.length > 0 && !exactMatch;

  async function handleCreate() {
    setCreating(true);
    try {
      const centre = await api.createCentre(token, { name: query.trim() });
      setCentres((prev) => [...prev, centre]);
      onChange(centre);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (e.target.value.trim() === "") onChange(null);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3 text-[1.05rem] text-[var(--pv-ink)] outline-none transition focus:border-[var(--pv-green-500)] focus:ring-2 focus:ring-[var(--pv-green-100)]"
      />
      {open ? (
        <>
          <button type="button" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] py-1 shadow-md">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c);
                  setQuery(c.name);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-[0.92rem] ${
                  value?.id === c.id ? "font-semibold text-[var(--pv-green-700)]" : "text-[var(--pv-ink)] hover:bg-[var(--pv-bg)]"
                }`}
              >
                {c.name}
                {value?.id === c.id ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
            {matches.length === 0 && !needle ? <p className="px-3.5 py-2 text-[0.85rem] text-[var(--pv-ink-faint)]">No centres yet.</p> : null}
            {showCreateHint ? (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex w-full items-center px-3.5 py-2 text-left text-[0.88rem] font-medium text-[var(--pv-green-700)] hover:bg-[var(--pv-bg)] disabled:opacity-60"
              >
                {creating ? "Adding..." : `+ Add "${query.trim()}" as a new centre`}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
