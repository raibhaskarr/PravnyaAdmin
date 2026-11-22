import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { Tag } from "primereact/tag";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { ScheduleTemplate, VisualScheduleKind } from "../../api/types";
import { blankSteps, daysText, KIND_LABEL, KINDS, LANGUAGES, printSchedule, ScheduleForm, StepStrip, toApiSteps, type ScheduleFormValue } from "../../components/schedules/ScheduleForm";

// Picture schedule templates. A superadmin looks after Pravnya's (shared with every centre and
// family); centre staff make their centre's own. Therapists and parents start a child's schedule from
// one and get a copy to change, so editing a template never changes a child's schedule.

function TemplateCard({ template, onChanged }: { template: ScheduleTemplate; onChanged: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState<ScheduleFormValue>({ title: template.title, kind: template.kind, language: template.language, days: template.days, time: template.time, steps: template.steps });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function run(action: "save" | "delete") {
    if (action === "delete" && !window.confirm(template.builtIn ? "Hide this Pravnya template for everyone?" : "Delete this template? Schedules already made from it stay as they are.")) return;
    setError("");
    setBusy(action);
    try {
      if (action === "save") {
        await api.editScheduleTemplate(token!, template.id, { ...form, steps: toApiSteps(form.steps) });
        setSaved(true);
      } else {
        await api.deleteScheduleTemplate(token!, template.id);
        onChanged();
      }
    } catch (err) {
      setError(err instanceof ApiError ? (err.message === "Invalid request" ? "Every step needs a label." : err.message) : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <strong>{template.title}</strong> <Tag value={template.scope === "PRAVNYA" ? "Pravnya" : "Centre"} severity={template.scope === "PRAVNYA" ? "info" : "success"} />{" "}
          {template.builtIn ? <Tag value="Built in" /> : null}
          <div className="hint-text">
            {KIND_LABEL[template.kind]} · {template.language === "hi" ? "Hindi" : "English"} · {daysText(template.days)}
            {template.time ? ` · ${template.time}` : ""} · by {template.createdByName}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.3rem" }}>
          <Button label="Print" icon="pi pi-print" className="p-button-text p-button-sm" onClick={() => printSchedule(form)} />
          {template.canEdit ? <Button label={open ? "Close" : "Edit"} className="p-button-text p-button-sm" onClick={() => setOpen(!open)} /> : null}
        </div>
      </div>
      {!open ? (
        <StepStrip steps={template.steps} />
      ) : (
        <>
          <ScheduleForm
            value={form}
            onChange={(v) => {
              setSaved(false);
              setForm(v);
            }}
            disabled={false}
            photos={template.scope === "CENTRE" ? { kind: "centre" } : { kind: "none" }}
            timeHint="Optional. Copies start with this time; each family can change it."
          />
          {error ? <p className="error-text">{error}</p> : null}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <Button label="Save" loading={busy === "save"} disabled={busy !== ""} onClick={() => run("save")} />
            <Button label={template.builtIn ? "Hide" : "Delete"} className="p-button-outlined p-button-danger" loading={busy === "delete"} disabled={busy !== ""} onClick={() => run("delete")} />
            {saved ? <span className="hint-text">Saved. Schedules already made from it don't change.</span> : null}
          </div>
        </>
      )}
    </div>
  );
}

export function ScheduleTemplatesPage() {
  const { token, user } = useAuth();
  const isSuperadmin = user?.role === "SUPERADMIN";
  const canCreate = user?.role !== "VIEWER";
  const [templates, setTemplates] = useState<ScheduleTemplate[] | null>(null);
  const [filter, setFilter] = useState<"all" | "en" | "hi">("all");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [kind, setKind] = useState<VisualScheduleKind>("ROUTINE");
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.listScheduleTemplates(token!, filter === "all" ? undefined : filter).then(setTemplates).catch(() => setTemplates([]));
  }
  useEffect(load, [token, filter]);

  async function make(how: string, call: () => Promise<ScheduleTemplate>) {
    setError("");
    setBusy(how);
    try {
      await call();
      setRequest("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  const centre = (templates ?? []).filter((t) => t.scope === "CENTRE");
  const pravnya = (templates ?? []).filter((t) => t.scope === "PRAVNYA");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", maxWidth: 960 }}>
      <h2 style={{ margin: 0 }}>Picture schedule templates</h2>
      <span className="hint-text">
        {isSuperadmin
          ? "Pravnya's templates are offered to every centre and family. They use symbols only; each therapist or parent can swap in photos on their own copy."
          : "Start a child's schedule from one of these; the child gets a copy you can change, pictures included. Your centre's templates are seen by your staff and the families of your centre's children."}
      </span>
      {canCreate ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <strong>{isSuperadmin ? "New Pravnya template" : "New centre template"}</strong>
          <span className="hint-text">You can also save any child's schedule as a template from the child's Visual schedules tab (their own photos are left out).</span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Dropdown value={language} options={LANGUAGES} onChange={(e) => setLanguage(e.value)} />
            <Dropdown value={kind} options={KINDS} optionLabel="label" optionValue="value" onChange={(e) => setKind(e.value)} />
            <InputText value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Describe it, e.g. getting a haircut, 5 steps" style={{ flex: 1, minWidth: 240 }} maxLength={500} />
            <Button label="Draft" icon="pi pi-file-edit" loading={busy === "ai"} disabled={busy !== "" || request.trim().length < 3} onClick={() => make("ai", () => api.draftScheduleTemplate(token!, { kind, language, request }))} />
            <Button
              label="Blank"
              className="p-button-text"
              disabled={busy !== ""}
              onClick={() =>
                make("blank", () =>
                  api.createScheduleTemplate(token!, { title: request.trim() || (language === "hi" ? "नया टेम्पलेट" : "New template"), kind, language, steps: blankSteps(kind, language === "hi"), days: [], time: null })
                )
              }
            />
          </div>
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
          {centre.length === 0 ? <p className="empty-state">None yet.</p> : null}
          {centre.map((t) => (
            <TemplateCard key={t.id + t.updatedAt} template={t} onChanged={load} />
          ))}
        </>
      ) : null}
      {templates ? (
        <>
          <h3 style={{ margin: "0.4rem 0 0" }}>Pravnya's templates</h3>
          {pravnya.map((t) => (
            <TemplateCard key={t.id + t.updatedAt} template={t} onChanged={load} />
          ))}
        </>
      ) : null}
    </div>
  );
}
