import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { EvidenceCandidate, IepGoalCandidate } from "../../api/types";

type InputMode = "pdf" | "photo" | "csv";
type ExtractionResult = { statusUpdates: EvidenceCandidate[]; newGoals: IepGoalCandidate[] };

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Upload an IEP (PDF, a photo of one, or a pasted CSV of goal titles) and let the AI sort what it
 * finds into two kinds: progress/status against a goal this kid already has (saved as evidence,
 * same as the "log evidence" flow) and goals or plans that aren't tracked yet (saved as new goals,
 * matched against the real canonical skill taxonomy). Nothing here writes to the DB until "Add
 * approved" is clicked. The uploaded file itself is only ever sent to the AI provider (or, for
 * PDF, parsed locally for its text) for this one request -- never written to disk or kept anywhere
 * after the response comes back. */
export function IepUploadForm({ kidId, onAdded }: { kidId: string; onAdded: () => void }) {
  const { token } = useAuth();
  const [mode, setMode] = useState<InputMode>("pdf");

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");

  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [approvedUpdates, setApprovedUpdates] = useState<Set<number>>(new Set());
  const [approvedGoals, setApprovedGoals] = useState<Set<number>>(new Set());
  const [centreName, setCentreName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  function switchMode(next: InputMode) {
    setMode(next);
    setError("");
    setResult(null);
    setApprovedUpdates(new Set());
    setApprovedGoals(new Set());
    setCentreName("");
    setSavedCount(0);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  const canReview = mode === "pdf" ? !!pdfFile : mode === "photo" ? !!photoFile : !!csvText.trim();

  async function handleReview() {
    if (!canReview) return;
    setError("");
    setSavedCount(0);
    setReviewing(true);
    setResult(null);
    try {
      const response =
        mode === "pdf"
          ? await api.extractIepGoals(token!, kidId, { kind: "pdf", base64: await readAsBase64(pdfFile!) })
          : mode === "photo"
            ? await api.extractIepGoals(token!, kidId, {
                kind: "image",
                mimeType: photoFile!.type || "image/jpeg",
                base64: await readAsBase64(photoFile!)
              })
            : await api.extractIepGoals(token!, kidId, { kind: "csv", csvText });
      if ("error" in response) {
        setError(response.error);
        return;
      }
      setResult(response);
      setApprovedUpdates(new Set(response.statusUpdates.map((_, i) => i)));
      setApprovedGoals(new Set(response.newGoals.filter((c) => c.disciplineId && c.modality).map((_, i) => i)));
      if (response.statusUpdates.length === 0 && response.newGoals.length === 0) {
        setError("Nothing found in this document -- try another file, or add goals manually.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read this document right now.");
    } finally {
      setReviewing(false);
    }
  }

  function toggleUpdate(i: number) {
    setApprovedUpdates((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleGoal(i: number, disabled: boolean) {
    if (disabled) return;
    setApprovedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function startOver() {
    setPdfFile(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setCsvText("");
    setResult(null);
    setApprovedUpdates(new Set());
    setApprovedGoals(new Set());
    setCentreName("");
    setError("");
  }

  async function handleAddApproved() {
    if (!result) return;
    setSaving(true);
    setError("");
    const trimmedCentre = centreName.trim() || null;
    let count = 0;
    try {
      for (const i of approvedUpdates) {
        const c = result.statusUpdates[i];
        await api.logEvidence(token!, c.goalId, {
          newItemCustomText: c.itemHint ?? undefined,
          logDate: new Date().toISOString(),
          centreName: trimmedCentre,
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
      for (const i of approvedGoals) {
        const c = result.newGoals[i];
        if (!c.disciplineId || !c.modality) continue;
        await api.createGoal(token!, {
          kidId,
          canonicalSkillId: c.canonicalSkillId,
          disciplineId: c.disciplineId,
          modality: c.modality,
          title: c.title,
          centreName: trimmedCentre ?? undefined,
          notes: `Extracted from an uploaded IEP. Source: "${c.sourceExcerpt}"`
        });
        count += 1;
      }
      setSavedCount(count);
      startOver();
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save some items -- whatever got added before the failure is still saved.");
    } finally {
      setSaving(false);
    }
  }

  const totalApproved = approvedUpdates.size + approvedGoals.size;

  return (
    <div style={{ maxWidth: 560 }}>
      {!result ? (
        <div className="page-toolbar" style={{ marginBottom: "0.9rem" }}>
          <button type="button" className={`btn ${mode === "pdf" ? "btn-primary" : "btn-secondary"}`} onClick={() => switchMode("pdf")}>
            Upload PDF
          </button>
          <button type="button" className={`btn ${mode === "photo" ? "btn-primary" : "btn-secondary"}`} onClick={() => switchMode("photo")}>
            Upload photo
          </button>
          <button type="button" className={`btn ${mode === "csv" ? "btn-primary" : "btn-secondary"}`} onClick={() => switchMode("csv")}>
            Paste CSV
          </button>
        </div>
      ) : null}

      {!result && mode === "pdf" ? (
        <div className="field">
          <span className="field-label">IEP document (PDF)</span>
          <input className="input" type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} />
          {pdfFile ? <p className="hint-text" style={{ marginTop: "0.4rem" }}>{pdfFile.name}</p> : null}
        </div>
      ) : null}

      {!result && mode === "photo" ? (
        <div className="field">
          <span className="field-label">Photo of an IEP page</span>
          <input className="input" type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
          {photoPreviewUrl ? (
            <img src={photoPreviewUrl} alt="Preview of the uploaded IEP page" style={{ marginTop: "0.6rem", maxWidth: "100%", maxHeight: 280, borderRadius: 8 }} />
          ) : null}
        </div>
      ) : null}

      {!result && mode === "csv" ? (
        <label className="field">
          <span className="field-label">CSV of goal titles</span>
          <textarea
            className="input"
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"title,notes\nLabels common objects,Receptive language\nUses 2-word phrases,"}
          />
          <p className="hint-text" style={{ marginTop: "0.4rem" }}>
            A "title" column is required; an optional "notes" column gives the AI more context for matching.
          </p>
        </label>
      ) : null}

      {!result ? (
        <button type="button" className="btn btn-primary" onClick={handleReview} disabled={reviewing || !canReview} style={{ marginTop: "0.9rem" }}>
          {reviewing ? "Reading document..." : "Extract goals"}
        </button>
      ) : (
        <>
          <div className="hint-text" style={{ marginBottom: "0.75rem" }}>
            Found {result.statusUpdates.length} update{result.statusUpdates.length === 1 ? "" : "s"} to existing goals and {result.newGoals.length} new
            goal{result.newGoals.length === 1 ? "" : "s"} -- review and uncheck anything that's wrong before adding.
          </div>

          <label className="field" style={{ marginBottom: "1rem" }}>
            <span className="field-label">Centre / source clinic (optional)</span>
            <input
              className="input"
              value={centreName}
              onChange={(e) => setCentreName(e.target.value)}
              placeholder="e.g. vListen -- doesn't need to be a registered organization"
            />
            <p className="hint-text" style={{ marginTop: "0.3rem" }}>
              Applied to everything you approve below -- useful when this document came from a different clinic than the one you're logged into.
            </p>
          </label>

          {result.statusUpdates.length > 0 ? (
            <>
              <h3 style={{ margin: "0 0 0.5rem" }}>Updates to existing goals</h3>
              {result.statusUpdates.map((c, i) => (
                <div key={i} className="card" style={{ marginBottom: "0.5rem", opacity: approvedUpdates.has(i) ? 1 : 0.5 }}>
                  <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={approvedUpdates.has(i)} onChange={() => toggleUpdate(i)} style={{ marginTop: "0.2rem" }} />
                    <div style={{ flex: 1 }}>
                      <div>
                        <strong>{c.goalTitle}</strong> <span className="hint-text">({c.domainName} &gt; {c.skillName})</span>
                      </div>
                      <div className="hint-text" style={{ marginTop: "0.2rem" }}>
                        {c.outcome.toLowerCase()}
                        {c.itemHint ? ` -- ${c.itemHint}` : ""} -- {Math.round(c.confidence * 100)}% confident
                      </div>
                      <div className="hint-text" style={{ marginTop: "0.3rem", fontStyle: "italic" }}>
                        "{c.excerpt}"
                      </div>
                    </div>
                  </label>
                </div>
              ))}
            </>
          ) : null}

          {result.newGoals.length > 0 ? (
            <>
              <h3 style={{ margin: "1rem 0 0.5rem" }}>New goals found</h3>
              {result.newGoals.map((c, i) => {
                const disabled = !c.disciplineId || !c.modality;
                return (
                  <div key={i} className="card" style={{ marginBottom: "0.5rem", opacity: disabled ? 0.5 : approvedGoals.has(i) ? 1 : 0.5 }}>
                    <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", cursor: disabled ? "default" : "pointer" }}>
                      <input type="checkbox" checked={approvedGoals.has(i)} disabled={disabled} onChange={() => toggleGoal(i, disabled)} style={{ marginTop: "0.2rem" }} />
                      <div style={{ flex: 1 }}>
                        <div>
                          <strong>{c.title}</strong> <span className="hint-text">({c.domainName} &gt; {c.skillName})</span>
                        </div>
                        <div className="hint-text" style={{ marginTop: "0.2rem" }}>
                          {Math.round(c.confidence * 100)}% confident
                        </div>
                        <div className="hint-text" style={{ marginTop: "0.3rem", fontStyle: "italic" }}>
                          "{c.sourceExcerpt}"
                        </div>
                        {disabled ? (
                          <p className="error-text" style={{ marginTop: "0.3rem" }}>
                            No discipline enabled for this skill -- enable one under Disciplines, or add this goal manually.
                          </p>
                        ) : null}
                      </div>
                    </label>
                  </div>
                );
              })}
            </>
          ) : null}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button type="button" className="btn btn-primary" onClick={handleAddApproved} disabled={saving || totalApproved === 0}>
              {saving ? "Saving..." : `Add ${totalApproved} approved`}
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
      {savedCount > 0 && !result ? (
        <p className="hint-text" style={{ marginTop: "0.75rem" }}>
          Added {savedCount} item{savedCount === 1 ? "" : "s"}.
        </p>
      ) : null}
    </div>
  );
}
