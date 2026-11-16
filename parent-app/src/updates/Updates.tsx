import { useEffect } from "react";
import { api, type ProgressUpdate } from "../api/client";

function from(u: ProgressUpdate) {
  return u.centreName ? `${u.authorName} · ${u.centreName}` : u.authorName;
}

function sentOn(u: ProgressUpdate) {
  return new Date(u.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Home card for the newest update; unread ones are marked New. */
export function UpdateCard({ update, onOpen }: { update: ProgressUpdate; onOpen: () => void }) {
  const unread = !update.readAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-2xl border bg-[var(--pv-surface)] p-4 text-left transition hover:border-[var(--pv-green-700)] ${unread ? "border-[var(--pv-green-700)]" : "border-[var(--pv-border)]"}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">📝</span>
        <span className="text-sm font-medium text-[var(--pv-ink-faint)]">Update from {from(update)}</span>
        {unread ? <span className="ml-auto rounded-full bg-[var(--pv-green-700)] px-2 py-0.5 text-[0.7rem] font-bold text-white">New</span> : <span className="ml-auto text-xs text-[var(--pv-ink-faint)]">{sentOn(update)}</span>}
      </div>
      <p className="line-clamp-3 whitespace-pre-line text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">{update.body}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--pv-green-700)]">Read the update</p>
    </button>
  );
}

/** Every update for this child, newest first. Opening the screen marks the newest one read. */
export function UpdatesView({ token, kidId, kidName, updates, onBack, onRead }: { token: string; kidId: string; kidName: string; updates: ProgressUpdate[]; onBack: () => void; onRead: (u: ProgressUpdate) => void }) {
  useEffect(() => {
    for (const u of updates) if (!u.readAt) void api.markUpdateRead(token, kidId, u.id).then(onRead).catch(() => {});
    // Only on open: marking read changes `updates`, which mustn't re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-4">
        <button type="button" onClick={onBack} aria-label="Back" className="text-xl text-[var(--pv-ink-soft)]">
          ‹
        </button>
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">Updates about {kidName}</p>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-5 py-6">
        {updates.length === 0 ? <p className="text-[var(--pv-ink-faint)]">No updates yet. When {kidName}'s therapist sends one, it shows up here and in your email.</p> : null}
        {updates.map((u) => (
          <article key={u.id} className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-4">
            <p className="mb-2 text-sm text-[var(--pv-ink-faint)]">
              {from(u)} · {sentOn(u)}
            </p>
            <p lang={u.language} className="whitespace-pre-line text-[0.98rem] leading-relaxed text-[var(--pv-ink)]">
              {u.body}
            </p>
          </article>
        ))}
      </main>
    </div>
  );
}
