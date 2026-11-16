import { useEffect, useState } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputNumber } from "primereact/inputnumber";
import { InputTextarea } from "primereact/inputtextarea";
import { Tag } from "primereact/tag";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { GuideContent, HomeGuideDetail, HomeGuideRow } from "../../api/types";

// The step-by-step guides parents follow for an activity at home: one per skill, shared by every
// centre. Pravnya drafts one the first time a parent opens a skill; the team checks and edits it
// here and marks it reviewed.

function status(row: HomeGuideRow) {
  if (!row.guide) return <Tag value="No guide yet" severity="info" />;
  if (row.guide.reviewedAt) return <Tag value="Reviewed" severity="success" />;
  return <Tag value={row.guide.aiDrafted ? "Drafted by Pravnya" : "Edited, not reviewed"} severity="warning" />;
}

type Form = Omit<GuideContent, "materials" | "ifItsHard" | "keepItFun"> & { materials: string; ifItsHard: string; keepItFun: string };
const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
const toForm = (c: GuideContent): Form => ({ ...c, steps: c.steps.map((s) => ({ ...s })), materials: c.materials.join("\n"), ifItsHard: c.ifItsHard.join("\n"), keepItFun: c.keepItFun.join("\n") });
const toContent = (f: Form): GuideContent => ({
  ...f,
  summary: f.summary.trim(),
  success: f.success.trim(),
  stopIf: f.stopIf.trim(),
  steps: f.steps.map((s) => ({ title: s.title.trim(), detail: s.detail.trim() })).filter((s) => s.title || s.detail),
  materials: lines(f.materials),
  ifItsHard: lines(f.ifItsHard),
  keepItFun: lines(f.keepItFun)
});

function Label({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

function Editor({ detail, onSaved, onClose }: { detail: HomeGuideDetail; onSaved: () => void; onClose: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState<Form | null>(detail.guide ? toForm(detail.guide.content) : null);
  const [busy, setBusy] = useState<"" | "draft" | "save" | "review">("");
  const [error, setError] = useState("");
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setStep = (i: number, patch: Partial<Form["steps"][number]>) => form && set({ steps: form.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  async function draft() {
    setBusy("draft");
    setError("");
    try {
      const res = await api.draftHomeGuide(token!, detail.skillId);
      if (!res.drafted) setError("Pravnya couldn't draft a guide right now (the AI may be unavailable). You can start from the general steps instead.");
      else onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't draft a guide.");
    } finally {
      setBusy("");
    }
  }

  async function save(reviewed: boolean) {
    if (!form) return;
    setBusy(reviewed ? "review" : "save");
    setError("");
    try {
      await api.saveHomeGuide(token!, detail.skillId, toContent(form), reviewed);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? (err.message === "Invalid request" ? "Check every field is filled in: a summary, at least two steps with a title and detail, at least one way to help, what success looks like and when to stop." : err.message) : "Couldn't save.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span>
          <strong>{detail.skillName}</strong> <span className="hint-text">· {detail.area}</span>
        </span>
        <Button label="Close" className="p-button-text p-button-sm" onClick={onClose} />
      </div>
      {detail.guide?.reviewedAt ? (
        <span className="hint-text">
          Reviewed {new Date(detail.guide.reviewedAt).toLocaleDateString()}
          {detail.guide.reviewedBy ? ` by ${detail.guide.reviewedBy.name}` : ""}. Saving without "Mark reviewed" sets it back to not reviewed.
        </span>
      ) : null}

      {!form ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <p className="hint-text">No guide yet. Parents opening this skill see the general steps until there is one.</p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button label="Draft with Pravnya" icon="pi pi-file-edit" loading={busy === "draft"} disabled={busy !== ""} onClick={draft} />
            <Button label="Start from the general steps" className="p-button-outlined" disabled={busy !== ""} onClick={() => setForm(toForm(detail.general))} />
          </div>
        </div>
      ) : (
        <>
          <label className="field">
            <Label>What it is and why it helps</Label>
            <InputTextarea value={form.summary} onChange={(e) => set({ summary: e.target.value })} rows={2} autoResize className="input" />
          </label>
          <div className="field-grid">
            <label className="field">
              <Label>Minutes</Label>
              <InputNumber value={form.minutes} onValueChange={(e) => set({ minutes: e.value ?? 5 })} min={2} max={20} showButtons />
            </label>
            <label className="field">
              <Label>What you need (one per line)</Label>
              <InputTextarea value={form.materials} onChange={(e) => set({ materials: e.target.value })} rows={2} autoResize className="input" />
            </label>
          </div>
          <Label>Steps</Label>
          {form.steps.map((s, i) => (
            <div key={i} style={{ border: "1px solid var(--surface-200, #e3e7e4)", borderRadius: 8, padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <strong>{i + 1}.</strong>
                <InputText value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Short title" style={{ flex: 1 }} />
                <Button icon="pi pi-trash" className="p-button-text p-button-danger p-button-sm" aria-label={`Remove step ${i + 1}`} onClick={() => set({ steps: form.steps.filter((_, j) => j !== i) })} />
              </div>
              <InputTextarea value={s.detail} onChange={(e) => setStep(i, { detail: e.target.value })} rows={2} autoResize className="input" placeholder="Exactly what to do and say, and what to wait for" />
            </div>
          ))}
          {form.steps.length < 7 ? <Button label="Add a step" icon="pi pi-plus" className="p-button-text p-button-sm" style={{ alignSelf: "flex-start" }} onClick={() => set({ steps: [...form.steps, { title: "", detail: "" }] })} /> : null}
          <label className="field">
            <Label>If it's hard: ways to help, least help first (one per line)</Label>
            <InputTextarea value={form.ifItsHard} onChange={(e) => set({ ifItsHard: e.target.value })} rows={4} autoResize className="input" />
          </label>
          <label className="field">
            <Label>How you'll know it worked</Label>
            <InputTextarea value={form.success} onChange={(e) => set({ success: e.target.value })} rows={2} autoResize className="input" />
          </label>
          <div className="field-grid">
            <label className="field">
              <Label>Keep it fun (one per line)</Label>
              <InputTextarea value={form.keepItFun} onChange={(e) => set({ keepItFun: e.target.value })} rows={3} autoResize className="input" />
            </label>
            <label className="field">
              <Label>When to stop</Label>
              <InputTextarea value={form.stopIf} onChange={(e) => set({ stopIf: e.target.value })} rows={3} autoResize className="input" />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Button label="Save and mark reviewed" icon="pi pi-check" loading={busy === "review"} disabled={busy !== ""} onClick={() => save(true)} />
            <Button label="Save, not reviewed yet" className="p-button-outlined" loading={busy === "save"} disabled={busy !== ""} onClick={() => save(false)} />
          </div>
        </>
      )}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

export function HomeGuidesPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<HomeGuideRow[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<HomeGuideDetail | null>(null);

  function load() {
    api
      .listHomeGuides(token!)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load guides"));
  }
  useEffect(load, [token]);

  async function openSkill(skillId: string) {
    setError("");
    try {
      setOpen(await api.getHomeGuide(token!, skillId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open the guide");
    }
  }

  const toReview = rows?.filter((r) => !r.guide?.reviewedAt).length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", maxWidth: 980 }}>
      <h1>Home activity guides</h1>
      <p className="hint-text">
        The steps parents follow when they open an activity in the app: one guide per skill, shared by every centre. Pravnya drafts a guide the first time a parent opens a skill; check it, edit it and mark it reviewed. Listed: skills
        with active goals, or with a guide.
      </p>
      {error ? <p className="error-text">{error}</p> : null}
      {open ? (
        <Editor
          key={open.skillId + (open.guide?.updatedAt ?? "")}
          detail={open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            load();
            void openSkill(open.skillId);
          }}
        />
      ) : null}
      {rows ? <span className="hint-text">{toReview} of {rows.length} need a review</span> : null}
      <DataTable value={rows ?? []} loading={!rows} dataKey="skillId" onRowClick={(e) => openSkill((e.data as HomeGuideRow).skillId)} rowHover stripedRows size="small" emptyMessage="No skills in use yet.">
        <Column field="area" header="Area" sortable />
        <Column field="skillName" header="Skill" sortable />
        <Column field="activeGoals" header="Active goals" sortable />
        <Column header="Guide" body={status} />
      </DataTable>
    </div>
  );
}
