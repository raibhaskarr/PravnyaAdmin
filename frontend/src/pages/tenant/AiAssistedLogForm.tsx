import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../api/client";
import type { EvidenceCandidate } from "../../api/types";
import { OUTCOME_LABEL, measurementLabel } from "./goalEvidence";

type InputMode = "text" | "photo" | "voice";

const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

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

/** The AI-assisted alternative to picking a goal/item by hand -- describe what happened by typing,
 * snapping a photo of a written note, or recording a quick voice note, and the AI matches it
 * against this kid's own real goals (never invents a new one). The therapist reviews each
 * candidate before anything is saved -- nothing here writes to the DB until "Add approved" is
 * clicked, which then just calls the same POST /goals/:goalId/evidence as manual entry does.
 * The photo/recording itself is only ever sent to the AI provider for this one request -- it's
 * never written to disk or kept anywhere after the response comes back. */
export function AiAssistedLogForm({ kidId, onLogged }: { kidId: string; onLogged: () => void }) {
  const { token } = useAuth();
  const [mode, setMode] = useState<InputMode>("text");

  const [freeText, setFreeText] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [reviewing, setReviewing] = useState(false);
  const [candidates, setCandidates] = useState<EvidenceCandidate[] | null>(null);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchMode(next: InputMode) {
    setMode(next);
    setError("");
    setCandidates(null);
    setApproved(new Set());
    setSavedCount(0);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = AUDIO_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError("Couldn't access the microphone -- check your browser's microphone permission and try again.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function reRecord() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
  }

  const canReview = mode === "text" ? !!freeText.trim() : mode === "photo" ? !!photoFile : !!audioBlob;

  async function handleReview() {
    if (!canReview) return;
    setError("");
    setSavedCount(0);
    setReviewing(true);
    setCandidates(null);
    try {
      const result =
        mode === "text"
          ? await api.extractEvidence(token!, kidId, { freeText: freeText.trim() })
          : mode === "photo"
            ? await api.extractEvidence(token!, kidId, {
                media: { kind: "image", mimeType: photoFile!.type || "image/jpeg", base64: await readAsBase64(photoFile!) }
              })
            : await api.extractEvidence(token!, kidId, {
                media: { kind: "audio", mimeType: audioBlob!.type || "audio/webm", base64: await readAsBase64(audioBlob!) }
              });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCandidates(result.candidates);
      setApproved(new Set(result.candidates.map((_, i) => i)));
      if (result.candidates.length === 0) setError("No evidence matched to this kid's existing goals -- try again, or log it manually.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't review this right now.");
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
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    reRecord();
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
      startOver();
      onLogged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save some entries -- whatever got added before the failure is still saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {!candidates ? (
        <div className="page-toolbar" style={{ marginBottom: "0.9rem" }}>
          <button type="button" className={`btn ${mode === "text" ? "btn-primary" : "btn-secondary"}`} onClick={() => switchMode("text")}>
            Write a note
          </button>
          <button type="button" className={`btn ${mode === "photo" ? "btn-primary" : "btn-secondary"}`} onClick={() => switchMode("photo")}>
            Upload a photo
          </button>
          <button type="button" className={`btn ${mode === "voice" ? "btn-primary" : "btn-secondary"}`} onClick={() => switchMode("voice")}>
            Record a voice note
          </button>
        </div>
      ) : null}

      {!candidates && mode === "text" ? (
        <label className="field">
          <span className="field-label">Session note</span>
          <textarea
            className="input"
            rows={5}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Describe what happened in this session -- the AI will match it to this kid's goals."
          />
        </label>
      ) : null}

      {!candidates && mode === "photo" ? (
        <div className="field">
          <span className="field-label">Photo of a written note</span>
          <input className="input" type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
          {photoPreviewUrl ? (
            <img src={photoPreviewUrl} alt="Preview of the uploaded note" style={{ marginTop: "0.6rem", maxWidth: "100%", maxHeight: 280, borderRadius: 8 }} />
          ) : (
            <p className="hint-text" style={{ marginTop: "0.4rem" }}>Snap a photo of a handwritten or printed note -- the AI will read it directly.</p>
          )}
        </div>
      ) : null}

      {!candidates && mode === "voice" ? (
        <div className="field">
          <span className="field-label">Voice note</span>
          {!audioUrl ? (
            <div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={isRecording ? stopRecording : startRecording}
                style={isRecording ? { borderColor: "#dc2626", color: "#dc2626" } : undefined}
              >
                {isRecording ? "Stop recording" : "Start recording"}
              </button>
              {isRecording ? <p className="hint-text" style={{ marginTop: "0.4rem" }}>Recording... describe what happened, then stop.</p> : null}
            </div>
          ) : (
            <div>
              <audio controls src={audioUrl} style={{ display: "block", marginBottom: "0.5rem" }} />
              <button type="button" className="btn btn-secondary" onClick={reRecord} style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }}>
                Re-record
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!candidates ? (
        <button type="button" className="btn btn-primary" onClick={handleReview} disabled={reviewing || !canReview} style={{ marginTop: "0.9rem" }}>
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
          Added {savedCount} entr{savedCount === 1 ? "y" : "ies"}. Ready whenever you are for the next one.
        </p>
      ) : null}
    </div>
  );
}
