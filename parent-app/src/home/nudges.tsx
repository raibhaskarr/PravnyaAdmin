import { useState } from "react";
import { api, ApiError, type ParentProfile } from "../api/client";
import { ChoiceChip, PrimaryButton } from "../onboarding/components";

type Kid = NonNullable<ParentProfile["kids"]>[number];

export type NudgeType = "therapies" | "schedule" | "gender";

// Only ONE nudge shows at a time (the sketch from the original Home planning pass), ranked by
// what actually unlocks the most value first -- therapies/schedule help tag things correctly
// later, gender is the least consequential gap. IEP/goals (the biggest gap) deliberately isn't in
// this rotation -- that needs the full extract-and-review flow from onboarding's IEP step, which
// doesn't fit a quick nudge card; it stays a later, separate piece of work.
export function computeNudge(kid: Kid): NudgeType | null {
  if (kid.selfReportedTherapies.length === 0) return "therapies";
  if (kid.selfReportedScheduleDays.length === 0) return "schedule";
  if (!kid.gender) return "gender";
  return null;
}

const THERAPIES = ["Speech therapy", "ABA", "Occupational therapy", "Physiotherapy", "Special education", "Other"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];

const COPY: Record<NudgeType, { title: (name: string) => string; subtitle: string; options: string[]; multi: boolean }> = {
  therapies: {
    title: (name) => `What kind of support does ${name} get right now?`,
    subtitle: "Not required -- just helps us tag things right later.",
    options: THERAPIES,
    multi: true
  },
  schedule: {
    title: (name) => `Which days does ${name} usually have therapy?`,
    subtitle: "You can add exact times later.",
    options: DAYS,
    multi: true
  },
  gender: {
    title: (name) => `What's ${name}'s gender?`,
    subtitle: "Skip if you'd rather not say.",
    options: GENDERS,
    multi: false
  }
};

export function NudgeCard({
  type,
  kidId,
  kidName,
  token,
  onResolved,
  onDismiss
}: {
  type: NudgeType;
  kidId: string;
  kidName: string;
  token: string;
  onResolved: () => void;
  onDismiss: () => void;
}) {
  const copy = COPY[type];
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(option: string) {
    if (copy.multi) {
      setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
    } else {
      setSelected([option]);
    }
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      if (type === "therapies") await api.updateKid(token, kidId, { selfReportedTherapies: selected });
      else if (type === "schedule") await api.updateKid(token, kidId, { selfReportedScheduleDays: selected });
      else await api.updateKid(token, kidId, { gender: selected[0] });
      onResolved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pv-green-100)] text-sm">🤖</span>
        <span className="text-sm font-medium text-[var(--pv-ink-faint)]">Pravnya</span>
      </div>
      <p className="mb-1 text-[1rem] font-medium text-[var(--pv-ink)]">{copy.title(kidName)}</p>
      <p className="mb-3 text-sm text-[var(--pv-ink-faint)]">{copy.subtitle}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {copy.options.map((opt) => (
          <ChoiceChip key={opt} label={opt} selected={selected.includes(opt)} onClick={() => toggle(opt)} />
        ))}
      </div>
      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <div className="flex-1">
          <PrimaryButton type="button" disabled={selected.length === 0 || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-2xl px-4 text-[0.95rem] font-medium text-[var(--pv-ink-faint)] transition hover:text-[var(--pv-ink-soft)]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
