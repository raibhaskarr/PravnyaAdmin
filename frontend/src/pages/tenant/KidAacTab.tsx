import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { AacBoard, AacBoardFields, AacTemplate, Kid } from "../../api/types";
import { BoardEditor, blankBoard } from "../../components/aac/BoardEditor";
import { LANGUAGES } from "../../components/schedules/ScheduleForm";

// A child's AAC (talking) board: the pages and buttons they tap to speak, in the parent app. Made
// from a template (the centre's or Pravnya's) or from scratch; the therapist and the parent can
// both change it (a save never silently overwrites the other's changes).

const fieldsOf = (b: AacBoardFields): AacBoardFields => ({ name: b.name, language: b.language, rows: b.rows, cols: b.cols, homePageId: b.homePageId, pages: b.pages });

function Setup({ kid, onMade }: { kid: Kid; onMade: (b: AacBoard) => void }) {
  const { token } = useAuth();
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [templates, setTemplates] = useState<AacTemplate[]>([]);
  const [size, setSize] = useState("4x6");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api.listAacTemplates(token!, language).then(setTemplates).catch(() => setTemplates([]));
  }, [token, language]);

  async function make(how: string, board: AacBoardFields) {
    setError("");
    setBusy(how);
    try {
      onMade(await api.createAacBoard(token!, kid.id, board));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't make the board.");
    } finally {
      setBusy("");
    }
  }
  const name = `${kid.firstName}'s board`;
  const group = (title: string, list: AacTemplate[]) =>
    list.length ? (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <span className="hint-text">{title}</span>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {list.map((t) => (
            <Button key={t.id} label={`${t.name} · ${t.rows}×${t.cols}`} className="p-button-outlined p-button-sm" loading={busy === t.id} disabled={busy !== ""} onClick={() => make(t.id, { ...fieldsOf(t), name })} />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
      <strong>Set up {kid.firstName}'s talking board</strong>
      <span className="hint-text">
        {kid.firstName} taps buttons to speak, in the Pravnya app (phone or tablet). Start from a template and change it: add words, swap pictures for photos of their own things, hide words until they're ready.{" "}
        <Link to="/tenant/aac-templates">Manage templates</Link>
      </span>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span className="field-label">Speaks in</span>
        <Dropdown value={language} options={LANGUAGES} onChange={(e) => setLanguage(e.value)} />
      </div>
      {group("Your centre's templates", templates.filter((t) => t.scope === "CENTRE"))}
      {group("Pravnya's templates", templates.filter((t) => t.scope === "PRAVNYA"))}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <span className="hint-text">Or start empty:</span>
        <Dropdown value={size} options={["2x2", "2x3", "3x4", "4x5", "4x6", "5x8", "6x10"].map((s) => ({ label: s.replace("x", " × "), value: s }))} onChange={(e) => setSize(e.value)} />
        <Button
          label="Empty board"
          className="p-button-text"
          disabled={busy !== ""}
          onClick={() => {
            const [r, c] = size.split("x").map(Number);
            void make("blank", blankBoard(name, language, r, c));
          }}
        />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

export function KidAacTab({ kid, canEdit }: { kid: Kid; canEdit: boolean }) {
  const { token } = useAuth();
  const [board, setBoard] = useState<AacBoard | null | undefined>(undefined);
  const [draft, setDraft] = useState<AacBoardFields | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [stale, setStale] = useState(false);

  function load() {
    setStale(false);
    api.getAacBoard(token!, kid.id).then((r) => {
      setBoard(r.board);
      setDraft(r.board ? fieldsOf(r.board) : null);
    });
  }
  useEffect(() => {
    setBoard(undefined);
    load();
  }, [token, kid.id]);

  if (board === undefined) return <p className="empty-state">Loading...</p>;
  if (!board || !draft) {
    return canEdit ? (
      <div style={{ maxWidth: 960 }}>
        <Setup
          kid={kid}
          onMade={(b) => {
            setBoard(b);
            setDraft(fieldsOf(b));
          }}
        />
      </div>
    ) : (
      <p className="empty-state">No talking board yet.</p>
    );
  }

  async function run(action: "save" | "template" | "delete") {
    setError("");
    setNote("");
    if (action === "delete" && !window.confirm(`Delete ${kid.firstName}'s board? The family loses it too. You can then start again from a template.`)) return;
    setBusy(action);
    try {
      if (action === "save") {
        const saved = await api.saveAacBoard(token!, board!.id, draft!, board!.version);
        setBoard(saved);
        setDraft(fieldsOf(saved));
        setNote("Saved. It's on the family's phone the next time they open the board.");
      } else if (action === "template") {
        const t = await api.aacTemplateFromBoard(token!, board!.id);
        setNote(`Saved as a centre template${t.droppedPhotos ? `, without ${kid.firstName}'s ${t.droppedPhotos} photo${t.droppedPhotos === 1 ? "" : "s"}` : ""}.`);
      } else {
        await api.deleteAacBoard(token!, board!.id);
        setBoard(null);
        setDraft(null);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStale(true);
      setError(err instanceof ApiError ? (err.message === "Invalid request" ? "Check every button has a label and every folder opens a page." : err.message) : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", maxWidth: 1000 }}>
      {!kid.parentId ? <p className="hint-text">This child has no parent account yet; the family sees the board once they join.</p> : null}
      <span className="hint-text">
        Last changed by {board.updatedByName} on {new Date(board.updatedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.
      </span>
      <BoardEditor value={draft} onChange={setDraft} disabled={!canEdit} photos={{ kind: "kid", kidId: kid.id }} />
      {error ? (
        <p className="error-text">
          {error} {stale ? <Button label="Reload the board" className="p-button-text p-button-sm" onClick={load} /> : null}
        </p>
      ) : null}
      {note ? <span className="hint-text">{note}</span> : null}
      {canEdit ? (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button label="Save board" loading={busy === "save"} disabled={busy !== ""} onClick={() => run("save")} />
          <Button label="Save as centre template" icon="pi pi-clone" className="p-button-outlined" loading={busy === "template"} disabled={busy !== ""} onClick={() => run("template")} />
          <Button label="Delete board" className="p-button-text p-button-danger" loading={busy === "delete"} disabled={busy !== ""} onClick={() => run("delete")} />
        </div>
      ) : null}
    </div>
  );
}
