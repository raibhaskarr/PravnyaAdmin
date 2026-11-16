import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Tag } from "primereact/tag";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { GoalPeriodStats, IepPlan, IepPlanContent, Kid } from "../../api/types";

const BASELINES = [
  { label: "Baseline: last 90 days", value: 90 },
  { label: "Baseline: last 30 days", value: 30 }
] as const;
const DAY = 86_400_000;

function date(d: string | Date) {
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function figures(g: GoalPeriodStats | undefined) {
  if (!g || g.entries === 0) return "Nothing logged in the baseline period";
  return `${g.correct} of ${g.entries} correct, ${g.independent} without help · ${g.atCentre} at centre, ${g.atHome} at home`;
}

// List fields are edited as one item per line.
type GoalForm = { goalId: string; title: string; area: string; baseline: string; target: string; strategies: string; homePractice: string };
type Form = { title: string; reviewDate: Date; presentLevels: string; strengths: string; goals: GoalForm[]; notes: string };

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function toForm(plan: IepPlan): Form {
  const c = plan.content;
  return {
    title: plan.title,
    reviewDate: new Date(plan.reviewDate),
    presentLevels: c.presentLevels,
    strengths: c.strengths.join("\n"),
    goals: c.goals.map((g) => ({ ...g, strategies: g.strategies.join("\n"), homePractice: g.homePractice.join("\n") })),
    notes: c.notes
  };
}

function toContent(f: Form): IepPlanContent {
  return {
    presentLevels: f.presentLevels.trim(),
    strengths: lines(f.strengths),
    goals: f.goals.map((g) => ({ ...g, baseline: g.baseline.trim(), target: g.target.trim(), strategies: lines(g.strategies), homePractice: lines(g.homePractice) })),
    notes: f.notes.trim()
  };
}

// ---------- Print / PDF ----------

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Opens the plan as a clean document in a new window and the browser's print dialog ("Save as PDF" works there). */
function printPlan(plan: IepPlan, kid: Kid) {
  const c = plan.content;
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : `<p class="muted">—</p>`);
  const para = (text: string) => (text ? text.split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join("") : `<p class="muted">—</p>`);
  const goals = c.goals
    .map(
      (g, i) => `
      <section class="goal">
        <h3>${i + 1}. ${esc(g.title)} <span class="muted">· ${esc(g.area)}</span></h3>
        <table>
          <tr><th>Baseline</th><td>${esc(g.baseline) || "—"}</td></tr>
          <tr><th>Target by ${esc(date(plan.reviewDate))}</th><td>${esc(g.target) || "—"}</td></tr>
          <tr><th>Strategies</th><td>${list(g.strategies)}</td></tr>
          <tr><th>Practice at home</th><td>${list(g.homePractice)}</td></tr>
        </table>
      </section>`
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.title)} — ${esc(kid.firstName)} ${esc(kid.lastName)}</title>
  <style>
    body { font: 11pt/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2a24; max-width: 760px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 18pt; margin: 0 0 .2rem; } h2 { font-size: 12.5pt; margin: 1.4rem 0 .4rem; border-bottom: 1px solid #cfd8d2; padding-bottom: .2rem; }
    h3 { font-size: 11.5pt; margin: 0 0 .4rem; } .muted { color: #66736b; font-weight: 400; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: .2rem 1.5rem; margin: .8rem 0; }
    .goal { break-inside: avoid; margin: .9rem 0; } table { width: 100%; border-collapse: collapse; }
    th { text-align: left; vertical-align: top; width: 9.5rem; padding: .3rem .6rem .3rem 0; font-weight: 600; color: #3b4a41; }
    td { padding: .3rem 0; vertical-align: top; } tr + tr th, tr + tr td { border-top: 1px solid #e6ece8; }
    ul { margin: 0; padding-left: 1.1rem; } p { margin: 0 0 .4rem; }
    .draft { color: #9a5b00; font-weight: 600; } .sign { margin-top: 2.2rem; display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
    .sign div { border-top: 1px solid #8a968f; padding-top: .3rem; color: #66736b; }
    @media print { body { margin: 0 auto; } }
  </style></head><body>
  <h1>${esc(plan.title)}</h1>
  ${plan.status === "DRAFT" ? `<p class="draft">Draft — not yet final</p>` : ""}
  <div class="meta">
    <div><strong>Child:</strong> ${esc(kid.firstName)} ${esc(kid.lastName)}</div>
    <div><strong>Date of birth:</strong> ${kid.dob ? esc(date(kid.dob)) : "—"}</div>
    <div><strong>Prepared by:</strong> ${esc(plan.authorName)}${plan.centreName ? `, ${esc(plan.centreName)}` : ""}</div>
    <div><strong>Plan start:</strong> ${esc(date(plan.planStart))}</div>
    <div><strong>Review date:</strong> ${esc(date(plan.reviewDate))}</div>
    <div><strong>Baseline from logs:</strong> ${esc(date(plan.baselineFrom))} – ${esc(date(plan.baselineTo))}</div>
  </div>
  <h2>Present levels</h2>${para(c.presentLevels)}
  <h2>Strengths</h2>${list(c.strengths)}
  <h2>Goals</h2>${goals || `<p class="muted">No goals.</p>`}
  ${c.notes ? `<h2>Notes</h2>${para(c.notes)}` : ""}
  <div class="sign"><div>Therapist</div><div>Parent / guardian</div></div>
  <script>window.onload = () => window.print();</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

// ---------- Editor ----------

function PlanEditor({ plan, kid, canEdit, onChanged }: { plan: IepPlan; kid: Kid; canEdit: boolean; onChanged: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState<Form>(() => toForm(plan));
  const [busy, setBusy] = useState<"" | "save" | "finalise" | "delete">("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const statsById = new Map(plan.stats.goals.map((g) => [g.goalId, g]));
  const set = (patch: Partial<Form>) => {
    setSaved(false);
    setForm((f) => ({ ...f, ...patch }));
  };
  const setGoal = (i: number, patch: Partial<GoalForm>) => set({ goals: form.goals.map((g, j) => (j === i ? { ...g, ...patch } : g)) });
  const missingTargets = form.goals.filter((g) => !g.target.trim()).length;

  async function run(kind: "save" | "finalise" | "delete") {
    setError("");
    if (kind === "finalise" && !window.confirm("Finalise this plan? It can't be changed afterwards. For the next review you'll draft a new plan.")) return;
    if (kind === "delete" && !window.confirm("Delete this draft plan?")) return;
    setBusy(kind);
    try {
      if (kind === "delete") await api.deleteIepPlan(token!, plan.id);
      else {
        await api.editIepPlan(token!, plan.id, { title: form.title.trim(), reviewDate: form.reviewDate.toISOString(), content: toContent(form) });
        if (kind === "finalise") await api.finaliseIepPlan(token!, plan.id);
      }
      if (kind === "save") setSaved(true);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <Tag value="Draft" severity="warning" />
        <span className="hint-text">
          {plan.aiDrafted ? "Drafted by Pravnya from the goals and logs. Check every line." : "Baselines filled in from the logs (Pravnya's AI was unavailable). Write the targets."}
        </span>
      </div>
      <div className="field-grid">
        <label className="field">
          <span className="field-label">Title</span>
          <InputText value={form.title} onChange={(e) => set({ title: e.target.value })} disabled={!canEdit} />
        </label>
        <label className="field">
          <span className="field-label">Review date</span>
          <Calendar value={form.reviewDate} onChange={(e) => e.value && set({ reviewDate: e.value as Date })} dateFormat="dd/mm/yy" showIcon minDate={new Date(Date.now() + DAY)} inputClassName="input" disabled={!canEdit} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Present levels</span>
        <InputTextarea value={form.presentLevels} onChange={(e) => set({ presentLevels: e.target.value })} rows={4} autoResize className="input" disabled={!canEdit} />
      </label>
      <label className="field">
        <span className="field-label">Strengths (one per line)</span>
        <InputTextarea value={form.strengths} onChange={(e) => set({ strengths: e.target.value })} rows={3} autoResize className="input" disabled={!canEdit} />
      </label>

      <span className="field-label">Goals ({form.goals.length})</span>
      {form.goals.length === 0 ? <p className="hint-text">This child has no active goals. Add goals on the Goals tab, then draft again.</p> : null}
      {form.goals.map((g, i) => (
        <div key={g.goalId} style={{ border: "1px solid var(--surface-200, #e3e7e4)", borderRadius: 8, padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
            <span>
              <strong>{i + 1}. {g.title}</strong> <span className="hint-text">· {g.area}</span>
            </span>
            {canEdit ? (
              <button type="button" onClick={() => set({ goals: form.goals.filter((_, j) => j !== i) })} style={{ background: "none", border: 0, padding: 0, color: "var(--red-600, #b42318)", cursor: "pointer" }}>
                Leave out of this plan
              </button>
            ) : null}
          </div>
          <span className="hint-text">From the logs: {figures(statsById.get(g.goalId))}</span>
          <label className="field">
            <span className="field-label">Baseline</span>
            <InputTextarea value={g.baseline} onChange={(e) => setGoal(i, { baseline: e.target.value })} rows={2} autoResize className="input" disabled={!canEdit} />
          </label>
          <label className="field">
            <span className="field-label">Target by the review date</span>
            <InputTextarea value={g.target} onChange={(e) => setGoal(i, { target: e.target.value })} rows={2} autoResize className="input" disabled={!canEdit} placeholder="With what help, doing what, how often. E.g. asks with two words in 4 of 5 opportunities" />
          </label>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Strategies (one per line)</span>
              <InputTextarea value={g.strategies} onChange={(e) => setGoal(i, { strategies: e.target.value })} rows={3} autoResize className="input" disabled={!canEdit} />
            </label>
            <label className="field">
              <span className="field-label">Practice at home (one per line)</span>
              <InputTextarea value={g.homePractice} onChange={(e) => setGoal(i, { homePractice: e.target.value })} rows={3} autoResize className="input" disabled={!canEdit} />
            </label>
          </div>
        </div>
      ))}

      <label className="field">
        <span className="field-label">Notes (optional)</span>
        <InputTextarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} autoResize className="input" disabled={!canEdit} />
      </label>

      {error ? <p className="error-text">{error}</p> : null}
      {missingTargets ? <p className="hint-text">{missingTargets} goal{missingTargets === 1 ? " needs" : "s need"} a target before the plan can be finalised.</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        {canEdit ? (
          <>
            <Button label="Finalise plan" icon="pi pi-check" disabled={busy !== "" || missingTargets > 0 || form.goals.length === 0} loading={busy === "finalise"} onClick={() => run("finalise")} />
            <Button label="Save draft" className="p-button-outlined" disabled={busy !== ""} loading={busy === "save"} onClick={() => run("save")} />
          </>
        ) : null}
        <Button label="Print / Save as PDF" icon="pi pi-print" className="p-button-outlined" onClick={() => printPlan({ ...plan, title: form.title, reviewDate: form.reviewDate.toISOString(), content: toContent(form) }, kid) || setError("Allow pop-ups for this site to print the plan.")} />
        {canEdit ? <Button label="Delete draft" className="p-button-outlined p-button-danger" disabled={busy !== ""} loading={busy === "delete"} onClick={() => run("delete")} /> : null}
        {saved ? <span className="hint-text">Saved</span> : null}
      </div>
    </div>
  );
}

function FinalPlan({ plan, kid }: { plan: IepPlan; kid: Kid }) {
  const [error, setError] = useState("");
  const overdue = new Date(plan.reviewDate).getTime() < Date.now();
  return (
    <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
      <span>
        <strong>{plan.title}</strong> <span className="hint-text">by {plan.authorName} · {plan.content.goals.length} goals · finalised {date(plan.finalisedAt!)}</span>
        <br />
        <span className={overdue ? "error-text" : "hint-text"}>Review {overdue ? "was due" : "due"} {date(plan.reviewDate)}</span>
      </span>
      <span>
        <Button label="Print / Save as PDF" icon="pi pi-print" className="p-button-outlined p-button-sm" onClick={() => printPlan(plan, kid) || setError("Allow pop-ups for this site to print the plan.")} />
        {error ? <p className="error-text">{error}</p> : null}
      </span>
    </div>
  );
}

// IEPs: Pravnya drafts from the child's active goals and the figures in their logs; staff edit,
// finalise (locks it) and print or save as PDF.
export function KidIepTab({ kid, canEdit }: { kid: Kid; canEdit: boolean }) {
  const { token } = useAuth();
  const [plans, setPlans] = useState<IepPlan[] | null>(null);
  const [baselineDays, setBaselineDays] = useState<30 | 90>(90);
  const [reviewDate, setReviewDate] = useState<Date>(() => new Date(Date.now() + 91 * DAY));
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState("");

  function load() {
    api.listIepPlans(token!, kid.id).then(setPlans);
  }
  useEffect(() => {
    setPlans(null);
    load();
  }, [token, kid.id]);

  async function draft() {
    setError("");
    setDrafting(true);
    try {
      await api.draftIepPlan(token!, { kidId: kid.id, baselineDays, reviewDate: reviewDate.toISOString() });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't draft a plan. Try again.");
    } finally {
      setDrafting(false);
    }
  }

  if (!plans) return <p className="empty-state">Loading...</p>;
  const drafts = plans.filter((p) => p.status === "DRAFT");
  const finals = plans.filter((p) => p.status === "FINAL");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", maxWidth: 860 }}>
      {canEdit ? (
        <div className="page-toolbar" style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <Dropdown value={baselineDays} options={[...BASELINES]} onChange={(e) => setBaselineDays(e.value)} />
          <span className="hint-text">Review on</span>
          <Calendar value={reviewDate} onChange={(e) => e.value && setReviewDate(e.value as Date)} dateFormat="dd/mm/yy" showIcon minDate={new Date(Date.now() + DAY)} inputClassName="input" />
          <Button label={drafting ? "Drafting..." : "Draft IEP"} icon="pi pi-file-edit" loading={drafting} onClick={draft} />
          <span className="hint-text">Pravnya drafts baselines and targets for each active goal from what's been logged. You check and edit them.</span>
        </div>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      {drafts.map((p) => (
        <PlanEditor key={p.id} plan={p} kid={kid} canEdit={canEdit} onChanged={load} />
      ))}
      <span className="field-label">Final plans</span>
      {finals.length === 0 ? <p className="empty-state">No final plans yet.</p> : finals.map((p) => <FinalPlan key={p.id} plan={p} kid={kid} />)}
    </div>
  );
}
