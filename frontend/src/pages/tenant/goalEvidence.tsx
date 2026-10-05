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

/** Same rule as the POC growth preview's measurementLabel: a trial-shaped skill's outcome already
 * is the measurement, so only skills with a real extra value (frequency/duration/...) show one. */
export function measurementLabel(e: GoalItemEvidenceRow): string | null {
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

export function GoalEvidenceDetail({ goal }: { goal: Goal }) {
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
                    <td>{e.centreName ?? "Home"}</td>
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
