import { useState } from "react";
import { api, ApiError, type CreateEvidenceInput, type Goal } from "../api/client";
import { ChoiceChip, PrimaryButton } from "../onboarding/components";

// Mirrors the admin panel's LogEvidenceForm field-for-field (outcome/support level/modality, plus
// a measurement-type-conditional block) -- built fresh for this app, not shared code, but the same
// shape on purpose: this is the exact "parent can select the goal and update logs for it, like we
// have on admin panel" ask from the original planning pass. No centreName field here -- this form
// is for a parent's own direct observation, which defaults to Home when the field's omitted
// (parentGoals.schemas.ts no longer force-blanks it; LogSession's AI-assisted flow is where a
// parent tags which centre/therapist actually suggested the activity).

const OUTCOMES: { value: string; label: string }[] = [
  { value: "CORRECT", label: "Did it independently" },
  { value: "PARTIAL", label: "Needed a little help" },
  { value: "ATTEMPTED", label: "Gave it a try" },
  { value: "INCORRECT", label: "Not yet" },
  { value: "NOT_OBSERVED", label: "Didn't get a chance" }
];

const SUPPORT_LEVELS: { value: string; label: string }[] = [
  { value: "INDEPENDENT", label: "Independent" },
  { value: "VISUAL_PROMPT", label: "Visual prompt" },
  { value: "VERBAL_PROMPT", label: "Verbal prompt" },
  { value: "GESTURAL_PROMPT", label: "Gestural prompt" },
  { value: "PHYSICAL_PROMPT", label: "Physical prompt" },
  { value: "PARTIAL_ASSISTANCE", label: "Partial assistance" },
  { value: "FULL_ASSISTANCE", label: "Full assistance" }
];

const MODALITIES: { value: string; label: string }[] = [
  { value: "VERBAL", label: "Verbal" },
  { value: "MANUAL_SIGN", label: "Signed" },
  { value: "AAC", label: "AAC" },
  { value: "WRITTEN", label: "Written" },
  { value: "GESTURAL", label: "Gestural" },
  { value: "NOT_APPLICABLE", label: "N/A" }
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogEvidenceForm({ goal, token, kidId, onLogged, onCancel }: { goal: Goal; token: string; kidId: string; onLogged: () => void; onCancel: () => void }) {
  const [itemChoice, setItemChoice] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState("");
  const [logDate, setLogDate] = useState(todayISO());
  const [outcome, setOutcome] = useState("CORRECT");
  const [supportLevel, setSupportLevel] = useState("INDEPENDENT");
  const [modality, setModality] = useState("VERBAL");
  const [measurementValue, setMeasurementValue] = useState("");
  const [measurementUnit, setMeasurementUnit] = useState("times");
  const [durationMin, setDurationMin] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [measurementBoolean, setMeasurementBoolean] = useState<boolean | null>(null);
  const [measurementText, setMeasurementText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const measurementType = goal.canonicalSkill.measurementType;
  const existingItems = goal.items.filter((i) => i.customText || i.canonicalSkillItem);

  async function handleSubmit() {
    setError("");
    setSaving(true);
    try {
      const input: CreateEvidenceInput = {
        goalItemId: itemChoice ?? undefined,
        newItemCustomText: !itemChoice && newItemText.trim() ? newItemText.trim() : undefined,
        logDate: new Date(logDate).toISOString(),
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
      };
      await api.logEvidence(token, kidId, goal.id, input);
      onLogged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-4">
      <div>
        <p className="mb-1.5 text-sm font-medium text-[var(--pv-ink-soft)]">What specifically happened?</p>
        <div className="flex flex-wrap gap-2">
          {existingItems.map((item) => {
            const label = item.customText ?? item.canonicalSkillItem?.displayName ?? "General practice";
            return (
              <ChoiceChip
                key={item.id}
                label={label}
                selected={itemChoice === item.id}
                onClick={() => {
                  setItemChoice(item.id);
                  setNewItemText("");
                }}
              />
            );
          })}
        </div>
        <input
          className="mt-2 w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[0.95rem] outline-none focus:border-[var(--pv-green-500)]"
          placeholder="Or describe what happened (optional)"
          value={newItemText}
          onChange={(e) => {
            setNewItemText(e.target.value);
            setItemChoice(null);
          }}
        />
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--pv-ink-soft)]">Date</span>
        <input
          type="date"
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
          className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[0.95rem] outline-none focus:border-[var(--pv-green-500)]"
        />
      </label>

      <div>
        <p className="mb-1.5 text-sm font-medium text-[var(--pv-ink-soft)]">Result</p>
        <div className="flex flex-wrap gap-2">
          {OUTCOMES.map((o) => (
            <ChoiceChip key={o.value} label={o.label} selected={outcome === o.value} onClick={() => setOutcome(o.value)} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-[var(--pv-ink-soft)]">Support given</p>
        <div className="flex flex-wrap gap-2">
          {SUPPORT_LEVELS.map((s) => (
            <ChoiceChip key={s.value} label={s.label} selected={supportLevel === s.value} onClick={() => setSupportLevel(s.value)} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-[var(--pv-ink-soft)]">Modality</p>
        <div className="flex flex-wrap gap-2">
          {MODALITIES.map((m) => (
            <ChoiceChip key={m.value} label={m.label} selected={modality === m.value} onClick={() => setModality(m.value)} />
          ))}
        </div>
      </div>

      {measurementType === "FREQUENCY" ? (
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-[var(--pv-ink-soft)]">How many times</span>
            <input
              type="number"
              min="0"
              value={measurementValue}
              onChange={(e) => setMeasurementValue(e.target.value)}
              className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[0.95rem] outline-none focus:border-[var(--pv-green-500)]"
            />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-[var(--pv-ink-soft)]">Unit</span>
            <input
              value={measurementUnit}
              onChange={(e) => setMeasurementUnit(e.target.value)}
              className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[0.95rem] outline-none focus:border-[var(--pv-green-500)]"
            />
          </label>
        </div>
      ) : null}

      {measurementType === "DURATION" ? (
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-[var(--pv-ink-soft)]">Minutes</span>
            <input
              type="number"
              min="0"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[0.95rem] outline-none focus:border-[var(--pv-green-500)]"
            />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-[var(--pv-ink-soft)]">Seconds</span>
            <input
              type="number"
              min="0"
              max="59"
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
              className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[0.95rem] outline-none focus:border-[var(--pv-green-500)]"
            />
          </label>
        </div>
      ) : null}

      {measurementType === "PERCENTAGE" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--pv-ink-soft)]">Percentage correct</span>
          <input
            type="number"
            min="0"
            max="100"
            value={measurementValue}
            onChange={(e) => setMeasurementValue(e.target.value)}
            className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[0.95rem] outline-none focus:border-[var(--pv-green-500)]"
          />
        </label>
      ) : null}

      {measurementType === "RATING" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--pv-ink-soft)]">Rating (1-5)</span>
          <input
            type="number"
            min="1"
            max="5"
            value={measurementValue}
            onChange={(e) => setMeasurementValue(e.target.value)}
            className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[0.95rem] outline-none focus:border-[var(--pv-green-500)]"
          />
        </label>
      ) : null}

      {measurementType === "YES_NO" ? (
        <div>
          <p className="mb-1.5 text-sm font-medium text-[var(--pv-ink-soft)]">Completed?</p>
          <div className="flex gap-2">
            <ChoiceChip label="Yes" selected={measurementBoolean === true} onClick={() => setMeasurementBoolean(true)} />
            <ChoiceChip label="Not yet" selected={measurementBoolean === false} onClick={() => setMeasurementBoolean(false)} />
          </div>
        </div>
      ) : null}

      {measurementType === "FREE_OBSERVATION" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--pv-ink-soft)]">What happened</span>
          <input
            value={measurementText}
            onChange={(e) => setMeasurementText(e.target.value)}
            placeholder="Short note"
            className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg)] px-3 py-2 text-[0.95rem] outline-none focus:border-[var(--pv-green-500)]"
          />
        </label>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-2">
        <div className="flex-1">
          <PrimaryButton type="button" disabled={saving} onClick={handleSubmit}>
            {saving ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
        <button type="button" onClick={onCancel} className="rounded-2xl px-4 text-[0.95rem] font-medium text-[var(--pv-ink-faint)] hover:text-[var(--pv-ink-soft)]">
          Cancel
        </button>
      </div>
    </div>
  );
}
