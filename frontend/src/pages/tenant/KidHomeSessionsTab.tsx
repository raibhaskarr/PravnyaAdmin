import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Tag } from "primereact/tag";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Goal, HomeSession, HomeSessionRun, Kid, SessionActivity, SessionPlan, SessionSchedule } from "../../api/types";

// Home sessions: the therapist builds a guided practice session from the child's goals and items
// (Pravnya can draft it), publishes it, and the parent runs it in the app with Pravnya guiding each
// try. Every try is logged against the goal; each run shows up here as a report.

const TYPES = [
  { value: "DISCRETE_TRIAL", label: "Discrete trial (ABA)" },
  { value: "RECEPTIVE_ID", label: "Identify / receptive (touch, give me)" },
  { value: "EXPRESSIVE_LABEL", label: "Label / name it" },
  { value: "AAC_LABEL", label: "Label on AAC device" },
  { value: "ARTICULATION", label: "Articulation" },
  { value: "REQUESTING", label: "Requesting (mand)" },
  { value: "FOLLOW_DIRECTIONS", label: "Following directions" },
  { value: "IMITATION", label: "Imitation" },
  { value: "OTHER", label: "Other" }
];
const HELP = [
  { value: "VISUAL_PROMPT", label: "Visual" },
  { value: "GESTURAL_PROMPT", label: "Gesture / point" },
  { value: "VERBAL_PROMPT", label: "Verbal / model" },
  { value: "PHYSICAL_PROMPT", label: "Physical" },
  { value: "PARTIAL_ASSISTANCE", label: "Partial assistance" },
  { value: "FULL_ASSISTANCE", label: "Full assistance" }
];
const HELP_LABEL = Object.fromEntries(HELP.map((h) => [h.value, h.label]));
const MODALITIES = [
  { value: "VERBAL", label: "Speaks" },
  { value: "AAC", label: "AAC device" },
  { value: "MANUAL_SIGN", label: "Sign" },
  { value: "GESTURAL", label: "Gesture / points" },
  { value: "NOT_APPLICABLE", label: "Does an action" }
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LANGUAGES = [
  { label: "English", value: "en" },
  { label: "Hindi", value: "hi" }
];

function date(d: string) {
  return new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function scheduleText(s: SessionSchedule) {
  if (s.kind === "once") return "Once";
  return `Every ${s.days.length === 7 ? "day" : s.days.join(", ")}${s.until ? ` until ${new Date(s.until).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}`;
}

function itemLabel(i: Goal["items"][number]) {
  return i.canonicalSkillItem?.displayName ?? i.customText ?? "";
}

function ScheduleEditor({ value, onChange, disabled }: { value: SessionSchedule; onChange: (s: SessionSchedule) => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
      <Dropdown
        value={value.kind}
        options={[
          { label: "Once", value: "once" },
          { label: "Weekly, on chosen days", value: "weekly" }
        ]}
        onChange={(e) => onChange(e.value === "once" ? { kind: "once" } : { kind: "weekly", days: ["Mon", "Wed", "Fri"], until: null })}
        disabled={disabled}
      />
      {value.kind === "weekly" ? (
        <>
          {DAYS.map((d) => (
            <label key={d} style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
              <Checkbox
                checked={value.days.includes(d)}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, days: e.checked ? DAYS.filter((x) => x === d || value.days.includes(x)) : value.days.filter((x) => x !== d) })}
              />
              {d}
            </label>
          ))}
          <span className="hint-text">until</span>
          <Calendar
            value={value.until ? new Date(value.until) : null}
            onChange={(e) => onChange({ ...value, until: e.value ? (e.value as Date).toLocaleDateString("en-CA") : null })}
            dateFormat="dd/mm/yy"
            showIcon
            showButtonBar
            placeholder="no end date"
            minDate={new Date()}
            inputClassName="input"
            disabled={disabled}
          />
        </>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function ActivityEditor({ a, goal, onChange, onRemove, disabled }: { a: SessionActivity; goal: Goal | undefined; onChange: (a: SessionActivity) => void; onRemove: () => void; disabled: boolean }) {
  const set = (patch: Partial<SessionActivity>) => onChange({ ...a, ...patch });
  const available = (goal?.items ?? []).map((i) => ({ goalItemId: i.id, label: itemLabel(i) })).filter((i) => i.label);
  const area = (label: string, key: "setup" | "instruction" | "correctLooksLike" | "errorCorrection" | "reinforcement", rows = 2) => (
    <Field label={label}>
      <InputTextarea value={a[key]} onChange={(e) => set({ [key]: e.target.value })} rows={rows} autoResize className="input" disabled={disabled} />
    </Field>
  );
  return (
    <div style={{ border: "1px solid var(--surface-200, #e3e7e4)", borderRadius: 8, padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <strong>{a.goalTitle}</strong>
        {!disabled ? <Button label="Remove" className="p-button-text p-button-danger p-button-sm" onClick={onRemove} /> : null}
      </div>
      <div className="field-grid">
        <Field label="Activity type">
          <Dropdown value={a.type} options={TYPES} onChange={(e) => set({ type: e.value })} disabled={disabled} />
        </Field>
        <Field label="The child responds by">
          <Dropdown value={a.modality} options={MODALITIES} onChange={(e) => set({ modality: e.value })} disabled={disabled} />
        </Field>
      </div>
      <span className="field-label">Items to practise</span>
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
        {available.map((i) => (
          <label key={i.goalItemId} style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
            <Checkbox
              checked={a.items.some((x) => x.goalItemId === i.goalItemId)}
              disabled={disabled}
              onChange={(e) => set({ items: e.checked ? [...a.items, i] : a.items.filter((x) => x.goalItemId !== i.goalItemId) })}
            />
            {i.label}
          </label>
        ))}
      </div>
      <div className="field-grid">
        <Field label="Tries per item">
          <InputNumber value={a.trialsPerItem} onValueChange={(e) => set({ trialsPerItem: e.value ?? 1 })} min={1} max={10} showButtons disabled={disabled} />
        </Field>
        <Field label="Move on after this many misses in a row">
          <InputNumber value={a.missesBeforeMovingOn} onValueChange={(e) => set({ missesBeforeMovingOn: e.value ?? 2 })} min={1} max={5} showButtons disabled={disabled} />
        </Field>
      </div>
      {area("Setup: what to get ready", "setup")}
      {area('What the parent says or does each try (use {item} for the item)', "instruction")}
      {area("What counts as correct", "correctLooksLike")}
      <span className="field-label">Help, least first</span>
      {a.prompts.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Dropdown value={p.supportLevel} options={HELP} onChange={(e) => set({ prompts: a.prompts.map((x, j) => (j === i ? { ...x, supportLevel: e.value } : x)) })} disabled={disabled} style={{ minWidth: 170 }} />
          <InputText value={p.say} onChange={(e) => set({ prompts: a.prompts.map((x, j) => (j === i ? { ...x, say: e.target.value } : x)) })} style={{ flex: 1 }} disabled={disabled} />
          {!disabled && a.prompts.length > 1 ? <Button icon="pi pi-trash" className="p-button-text p-button-danger p-button-sm" aria-label="Remove this help" onClick={() => set({ prompts: a.prompts.filter((_, j) => j !== i) })} /> : null}
        </div>
      ))}
      {!disabled && a.prompts.length < 5 ? (
        <Button label="Add a help" icon="pi pi-plus" className="p-button-text p-button-sm" style={{ alignSelf: "flex-start" }} onClick={() => set({ prompts: [...a.prompts, { supportLevel: "PHYSICAL_PROMPT", say: "" }] })} />
      ) : null}
      {area("After a miss (error correction)", "errorCorrection")}
      {area("Reward", "reinforcement", 1)}
    </div>
  );
}

/** One run: summary and every try, with the help needed. */
function RunReport({ run, plan }: { run: HomeSessionRun; plan: SessionPlan }) {
  const [open, setOpen] = useState(false);
  const titleByKey = new Map(plan.activities.map((a) => [a.key, a.goalTitle]));
  const own = run.results.filter((r) => r.outcome === "CORRECT" && r.supportLevel === "INDEPENDENT").length;
  return (
    <div style={{ borderTop: "1px solid var(--surface-200, #e3e7e4)", paddingTop: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <span>
          <strong>{date(run.startedAt)}</strong>{" "}
          <Tag value={run.status === "COMPLETED" ? "Completed" : run.status === "ENDED_EARLY" ? "Ended early" : "In progress"} severity={run.status === "COMPLETED" ? "success" : run.status === "ENDED_EARLY" ? "warning" : "info"} />{" "}
          <span className="hint-text">
            {run.results.length} tries · {own} on their own
          </span>
        </span>
        <button type="button" onClick={() => setOpen(!open)} style={{ background: "none", border: 0, padding: 0, color: "var(--primary-color)", cursor: "pointer" }}>
          {open ? "Hide report" : "Full report"}
        </button>
      </div>
      {open ? (
        <div style={{ marginTop: "0.4rem" }}>
          {run.summary ? <p style={{ whiteSpace: "pre-line", margin: "0 0 0.4rem" }}>{run.summary}</p> : null}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>#</th>
                <th>Activity</th>
                <th>Item</th>
                <th>Result</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {run.results.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--surface-100, #eef1ef)" }}>
                  <td>{i + 1}</td>
                  <td>{titleByKey.get(r.activityKey) ?? "—"}</td>
                  <td>{r.itemLabel}</td>
                  <td>{r.outcome === "INCORRECT" ? "Not yet" : r.supportLevel === "INDEPENDENT" ? "On their own" : `With help: ${HELP_LABEL[r.supportLevel] ?? r.supportLevel}`}</td>
                  <td>{new Date(r.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function SessionCard({ session, goals, canEdit, onChanged }: { session: HomeSession; goals: Goal[]; canEdit: boolean; onChanged: () => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(session.status === "DRAFT");
  const [title, setTitle] = useState(session.title);
  const [schedule, setSchedule] = useState<SessionSchedule>(session.schedule);
  const [plan, setPlan] = useState<SessionPlan>(session.plan);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const editable = canEdit && session.status !== "ARCHIVED";
  const goalsById = new Map(goals.map((g) => [g.id, g]));
  const totalTries = plan.activities.reduce((n, a) => n + a.items.length * a.trialsPerItem, 0);

  async function run(kind: "save" | "publish" | "archive" | "delete") {
    setError("");
    setSaved(false);
    if (kind === "publish" && !window.confirm("Publish this session? The parent will see it in the Pravnya app and can start it.")) return;
    if (kind === "archive" && !window.confirm("Archive this session? The parent won't see it any more. Its reports stay here.")) return;
    if (kind === "delete" && !window.confirm("Delete this draft?")) return;
    setBusy(kind);
    try {
      if (kind === "delete") await api.deleteHomeSession(token!, session.id);
      else if (kind === "archive") await api.archiveHomeSession(token!, session.id);
      else {
        await api.editHomeSession(token!, session.id, { title: title.trim(), schedule, plan });
        if (kind === "publish") await api.publishHomeSession(token!, session.id);
        if (kind === "save") setSaved(true);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? (err.message === "Invalid request" ? "Check every activity: at least one item, and every text box and help filled in. A session can have up to 60 tries." : err.message) : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  const status = session.status === "DRAFT" ? <Tag value="Draft" severity="warning" /> : session.status === "ACTIVE" ? <Tag value="Published" severity="success" /> : <Tag value="Archived" />;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span>
          {status} <strong>{session.title}</strong>{" "}
          <span className="hint-text">
            · {scheduleText(session.schedule)} · {session.language === "hi" ? "Hindi" : "English"} · {session.plan.activities.length} activities · {session.runs.length} run{session.runs.length === 1 ? "" : "s"}
          </span>
        </span>
        <button type="button" onClick={() => setOpen(!open)} style={{ background: "none", border: 0, padding: 0, color: "var(--primary-color)", cursor: "pointer" }}>
          {open ? "Close" : editable ? "Open and edit" : "Open"}
        </button>
      </div>
      {session.status === "DRAFT" && session.aiDrafted ? <span className="hint-text">Drafted by Pravnya from the goals and logs. Check every activity before publishing.</span> : null}
      {session.skippedGoals?.length ? <span className="hint-text">Left out (no items yet): {session.skippedGoals.join(", ")}</span> : null}

      {open ? (
        <>
          <div className="field-grid">
            <Field label="Title">
              <InputText value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} />
            </Field>
            <div className="field">
              <span className="field-label">When</span>
              <ScheduleEditor value={schedule} onChange={setSchedule} disabled={!editable} />
            </div>
          </div>
          <Field label="What Pravnya says at the start">
            <InputTextarea value={plan.intro} onChange={(e) => setPlan({ ...plan, intro: e.target.value })} rows={2} autoResize className="input" disabled={!editable} />
          </Field>
          {plan.activities.map((a, i) => (
            <ActivityEditor
              key={a.key}
              a={a}
              goal={goalsById.get(a.goalId)}
              disabled={!editable}
              onChange={(next) => setPlan({ ...plan, activities: plan.activities.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => setPlan({ ...plan, activities: plan.activities.filter((_, j) => j !== i) })}
            />
          ))}
          <Field label="What Pravnya says at the end">
            <InputTextarea value={plan.closing} onChange={(e) => setPlan({ ...plan, closing: e.target.value })} rows={2} autoResize className="input" disabled={!editable} />
          </Field>
          <span className="hint-text">{totalTries} tries in all (at most 60).</span>
          {error ? <p className="error-text">{error}</p> : null}
          {editable ? (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              {session.status === "DRAFT" ? <Button label="Publish to the parent" icon="pi pi-send" loading={busy === "publish"} disabled={busy !== ""} onClick={() => run("publish")} /> : null}
              <Button label="Save" className="p-button-outlined" loading={busy === "save"} disabled={busy !== ""} onClick={() => run("save")} />
              {session.status === "DRAFT" ? (
                <Button label="Delete draft" className="p-button-outlined p-button-danger" loading={busy === "delete"} disabled={busy !== ""} onClick={() => run("delete")} />
              ) : (
                <Button label="Archive" className="p-button-outlined p-button-secondary" loading={busy === "archive"} disabled={busy !== ""} onClick={() => run("archive")} />
              )}
              {saved ? <span className="hint-text">Saved{session.status === "ACTIVE" ? ". Changes apply from the next run." : ""}</span> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {session.runs.length ? (
        <div>
          <span className="field-label">Reports</span>
          {session.runs.map((r) => (
            <RunReport key={r.id} run={r} plan={session.plan} />
          ))}
        </div>
      ) : session.status === "ACTIVE" ? (
        <span className="hint-text">Not done yet. Each time the parent runs it, a report appears here and you get a summary by email.</span>
      ) : null}
    </div>
  );
}

/** A practice session Pravnya made when the parent asked (from Activities): read-only, with its report. */
function PracticeCard({ session }: { session: HomeSession }) {
  const run = session.runs[0];
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <span>
        <Tag value="Made by Pravnya" severity="info" /> <strong>{new Date(session.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</strong>{" "}
        <span className="hint-text">
          · {session.language === "hi" ? "Hindi" : "English"} · {session.plan.activities.map((a) => `${a.goalTitle} (${a.items.map((i) => i.label).join(", ")})`).join(" · ")}
        </span>
      </span>
      {run ? <RunReport run={run} plan={session.plan} /> : null}
    </div>
  );
}

export function KidHomeSessionsTab({ kid, canEdit }: { kid: Kid; canEdit: boolean }) {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<HomeSession[] | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [schedule, setSchedule] = useState<SessionSchedule>({ kind: "once" });
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState("");
  const [lastDraft, setLastDraft] = useState<HomeSession | null>(null);

  function load() {
    api.listHomeSessions(token!, kid.id).then(setSessions);
  }
  useEffect(() => {
    setSessions(null);
    load();
    api.listGoals(token!, kid.id).then((g) => setGoals(g.filter((x) => x.status === "ACTIVE")));
  }, [token, kid.id]);

  async function draft() {
    setError("");
    setDrafting(true);
    try {
      const d = await api.draftHomeSession(token!, { kidId: kid.id, goalIds: picked, language, schedule });
      setLastDraft(d);
      setPicked([]);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't draft a session. Try again.");
    } finally {
      setDrafting(false);
    }
  }

  if (!sessions) return <p className="empty-state">Loading...</p>;
  const withSkipped = sessions.filter((s) => s.source !== "PRAVNYA").map((s) => (lastDraft && s.id === lastDraft.id ? { ...s, skippedGoals: lastDraft.skippedGoals } : s));
  // Only ones the parent actually did something in.
  const practice = sessions.filter((s) => s.source === "PRAVNYA" && s.runs.some((r) => r.results.length > 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", maxWidth: 960 }}>
      {!kid.parentId ? <p className="hint-text">This child has no parent account yet. Sessions can be built, and the parent will see published ones once they join.</p> : null}
      {canEdit ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <strong>New home session</strong>
          <span className="hint-text">Pick 1-6 goals. Pravnya drafts an activity for each, using the goal's items and recent logs, in the right format (trials, labelling on AAC, identifying, articulation...). You check and edit it, then publish.</span>
          <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap" }}>
            {goals.length === 0 ? <span className="hint-text">No active goals yet.</span> : null}
            {goals.map((g) => (
              <label key={g.id} style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                <Checkbox
                  checked={picked.includes(g.id)}
                  disabled={!picked.includes(g.id) && picked.length >= 6}
                  onChange={(e) => setPicked(e.checked ? [...picked, g.id] : picked.filter((x) => x !== g.id))}
                />
                {g.title}
                {g.items.length === 0 ? <span className="hint-text"> (no items)</span> : null}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <Dropdown value={language} options={LANGUAGES} onChange={(e) => setLanguage(e.value)} />
            <ScheduleEditor value={schedule} onChange={setSchedule} />
            <Button label={drafting ? "Drafting..." : "Draft session"} icon="pi pi-file-edit" loading={drafting} disabled={!picked.length} onClick={draft} />
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
      ) : null}
      {withSkipped.length === 0 ? <p className="empty-state">No home sessions yet.</p> : null}
      {withSkipped.map((s) => (
        <SessionCard key={s.id + s.status + s.runs.length} session={s} goals={goals} canEdit={canEdit} onChanged={load} />
      ))}
      <h3 style={{ margin: "0.8rem 0 0" }}>Practice sessions the parent did with Pravnya</h3>
      <span className="hint-text">
        From the app's Activities, a parent can ask Pravnya for a 10-15 minute practice session (at most 2 a day). Pravnya picks 1-3 of this child's active goals and the items most in need of
        practice: worked on at the centre lately, not yet done on their own, not practised at home this week. Every try is in the child's log.
      </span>
      {practice.length === 0 ? <p className="empty-state">None yet.</p> : null}
      {practice.map((s) => (
        <PracticeCard key={s.id + s.runs.length} session={s} />
      ))}
    </div>
  );
}
