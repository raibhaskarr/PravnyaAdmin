import { useEffect, useState } from "react";
import { api, ApiError, assetUrl, type AacBoard, type AacBoardFields, type AacTemplate } from "../api/client";

// Setting up a child's talking board: start from a ready-made one (the centre's or Pravnya's) or
// an empty grid. Everything can be changed afterwards.

const uuid = () => crypto.randomUUID();

function emptyBoard(name: string, language: "en" | "hi", rows: number, cols: number): AacBoardFields {
  const home = uuid();
  return { name, language, rows, cols, homePageId: home, pages: [{ id: home, name: language === "hi" ? "होम" : "Home", cells: [] }] };
}

export function AacSetup({ token, kidId, kidName, onMade, onCancel }: { token: string; kidId: string; kidName: string; onMade: (b: AacBoard) => void; onCancel: () => void }) {
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [templates, setTemplates] = useState<AacTemplate[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .listAacTemplates(token, kidId, language)
      ?.then((t) => setTemplates(t ?? []))
      .catch(() => setTemplates([]));
  }, [token, kidId, language]);

  async function make(how: string, board: AacBoardFields) {
    setError("");
    setBusy(how);
    try {
      onMade(await api.createAacBoard(token, kidId, board));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't make the board. Try again.");
      setBusy("");
    }
  }
  const name = `${kidName}'s board`;

  return (
    <div className="flex h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
        <button type="button" onClick={onCancel} aria-label="Back" className="rounded-full p-1 text-[var(--pv-ink-soft)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <p className="flex-1 text-[1.05rem] font-semibold text-[var(--pv-ink)]">Set up a talking board</p>
      </header>
      <main className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <p className="text-[0.95rem] text-[var(--pv-ink-soft)]">
          {kidName} taps pictures to say words out loud. Start with a ready-made board and change it any time: add words, use photos of {kidName}'s own things, hide words until they're ready.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--pv-ink-soft)]">Speaks in</span>
          {(["en", "hi"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={language === l}
              onClick={() => setLanguage(l)}
              className={`rounded-full border px-3 py-1 text-sm ${language === l ? "border-[var(--pv-green-700)] bg-[var(--pv-green-700)] text-white" : "border-[var(--pv-border)] text-[var(--pv-ink-soft)]"}`}
            >
              {l === "en" ? "English" : "हिंदी"}
            </button>
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {templates.map((t) => {
          const home = t.pages.find((p) => p.id === t.homePageId) ?? t.pages[0];
          return (
            <button
              key={t.id}
              type="button"
              disabled={busy !== ""}
              onClick={() => make(t.id, { name, language: t.language, rows: t.rows, cols: t.cols, homePageId: t.homePageId, pages: t.pages })}
              className="flex items-center gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-3 text-left"
            >
              <div className="flex flex-shrink-0 gap-1">
                {home.cells.slice(0, 3).map((c) => (c.picture ? <img key={c.id} src={assetUrl(c.picture.url)} alt="" className="h-9 w-9 rounded bg-white object-contain" /> : <span key={c.id} className="h-9 w-9 rounded bg-[var(--pv-green-100)]" />))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.95rem] font-semibold text-[var(--pv-ink)]">{busy === t.id ? "Setting up…" : t.name}</p>
                <p className="text-xs text-[var(--pv-ink-faint)]">
                  {t.rows * t.cols} buttons a page · {t.pages.length} page{t.pages.length === 1 ? "" : "s"} · {t.scope === "CENTRE" ? "From your centre" : "From Pravnya"}
                </p>
              </div>
            </button>
          );
        })}
        <button type="button" disabled={busy !== ""} onClick={() => make("empty", emptyBoard(name, language, 3, 4))} className="self-start text-sm font-semibold text-[var(--pv-ink-soft)]">
          Or start with an empty board (12 buttons a page)
        </button>
      </main>
    </div>
  );
}
