import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputTextarea } from "primereact/inputtextarea";
import { Tag } from "primereact/tag";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { ProgressUpdate } from "../../api/types";

const PERIODS = [
  { label: "Last 7 days", value: "week" },
  { label: "Last 30 days", value: "month" }
] as const;
const LANGUAGES = [
  { label: "English", value: "en" },
  { label: "Hindi", value: "hi" }
] as const;
const TREND: Record<string, string> = { up: "↑ better than before", steady: "→ about the same", down: "↓ harder lately" };

function day(date: string) {
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** What the draft rests on: per-goal figures computed from the logs, shown next to the text. */
function StatsPanel({ update }: { update: ProgressUpdate }) {
  const { stats } = update;
  return (
    <div className="card" style={{ background: "var(--surface-50, #f7f7f5)" }}>
      <span className="field-label">
        Based on {stats.totalEntries} logged {stats.totalEntries === 1 ? "entry" : "entries"}, {day(update.periodStart)} – {day(update.periodEnd)}
      </span>
      {stats.goals.length === 0 ? <p className="hint-text">Nothing was logged in this period.</p> : null}
      <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
        {stats.goals.map((g) => (
          <li key={g.goalTitle} style={{ marginBottom: "0.3rem" }}>
            <strong>{g.goalTitle}</strong>: {g.correct} of {g.entries} correct, {g.independent} independent · {g.atCentre} at centre, {g.atHome} at home
            {g.trend ? <span className="hint-text"> · {TREND[g.trend]}</span> : null}
            {g.firstTimeIndependent.length ? <span className="hint-text"> · first time on their own: {g.firstTimeIndependent.join(", ")}</span> : null}
          </li>
        ))}
      </ul>
      {stats.notPractised.length ? <p className="hint-text" style={{ marginBottom: 0 }}>Not practised: {stats.notPractised.join(", ")}</p> : null}
    </div>
  );
}

function DraftEditor({ update, hasParent, canEdit, onChanged }: { update: ProgressUpdate; hasParent: boolean; canEdit: boolean; onChanged: () => void }) {
  const { token } = useAuth();
  const [body, setBody] = useState(update.body);
  const [busy, setBusy] = useState<"" | "save" | "send" | "delete">("");
  const [error, setError] = useState("");
  const dirty = body !== update.body;

  async function run(kind: "save" | "send" | "delete") {
    setError("");
    if (kind === "send" && !window.confirm("Send this update to the parent? They'll see it in the Pravnya app and get it by email. It can't be changed after sending.")) return;
    if (kind === "delete" && !window.confirm("Delete this draft?")) return;
    setBusy(kind);
    try {
      if (kind !== "delete" && dirty) await api.editProgressUpdate(token!, update.id, body);
      if (kind === "send") await api.sendProgressUpdate(token!, update.id);
      if (kind === "delete") await api.deleteProgressUpdate(token!, update.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <Tag value="Draft" severity="warning" />
        <span className="hint-text">
          {update.language === "hi" ? "Hindi" : "English"} · {update.aiDrafted ? "drafted by Pravnya from the logs, check every line" : "written from a template (Pravnya's AI was unavailable)"}
        </span>
      </div>
      <InputTextarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="input" autoResize disabled={!canEdit} />
      <StatsPanel update={update} />
      {error ? <p className="error-text">{error}</p> : null}
      {canEdit ? (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button label={hasParent ? "Send to parent" : "No parent account to send to"} icon="pi pi-send" disabled={!hasParent || !body.trim() || busy !== ""} loading={busy === "send"} onClick={() => run("send")} />
          <Button label="Save draft" className="p-button-outlined" disabled={!dirty || !body.trim() || busy !== ""} loading={busy === "save"} onClick={() => run("save")} />
          <Button label="Delete draft" className="p-button-outlined p-button-danger" disabled={busy !== ""} loading={busy === "delete"} onClick={() => run("delete")} />
        </div>
      ) : null}
    </div>
  );
}

function SentUpdate({ update }: { update: ProgressUpdate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <span>
          <strong>{day(update.periodStart)} – {day(update.periodEnd)}</strong> <span className="hint-text">by {update.authorName}</span>
        </span>
        <span className="hint-text">
          Sent {new Date(update.sentAt!).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          {update.emailedAt ? " · emailed" : " · email not sent"}
          {update.readAt ? " · read in the app" : ""}
        </span>
      </div>
      <p style={{ whiteSpace: "pre-wrap", margin: "0.5rem 0 0", maxHeight: open ? undefined : "4.5em", overflow: "hidden" }}>{update.body}</p>
      <button type="button" className="link-button" onClick={() => setOpen(!open)} style={{ background: "none", border: 0, padding: 0, color: "var(--primary-color)", cursor: "pointer", marginTop: "0.3rem" }}>
        {open ? "Show less" : "Show all"}
      </button>
    </div>
  );
}

// Progress updates to the parent: Pravnya drafts from the period's logs, staff edit and send.
// The parent sees sent updates in the parent app and gets them by email.
export function KidUpdatesTab({ kidId, hasParent, canEdit }: { kidId: string; hasParent: boolean; canEdit: boolean }) {
  const { token } = useAuth();
  const [updates, setUpdates] = useState<ProgressUpdate[] | null>(null);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    api.listProgressUpdates(token!, kidId).then(setUpdates);
  }
  useEffect(() => {
    setUpdates(null);
    load();
  }, [token, kidId]);

  async function draft() {
    setError("");
    setDrafting(true);
    try {
      await api.draftProgressUpdate(token!, { kidId, period, language });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't write a draft. Try again.");
    } finally {
      setDrafting(false);
    }
  }

  if (!updates) return <p className="empty-state">Loading...</p>;
  const drafts = updates.filter((u) => u.status === "DRAFT");
  const sent = updates.filter((u) => u.status === "SENT");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", maxWidth: 760 }}>
      {!hasParent ? <p className="hint-text">This child has no parent account yet, so updates can be drafted but not sent. Add the parent on the Parent tab.</p> : null}
      {canEdit ? (
        <div className="page-toolbar" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <Dropdown value={period} options={[...PERIODS]} onChange={(e) => setPeriod(e.value)} />
          <Dropdown value={language} options={[...LANGUAGES]} onChange={(e) => setLanguage(e.value)} />
          <Button label={drafting ? "Writing..." : "Write update"} icon="pi pi-pencil" loading={drafting} onClick={draft} />
          <span className="hint-text">Pravnya drafts it from what's been logged. You edit it, then send.</span>
        </div>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      {drafts.map((u) => (
        <DraftEditor key={u.id + u.body.length} update={u} hasParent={hasParent} canEdit={canEdit} onChanged={load} />
      ))}
      <span className="field-label">Sent</span>
      {sent.length === 0 ? <p className="empty-state">No updates sent yet.</p> : sent.map((u) => <SentUpdate key={u.id} update={u} />)}
    </div>
  );
}
