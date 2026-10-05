import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { Goal, PocEvidenceOutcome, PocModality, PocSupportLevel } from "../../api/types";
import { itemLabel } from "./goalEvidence";

const OUTCOMES: { value: PocEvidenceOutcome; label: string }[] = [
  { value: "CORRECT", label: "Did it independently" },
  { value: "PARTIAL", label: "Needed a little help" },
  { value: "ATTEMPTED", label: "Gave it a try" },
  { value: "INCORRECT", label: "Not yet" },
  { value: "NOT_OBSERVED", label: "Didn't get a chance to try" }
];

const SUPPORT_LEVELS: { value: PocSupportLevel; label: string }[] = [
  { value: "INDEPENDENT", label: "Independent" },
  { value: "VISUAL_PROMPT", label: "Visual prompt" },
  { value: "VERBAL_PROMPT", label: "Verbal prompt" },
  { value: "GESTURAL_PROMPT", label: "Gestural prompt" },
  { value: "PHYSICAL_PROMPT", label: "Physical prompt" },
  { value: "PARTIAL_ASSISTANCE", label: "Partial assistance" },
  { value: "FULL_ASSISTANCE", label: "Full assistance" }
];

const MODALITIES: { value: PocModality; label: string }[] = [
  { value: "VERBAL", label: "Verbal" },
  { value: "MANUAL_SIGN", label: "Manual sign" },
  { value: "AAC", label: "AAC" },
  { value: "WRITTEN", label: "Written" },
  { value: "GESTURAL", label: "Gestural" },
  { value: "NOT_APPLICABLE", label: "Not applicable" }
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Goal has already been picked (via search, upstream) by the time this renders -- this form is
 * just the quick-entry fields for that one goal, driven by its skill's measurement type. */
export function LogEvidenceForm({ goal, onLogged }: { goal: Goal; onLogged: (updatedGoal: Goal) => void }) {
  const { token } = useAuth();
  const [itemChoice, setItemChoice] = useState(""); // "" = general practice, "new" = typed below, else a GoalItem id
  const [newItemText, setNewItemText] = useState("");
  const [logDate, setLogDate] = useState(todayISO());
  const [centreName, setCentreName] = useState("");
  const [outcome, setOutcome] = useState<PocEvidenceOutcome>("CORRECT");
  const [supportLevel, setSupportLevel] = useState<PocSupportLevel>("INDEPENDENT");
  const [modality, setModality] = useState<PocModality>("NOT_APPLICABLE");
  const [measurementValue, setMeasurementValue] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState("times");
  const [durationMin, setDurationMin] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [measurementBoolean, setMeasurementBoolean] = useState<boolean | null>(null);
  const [measurementText, setMeasurementText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const measurementType = goal.canonicalSkill.measurementType;

  function resetMeasurementFields() {
    setItemChoice("");
    setNewItemText("");
    setMeasurementValue("");
    setMeasurementUnit("times");
    setDurationMin("");
    setDurationSec("");
    setMeasurementBoolean(null);
    setMeasurementText("");
  }

  // Switching to a different goal (via the parent's search) should land on a clean form, not
  // whatever was mid-entry for the previous one.
  useEffect(resetMeasurementFields, [goal.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.logEvidence(token!, goal.id, {
        goalItemId: itemChoice && itemChoice !== "new" ? itemChoice : undefined,
        newItemCustomText: itemChoice === "new" ? newItemText.trim() || undefined : undefined,
        logDate: new Date(logDate).toISOString(),
        centreName: centreName.trim() || null,
        outcome,
        supportLevel,
        modality,
        measurementValue:
          measurementType === "DURATION"
            ? (Number(durationMin || 0) * 60 + Number(durationSec || 0)) || null
            : measurementValue !== ""
              ? Number(measurementValue)
              : null,
        measurementUnit: measurementType === "FREQUENCY" ? measurementUnit : measurementType === "DURATION" ? "seconds" : null,
        measurementBoolean: measurementType === "YES_NO" ? measurementBoolean : null,
        measurementText: measurementType === "FREE_OBSERVATION" ? measurementText.trim() || null : null
      });
      resetMeasurementFields();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      const updatedGoal = await api.listGoals(token!, goal.kidId).then((goals) => goals.find((g) => g.id === goal.id) ?? goal);
      onLogged(updatedGoal);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to log this entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-panel" style={{ maxWidth: 560 }}>
      <label className="field">
        <span className="field-label">What was practiced</span>
        <select className="input" value={itemChoice} onChange={(e) => setItemChoice(e.target.value)}>
          <option value="">General practice (no specific item)</option>
          {goal.items.map((item) => (
            <option key={item.id} value={item.id}>
              {itemLabel(item)}
            </option>
          ))}
          <option value="new">+ Type a new item...</option>
        </select>
      </label>
      {itemChoice === "new" ? (
        <label className="field">
          <span className="field-label">New item name</span>
          <input className="input" value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="e.g. Apple" autoFocus />
        </label>
      ) : null}

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">Date</span>
          <input type="date" className="input" value={logDate} onChange={(e) => setLogDate(e.target.value)} required />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">Centre (blank = Home)</span>
          <input className="input" value={centreName} onChange={(e) => setCentreName(e.target.value)} placeholder="Home" />
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">Result</span>
          <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as PocEvidenceOutcome)}>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">Support given</span>
          <select className="input" value={supportLevel} onChange={(e) => setSupportLevel(e.target.value as PocSupportLevel)}>
            {SUPPORT_LEVELS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {measurementType === "FREQUENCY" ? (
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">How many times</span>
            <input type="number" min="0" className="input" value={measurementValue} onChange={(e) => setMeasurementValue(e.target.value)} autoFocus />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">Unit</span>
            <input className="input" value={measurementUnit} onChange={(e) => setMeasurementUnit(e.target.value)} />
          </label>
        </div>
      ) : null}

      {measurementType === "DURATION" ? (
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">Minutes</span>
            <input type="number" min="0" className="input" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} autoFocus />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">Seconds</span>
            <input type="number" min="0" max="59" className="input" value={durationSec} onChange={(e) => setDurationSec(e.target.value)} />
          </label>
        </div>
      ) : null}

      {measurementType === "PERCENTAGE" ? (
        <label className="field">
          <span className="field-label">Percentage correct</span>
          <input type="number" min="0" max="100" className="input" value={measurementValue} onChange={(e) => setMeasurementValue(e.target.value)} autoFocus />
        </label>
      ) : null}

      {measurementType === "RATING" ? (
        <label className="field">
          <span className="field-label">Rating (1-5)</span>
          <input type="number" min="1" max="5" className="input" value={measurementValue} onChange={(e) => setMeasurementValue(e.target.value)} autoFocus />
        </label>
      ) : null}

      {measurementType === "YES_NO" ? (
        <div className="field">
          <span className="field-label">Completed?</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className={`btn ${measurementBoolean === true ? "btn-primary" : "btn-secondary"}`} onClick={() => setMeasurementBoolean(true)}>
              Yes
            </button>
            <button type="button" className={`btn ${measurementBoolean === false ? "btn-primary" : "btn-secondary"}`} onClick={() => setMeasurementBoolean(false)}>
              Not yet
            </button>
          </div>
        </div>
      ) : null}

      {measurementType === "FREE_OBSERVATION" ? (
        <label className="field">
          <span className="field-label">What happened</span>
          <input className="input" value={measurementText} onChange={(e) => setMeasurementText(e.target.value)} placeholder="Short note" autoFocus />
        </label>
      ) : null}

      <label className="field">
        <span className="field-label">Modality</span>
        <select className="input" value={modality} onChange={(e) => setModality(e.target.value as PocModality)}>
          {MODALITIES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="error-text">{error}</p> : null}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save & log another"}
        </button>
        {justSaved ? <span className="hint-text">Logged!</span> : null}
      </div>
    </form>
  );
}
