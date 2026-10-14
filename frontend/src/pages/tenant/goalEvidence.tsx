import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import type { Goal, GoalItem, GoalItemEvidenceRow } from "../../api/types";

export const OUTCOME_LABEL: Record<string, string> = {
  CORRECT: "Correct",
  INCORRECT: "Incorrect",
  PARTIAL: "Partial",
  ATTEMPTED: "Attempted",
  NOT_OBSERVED: "Not observed",
  UNKNOWN: "Unknown"
};

export function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs} sec`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs} sec`;
}

type MeasurementFields = Pick<GoalItemEvidenceRow, "measurementType" | "measurementValue" | "measurementUnit" | "measurementBoolean" | "measurementText">;

/** Same rule as the POC growth preview's measurementLabel: a trial-shaped skill's outcome already
 * is the measurement, so only skills with a real extra value (frequency/duration/...) show one.
 * Takes just the measurement fields (not a full GoalItemEvidenceRow) so it also works on an
 * unsaved EvidenceCandidate from the AI review flow, before it's a real row with an id/logDate. */
export function measurementLabel(e: MeasurementFields): string | null {
  switch (e.measurementType) {
    case "FREQUENCY":
      return e.measurementValue != null ? `${e.measurementValue} ${e.measurementUnit ?? "times"}` : null;
    case "DURATION":
      return e.measurementValue != null ? formatDuration(e.measurementValue) : null;
    case "PERCENTAGE":
      return e.measurementValue != null ? `${Math.round(e.measurementValue)}%` : null;
    case "RATING":
      return e.measurementValue != null ? `Rated ${e.measurementValue}/5` : null;
    case "YES_NO":
      return e.measurementBoolean == null ? null : e.measurementBoolean ? "Yes" : "Not yet";
    case "FREE_OBSERVATION":
      return e.measurementText ?? null;
    default:
      return null;
  }
}

export function itemLabel(item: GoalItem) {
  return item.customText ?? item.canonicalSkillItem?.displayName ?? "General practice";
}

/** Shows which clinic/organization a goal or logged session actually came from -- free text, so it
 * works whether or not that name matches a registered tenant (e.g. a guest therapist's own,
 * possibly-unregistered clinic, as opposed to the kid's own tenant). Click-to-edit inline rather
 * than a separate edit screen, since this is the one field that's turned out to need correcting
 * after the fact (an AI-assisted upload attributed to the wrong clinic). */
export function EditableCentre({ value, canEdit, onSave }: { value: string | null; canEdit: boolean; onSave: (next: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <span style={{ display: "inline-flex", gap: "0.3rem", alignItems: "center" }}>
        <input
          className="input"
          style={{ padding: "0.1rem 0.4rem", fontSize: "0.8rem", width: 110 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. vListen"
          autoFocus
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: "0.1rem 0.4rem", fontSize: "0.7rem" }}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(draft.trim() || null);
              setEditing(false);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ padding: "0.1rem 0.4rem", fontSize: "0.7rem" }} onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
      {value ? <span className="tag tag-framework">{value}</span> : <span className="hint-text">{canEdit ? "—" : "Home"}</span>}
      {canEdit ? (
        <button
          type="button"
          onClick={() => {
            setDraft(value ?? "");
            setEditing(true);
          }}
          style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: "0.7rem", textDecoration: "underline" }}
        >
          Edit
        </button>
      ) : null}
    </span>
  );
}

export function GoalEvidenceDetail({ goal, canEdit, onUpdated }: { goal: Goal; canEdit: boolean; onUpdated: () => void }) {
  const { token } = useAuth();
  const itemsWithEvidence = goal.items.filter((i) => i.evidence.length > 0);
  const totalEvidence = goal.items.reduce((sum, i) => sum + i.evidence.length, 0);

  if (totalEvidence === 0) {
    return (
      <p className="hint-text" style={{ padding: "0.75rem 1rem" }}>
        No practice history logged for this goal yet.
      </p>
    );
  }

  return (
    <div style={{ padding: "0.75rem 1rem", background: "var(--color-surface-muted, rgba(0,0,0,0.02))" }}>
      {itemsWithEvidence.map((item) => (
        <div key={item.id} style={{ marginBottom: "0.75rem" }}>
          <strong style={{ fontSize: "0.9rem" }}>
            {itemLabel(item)} <span className="hint-text">({item.evidence.length})</span>
          </strong>
          <table className="data-table" style={{ marginTop: "0.3rem" }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Result</th>
                <th>Support</th>
                <th>Modality</th>
                <th>Centre</th>
              </tr>
            </thead>
            <tbody>
              {item.evidence.map((e) => {
                const mLabel = measurementLabel(e);
                return (
                  <tr key={e.id}>
                    <td>{formatDate(e.logDate)}</td>
                    <td>{mLabel ?? OUTCOME_LABEL[e.outcome] ?? e.outcome}</td>
                    <td>{e.supportLevel.replace(/_/g, " ").toLowerCase()}</td>
                    <td>{e.modality.replace(/_/g, " ").toLowerCase()}</td>
                    <td>
                      <EditableCentre
                        value={e.centreName}
                        canEdit={canEdit}
                        onSave={async (next) => {
                          await api.updateEvidenceCentre(token!, goal.id, e.id, next);
                          onUpdated();
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
