import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { Tag } from "primereact/tag";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { AacBoardFields, AacTemplate } from "../../api/types";
import { BoardEditor, blankBoard } from "../../components/aac/BoardEditor";
import { LANGUAGES } from "../../components/schedules/ScheduleForm";

// AAC board templates. A superadmin looks after Pravnya's (offered to every centre and family);
// centre staff make their centre's own. A child's board made from one is a copy, so editing a
// template never changes a child's board.

const fieldsOf = (b: AacBoardFields): AacBoardFields => ({ name: b.name, language: b.language, rows: b.rows, cols: b.cols, homePageId: b.homePageId, pages: b.pages });

function TemplateCard({ t, isSuperadmin, canCreate, onChanged }: { t: AacTemplate; isSuperadmin: boolean; canCreate: boolean; onChanged: () => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(fieldsOf(t));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function run(action: "save" | "delete" | "copy") {
    if (action === "delete" && !window.confirm(t.builtIn ? "Hide this Pravnya template for everyone?" : "Delete this template? Boards already made from it stay as they are.")) return;
    setError("");
    setBusy(action);
    try {
      if (action === "save") {
        await api.saveAacTemplate(token!, t.id, draft);
        setSaved(true);
      } else if (action === "copy") {
        await api.createAacTemplate(token!, { ...fieldsOf(t), name: `${t.name} (our copy)` });
        onChanged();
      } else {
        await api.deleteAacTemplate(token!, t.id);
        onChanged();
      }
    } catch (err) {
      setError(err instanceof ApiError ? (err.message === "Invalid request" ? "Check every button has a label and every folder opens a page." : err.message) : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap" }}>
        <div>
          <strong>{t.name}</strong> <Tag value={t.scope === "PRAVNYA" ? "Pravnya" : "Centre"} severity={t.scope === "PRAVNYA" ? "info" : "success"} /> {t.builtIn ? <Tag value="Built in" /> : null}
          <div className="hint-text">
            {t.language === "hi" ? "Hindi" : "English"} · {t.rows} × {t.cols} · {t.pages.length} page{t.pages.length === 1 ? "" : "s"} · {t.pages.reduce((n, p) => n + p.cells.length, 0)} buttons · by {t.createdByName}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.3rem" }}>
          {!isSuperadmin && canCreate && t.scope === "PRAVNYA" ? <Button label="Copy to our centre" icon="pi pi-clone" className="p-button-text p-button-sm" loading={busy === "copy"} disabled={busy !== ""} onClick={() => run("copy")} /> : null}
          <Button label={open ? "Close" : t.canEdit ? "Edit" : "View"} className="p-button-text p-button-sm" onClick={() => setOpen(!open)} />
        </div>
      </div>
      {open ? (
        <>
          <BoardEditor
            value={draft}
            onChange={(v) => {
              setSaved(false);
              setDraft(v);
            }}
            disabled={!t.canEdit}
            photos={t.scope === "CENTRE" ? { kind: "centre" } : { kind: "none" }}
          />
          {error ? <p className="error-text">{error}</p> : null}
          {t.canEdit ? (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <Button label="Save template" loading={busy === "save"} disabled={busy !== ""} onClick={() => run("save")} />
              <Button label={t.builtIn ? "Hide" : "Delete"} className="p-button-outlined p-button-danger" loading={busy === "delete"} disabled={busy !== ""} onClick={() => run("delete")} />
              {saved ? <span className="hint-text">Saved. Boards already made from it don't change.</span> : null}
            </div>
          ) : null}
        </>
      ) : null}
      {!open && error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

export function AacTemplatesPage() {
  const { token, user } = useAuth();
  const isSuperadmin = user?.role === "SUPERADMIN";
  const canCreate = user?.role !== "VIEWER";
  const [templates, setTemplates] = useState<AacTemplate[] | null>(null);
  const [filter, setFilter] = useState<"all" | "en" | "hi">("all");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [size, setSize] = useState("4x6");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function load() {
    api.listAacTemplates(token!, filter === "all" ? undefined : filter).then(setTemplates).catch(() => setTemplates([]));
  }
  useEffect(load, [token, filter]);

  async function create() {
    setError("");
    setBusy(true);
    try {
      const [r, c] = size.split("x").map(Number);
      await api.createAacTemplate(token!, blankBoard(language === "hi" ? "नया बोर्ड" : "New board", language, r, c));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const centre = (templates ?? []).filter((t) => t.scope === "CENTRE");
  const pravnya = (templates ?? []).filter((t) => t.scope === "PRAVNYA");
  const card = (t: AacTemplate) => <TemplateCard key={t.id + t.updatedAt} t={t} isSuperadmin={isSuperadmin} canCreate={canCreate} onChanged={load} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", maxWidth: 1000 }}>
      <h2 style={{ margin: 0 }}>AAC board templates</h2>
      <span className="hint-text">
        {isSuperadmin
          ? "Pravnya's templates are offered to every centre and family. They use symbols only; therapists and parents can swap in photos on a child's copy."
          : "Start a child's talking board from one of these (child → AAC board tab). Your centre's templates are seen by your staff and your families. You can also save any child's board as a template from their AAC board tab (their photos are left out)."}
      </span>
      {canCreate ? (
        <div className="card" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <strong>{isSuperadmin ? "New Pravnya template" : "New centre template"}</strong>
          <Dropdown value={language} options={LANGUAGES} onChange={(e) => setLanguage(e.value)} />
          <Dropdown value={size} options={["2x2", "2x3", "3x4", "4x5", "4x6", "5x8", "6x10"].map((s) => ({ label: s.replace("x", " × "), value: s }))} onChange={(e) => setSize(e.value)} />
          <Button label="Create empty template" loading={busy} onClick={create} />
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span className="field-label">Show</span>
        <Dropdown
          value={filter}
          options={[
            { label: "All languages", value: "all" },
            { label: "English", value: "en" },
            { label: "Hindi", value: "hi" }
          ]}
          onChange={(e) => setFilter(e.value)}
        />
      </div>
      {!templates ? <p className="empty-state">Loading...</p> : null}
      {templates && !isSuperadmin ? (
        <>
          <h3 style={{ margin: "0.4rem 0 0" }}>Your centre's templates</h3>
          {centre.length === 0 ? <p className="empty-state">None yet. Copy one of Pravnya's below to make it your own.</p> : null}
          {centre.map(card)}
        </>
      ) : null}
      {templates ? (
        <>
          <h3 style={{ margin: "0.4rem 0 0" }}>Pravnya's templates</h3>
          {pravnya.map(card)}
        </>
      ) : null}
    </div>
  );
}
