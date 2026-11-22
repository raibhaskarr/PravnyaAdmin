import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { Tag } from "primereact/tag";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Kid, ScheduleTemplate, VisualSchedule, VisualScheduleKind } from "../../api/types";
import { blankSteps, daysText, KIND_LABEL, KINDS, LANGUAGES, printSchedule, ScheduleForm, StepStrip, toApiSteps, type ScheduleFormValue } from "../../components/schedules/ScheduleForm";

// Visual (picture) schedules: First/Then boards, routines and day plans the parent shows the child
// in the app, one picture per step, read aloud. Start from a template (the centre's or Pravnya's),
// ask Pravnya, or build one; then change anything, including swapping pictures for photos.

function timingText(s: VisualSchedule) {
  const t = s.timing;
  const usage = s.usedDays ? ` · opened on ${s.usedDays} day${s.usedDays === 1 ? "" : "s"} in the last 4 weeks` : s.status === "ACTIVE" ? " · not opened yet" : "";
  if (!t.time) return `No set time${usage}`;
  return `${t.source === "learned" ? "Usually around" : "At"} ${t.time}${t.source === "learned" ? " (learned from use)" : ""}${s.remind ? ", with a reminder" : ""}${usage}`;
}

function ScheduleCard({ schedule, kidId, canEdit, onChanged }: { schedule: VisualSchedule; kidId: string; canEdit: boolean; onChanged: () => void }) {
  const { token, user } = useAuth();
  const [form, setForm] = useState<ScheduleFormValue>({ title: schedule.title, kind: schedule.kind, language: schedule.language, days: schedule.days, time: schedule.time, steps: schedule.steps });
  const [remind, setRemind] = useState(schedule.remind);
  const [open, setOpen] = useState(schedule.status === "DRAFT");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const byParent = schedule.source === "PARENT";
  const editable = canEdit && schedule.status !== "ARCHIVED" && !byParent;

  async function run(action: "save" | "publish" | "archive" | "delete" | "template") {
    setError("");
    setNote("");
    setBusy(action);
    try {
      if (action === "save" || action === "publish") {
        await api.editVisualSchedule(token!, schedule.id, { ...form, remind, steps: toApiSteps(form.steps) });
      }
      if (action === "publish") await api.publishVisualSchedule(token!, schedule.id);
      if (action === "archive") await api.archiveVisualSchedule(token!, schedule.id);
      if (action === "delete") await api.deleteVisualSchedule(token!, schedule.id);
      if (action === "template") {
        const t = await api.scheduleTemplateFromSchedule(token!, schedule.id);
        setNote(`Saved as a centre template${t.droppedPhotos ? `, without this child's photo${t.droppedPhotos === 1 ? "" : "s"} (pick a symbol or centre photo in the template)` : ""}.`);
      } else if (action === "save") setNote(schedule.status === "ACTIVE" ? "Saved. The parent sees the change right away." : "Saved.");
      else onChanged();
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
          <strong>{schedule.title}</strong>{" "}
          <Tag value={schedule.status === "ACTIVE" ? "Published" : schedule.status === "DRAFT" ? "Draft" : "Archived"} severity={schedule.status === "ACTIVE" ? "success" : schedule.status === "DRAFT" ? "warning" : undefined} />
          <div className="hint-text">
            {KIND_LABEL[schedule.kind]} · {daysText(schedule.days)} · {schedule.language === "hi" ? "Hindi" : "English"} · by {schedule.authorName}
            {byParent ? " (parent, in the app)" : ""}
          </div>
          <div className="hint-text">{timingText(schedule)}</div>
        </div>
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
          {canEdit && user?.role !== "VIEWER" ? (
            <Button label="Save as centre template" icon="pi pi-clone" className="p-button-text p-button-sm" loading={busy === "template"} disabled={busy !== ""} onClick={() => run("template")} />
          ) : null}
          <Button label="Print" icon="pi pi-print" className="p-button-text p-button-sm" onClick={() => printSchedule(form)} />
          <Button label={open ? "Close" : editable ? "Edit" : "View"} className="p-button-text p-button-sm" onClick={() => setOpen(!open)} />
        </div>
      </div>
      {!open ? (
        <StepStrip steps={schedule.steps} />
      ) : (
        <>
          {schedule.status === "DRAFT" && schedule.aiDrafted ? <span className="hint-text">Drafted by Pravnya. Check each step and picture before publishing.</span> : null}
          {byParent ? <span className="hint-text">The parent made this schedule in the app, so only they can change it.</span> : null}
          <ScheduleForm
            value={form}
            onChange={setForm}
            disabled={!editable}
            photos={{ kind: "kid", kidId }}
            timeHint="Leave empty and Pravnya learns it from when the family opens the schedule. The family can change it."
            extra={
              <label className="field" style={{ flexDirection: "row", gap: "0.4rem", alignItems: "center" }}>
                <Checkbox checked={remind} onChange={(e) => setRemind(!!e.checked)} disabled={!editable} />
                Remind the parent at that time (if they turned on notifications)
              </label>
            }
          />
          {error ? <p className="error-text">{error}</p> : null}
          {editable ? (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <Button label="Save" className="p-button-outlined" loading={busy === "save"} disabled={busy !== ""} onClick={() => run("save")} />
              {schedule.status === "DRAFT" ? <Button label="Publish to parent" loading={busy === "publish"} disabled={busy !== ""} onClick={() => run("publish")} /> : null}
              {schedule.status === "DRAFT" ? (
                <Button label="Delete draft" className="p-button-outlined p-button-danger" loading={busy === "delete"} disabled={busy !== ""} onClick={() => run("delete")} />
              ) : (
                <Button label="Archive" className="p-button-outlined p-button-secondary" loading={busy === "archive"} disabled={busy !== ""} onClick={() => run("archive")} />
              )}
            </div>
          ) : null}
        </>
      )}
      {note ? <span className="hint-text">{note}</span> : null}
      {!open && error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

function TemplateButtons({ title, templates, busy, onPick }: { title: string; templates: ScheduleTemplate[]; busy: string; onPick: (t: ScheduleTemplate) => void }) {
  if (!templates.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <span className="hint-text">{title}</span>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {templates.map((t) => (
          <Button key={t.id} label={`${t.title} (${KIND_LABEL[t.kind]})`} className="p-button-outlined p-button-sm" loading={busy === t.id} disabled={busy !== ""} onClick={() => onPick(t)} />
        ))}
      </div>
    </div>
  );
}

export function KidVisualSchedulesTab({ kid, canEdit }: { kid: Kid; canEdit: boolean }) {
  const { token } = useAuth();
  const [schedules, setSchedules] = useState<VisualSchedule[] | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [kind, setKind] = useState<VisualScheduleKind>("ROUTINE");
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.listVisualSchedules(token!, kid.id).then(setSchedules);
  }
  useEffect(() => {
    setSchedules(null);
    load();
  }, [token, kid.id]);
  useEffect(() => {
    api.listScheduleTemplates(token!, language).then(setTemplates).catch(() => setTemplates([]));
  }, [token, language]);

  async function make(how: string, call: () => Promise<VisualSchedule>) {
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

  if (!schedules) return <p className="empty-state">Loading...</p>;
  const fromTemplate = (t: ScheduleTemplate) => make(t.id, () => api.visualScheduleFromTemplate(token!, { kidId: kid.id, templateId: t.id }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", maxWidth: 960 }}>
      {!kid.parentId ? <p className="hint-text">This child has no parent account yet. Schedules can be made now; the parent sees published ones once they join.</p> : null}
      {canEdit ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          <strong>New picture schedule</strong>
          <span className="hint-text">The parent shows it to {kid.firstName} in the Pravnya app: one picture per step, read aloud, ticked off as they go. You can also print it.</span>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="field-label">Language</span>
            <Dropdown value={language} options={LANGUAGES} onChange={(e) => setLanguage(e.value)} />
          </div>
          <div className="field">
            <span className="field-label">Start from a template</span>
            <span className="hint-text">
              You get a copy for {kid.firstName}: change any step or swap a picture for a photo of their own things. <Link to="/tenant/schedule-templates">Manage templates</Link>
            </span>
            <TemplateButtons title="Your centre's" templates={templates.filter((t) => t.scope === "CENTRE")} busy={busy} onPick={fromTemplate} />
            <TemplateButtons title="Pravnya's" templates={templates.filter((t) => t.scope === "PRAVNYA")} busy={busy} onPick={fromTemplate} />
          </div>
          <div className="field">
            <span className="field-label">Or describe it and Pravnya drafts it</span>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Dropdown value={kind} options={KINDS} optionLabel="label" optionValue="value" onChange={(e) => setKind(e.value)} />
              <InputText value={request} onChange={(e) => setRequest(e.target.value)} placeholder="e.g. getting ready for the bath, 5 steps" style={{ flex: 1, minWidth: 240 }} maxLength={500} />
              <Button
                label="Draft"
                icon="pi pi-file-edit"
                loading={busy === "ai"}
                disabled={busy !== "" || request.trim().length < 3}
                onClick={() => make("ai", () => api.draftVisualSchedule(token!, { kidId: kid.id, kind, language, request }))}
              />
              <Button
                label="Blank"
                className="p-button-text"
                disabled={busy !== ""}
                onClick={() =>
                  make("blank", () =>
                    api.createVisualSchedule(token!, { kidId: kid.id, title: request.trim() || (language === "hi" ? "नया शेड्यूल" : "New schedule"), kind, language, steps: blankSteps(kind, language === "hi"), days: [] })
                  )
                }
              />
            </div>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      ) : null}
      {schedules.length === 0 ? <p className="empty-state">No picture schedules yet.</p> : null}
      {schedules.map((s) => (
        <ScheduleCard key={s.id + s.status + s.steps.length} schedule={s} kidId={kid.id} canEdit={canEdit} onChanged={load} />
      ))}
    </div>
  );
}
