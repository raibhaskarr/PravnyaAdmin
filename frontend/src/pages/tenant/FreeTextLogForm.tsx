import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { EvidenceCandidate } from "../../api/types";
import { OUTCOME_LABEL, measurementLabel } from "./goalEvidence";

/** The AI-assisted alternative to picking a goal/item by hand: write what happened, the AI matches
 * it against this kid's own real goals (never invents a new one), the therapist reviews each
 * candidate before anything is saved -- nothing here writes to the DB until "Add approved" is
 * clicked, which then just calls the same POST /goals/:goalId/evidence as manual entry does. */
export function FreeTextLogForm({ kidId, onLogged }: { kidId: string; onLogged: () => void }) {
  const { token } = useAuth();
  const [freeText, setFreeText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [candidates, setCandidates] = useState<EvidenceCandidate[] | null>(null);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  async function handleReview() {
    if (!freeText.trim()) return;
    setError("");
    setSavedCount(0);
    setReviewing(true);
    setCandidates(null);
    try {
      const result = await api.extractEvidence(token!, kidId, freeText.trim());
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCandidates(result.candidates);
      setApproved(new Set(result.candidates.map((_, i) => i)));
      if (result.candidates.length === 0) setError("No evidence matched to this kid's existing goals -- try rewording, or log it manually.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't review this note right now.");
    } finally {
      setReviewing(false);
    }
  }

  function toggleApproved(i: number) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function startOver() {
    setFreeText("");
    setCandidates(null);
    setApproved(new Set());
    setError("");
  }

  async function handleAddApproved() {
    if (!candidates) return;
    setSaving(true);
    setError("");
    let count = 0;
    try {
      for (const i of approved) {
        const c = candidates[i];
        await api.logEvidence(token!, c.goalId, {
          newItemCustomText: c.itemHint ?? undefined,
          logDate: new Date().toISOString(),
          centreName: null,
          outcome: c.outcome,
          supportLevel: c.supportLevel,
          modality: c.modality,
          measurementValue: c.measurementValue,
          measurementUnit: c.measurementUnit,
          measurementBoolean: c.measurementBoolean,
          measurementText: c.measurementText
        });
        count += 1;
      }
      setSavedCount(count);
      setFreeText("");
      setCandidates(null);
      setApproved(new Set());
      onLogged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save some entries -- whatever got added before the failure is still saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <label className="field">
        <span className="field-label">Session note</span>
        <textarea
          className="input"
          rows={5}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Describe what happened in this session -- the AI will match it to this kid's goals."
          disabled={!!candidates}
        />
      </label>

      {!candidates ? (
        <button type="button" className="btn btn-primary" onClick={handleReview} disabled={reviewing || !freeText.trim()}>
          {reviewing ? "Reviewing..." : "Review with AI"}
        </button>
      ) : (
        <>
          <div className="hint-text" style={{ marginBottom: "0.75rem" }}>
            Found {candidates.length} piece{candidates.length === 1 ? "" : "s"} of evidence -- review and uncheck anything that's wrong before adding.
          </div>
          {candidates.map((c, i) => {
            const mLabel = measurementLabel(c);
            return (
              <div key={i} className="card" style={{ marginBottom: "0.5rem", opacity: approved.has(i) ? 1 : 0.5 }}>
                <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" checked={approved.has(i)} onChange={() => toggleApproved(i)} style={{ marginTop: "0.2rem" }} />
                  <div style={{ flex: 1 }}>
                    <div>
                      <strong>{c.goalTitle}</strong> <span className="hint-text">({c.skillName})</span>
                    </div>
                    <div style={{ marginTop: "0.2rem" }}>
                      {c.itemHint ? <span>{c.itemHint} — </span> : null}
                      {mLabel ?? OUTCOME_LABEL[c.outcome] ?? c.outcome}
                      <span className="hint-text"> ({Math.round(c.confidence * 100)}% confident)</span>
                    </div>
                    <div className="hint-text" style={{ marginTop: "0.3rem", fontStyle: "italic" }}>
                      "{c.excerpt}"
                    </div>
                  </div>
                </label>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button type="button" className="btn btn-primary" onClick={handleAddApproved} disabled={saving || approved.size === 0}>
              {saving ? "Saving..." : `Add ${approved.size} approved`}
            </button>
            <button type="button" className="btn btn-secondary" onClick={startOver}>
              Start over
            </button>
          </div>
        </>
      )}

      {error ? (
        <p className="error-text" style={{ marginTop: "0.75rem" }}>
          {error}
        </p>
      ) : null}
      {savedCount > 0 && !candidates ? (
        <p className="hint-text" style={{ marginTop: "0.75rem" }}>
          Added {savedCount} entr{savedCount === 1 ? "y" : "ies"}. Write another note whenever you're ready.
        </p>
      ) : null}
    </div>
  );
}
