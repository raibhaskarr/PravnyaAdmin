import { useEffect, useRef, useState } from "react";
import { api, ApiError, type EvidenceCandidate } from "../api/client";
import mark from "../brand/mark.svg";
import { PrimaryButton, TextField } from "../onboarding/components";

// Faithful port of the admin panel's AI-assisted "Log a session" (AiAssistedLogForm.tsx +
// LogSessionPage.tsx), minus the "Pick a goal" mode and kid-picker -- manual logging already has a
// home in the Goals tab, and the kid is already chosen via Home's own switcher. Same contract:
// describe/photograph/record what happened, the AI matches it against this kid's own real goals
// (never invents one), nothing is saved until the parent reviews and approves each candidate.

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

// Same tone/wording as LogEvidenceForm's own OUTCOMES/MODALITIES -- a candidate here is heading
// into the exact same evidence shape a manual entry would, so it should read the same way.
const OUTCOME_LABEL: Record<string, string> = {
  CORRECT: "Did it independently",
  PARTIAL: "Needed a little help",
  ATTEMPTED: "Gave it a try",
  INCORRECT: "Not yet",
  NOT_OBSERVED: "Didn't get a chance",
  UNKNOWN: "Logged"
};

const MODALITY_LABEL: Record<string, string> = {
  VERBAL: "Verbal",
  MANUAL_SIGN: "Signed",
  AAC: "AAC",
  WRITTEN: "Written",
  GESTURAL: "Gestural",
  NOT_APPLICABLE: "N/A"
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs} sec`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs} sec`;
}

function measurementLabel(c: EvidenceCandidate): string | null {
  switch (c.measurementType) {
    case "FREQUENCY":
      return c.measurementValue != null ? `${c.measurementValue} ${c.measurementUnit ?? "times"}` : null;
    case "DURATION":
      return c.measurementValue != null ? formatDuration(c.measurementValue) : null;
    case "PERCENTAGE":
      return c.measurementValue != null ? `${Math.round(c.measurementValue)}%` : null;
    case "RATING":
      return c.measurementValue != null ? `Rated ${c.measurementValue}/5` : null;
    case "YES_NO":
      return c.measurementBoolean == null ? null : c.measurementBoolean ? "Yes" : "Not yet";
    case "FREE_OBSERVATION":
      return c.measurementText ?? null;
    default:
      return null;
  }
}

export function LogSession({ token, kidId, kidName, onBack }: { token: string; kidId: string; kidName: string; onBack: () => void }) {
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
  const [centreName, setCentreName] = useState("");
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
          ? await api.extractEvidence(token, kidId, { freeText: freeText.trim() })
          : mode === "photo"
            ? await api.extractEvidence(token, kidId, {
                media: { kind: "image", mimeType: photoFile!.type || "image/jpeg", base64: await readAsBase64(photoFile!) }
              })
            : await api.extractEvidence(token, kidId, {
                media: { kind: "audio", mimeType: audioBlob!.type || "audio/webm", base64: await readAsBase64(audioBlob!) }
              });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCandidates(result.candidates);
      setApproved(new Set(result.candidates.map((_, i) => i)));
      if (result.candidates.length === 0) setError(`Nothing matched ${kidName}'s current goals -- try again, or log it manually from Goals.`);
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
    setCentreName("");
    setError("");
  }

  async function handleAddApproved() {
    if (!candidates) return;
    setSaving(true);
    setError("");
    const trimmedCentre = centreName.trim() || null;
    let count = 0;
    try {
      for (const i of approved) {
        const c = candidates[i];
        await api.logEvidence(token, kidId, c.goalId, {
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
      setSavedCount(count);
      startOver();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save some entries -- whatever got added before the failure is still saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">Log</p>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        {!candidates ? (
          <>
            <div className="mb-4 flex w-fit rounded-full bg-[var(--pv-border)] p-[3px]">
              {(["text", "photo", "voice"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-full px-4 py-1.5 text-[0.85rem] font-bold ${
                    mode === m ? "bg-[var(--pv-surface)] text-[var(--pv-green-700)] shadow-sm" : "text-[var(--pv-ink-soft)]"
                  }`}
                >
                  {m === "text" ? "Write" : m === "photo" ? "Photo" : "Voice"}
                </button>
              ))}
            </div>

            {mode === "text" ? (
              <label className="block">
                <span className="mb-1.5 block text-[0.95rem] font-medium text-[var(--pv-ink-soft)]">What happened?</span>
                <textarea
                  rows={6}
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder={`Describe what happened -- the AI will match it to ${kidName}'s goals.`}
                  className="w-full rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3 text-[1.02rem] text-[var(--pv-ink)] outline-none transition focus:border-[var(--pv-green-500)] focus:ring-2 focus:ring-[var(--pv-green-100)]"
                />
              </label>
            ) : null}

            {mode === "photo" ? (
              <div>
                <span className="mb-1.5 block text-[0.95rem] font-medium text-[var(--pv-ink-soft)]">A photo of a note or worksheet</span>
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="block w-full text-[0.95rem] text-[var(--pv-ink-soft)]" />
                {photoPreviewUrl ? (
                  <img src={photoPreviewUrl} alt="Preview" className="mt-3 max-h-72 w-full rounded-xl object-contain" />
                ) : (
                  <p className="mt-2 text-sm text-[var(--pv-ink-faint)]">
                    Snap a photo of a handwritten or printed note from a therapist -- the AI will read it directly.
                  </p>
                )}
              </div>
            ) : null}

            {mode === "voice" ? (
              <div>
                <span className="mb-1.5 block text-[0.95rem] font-medium text-[var(--pv-ink-soft)]">Voice note</span>
                {!audioUrl ? (
                  <div>
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`rounded-2xl border px-5 py-3 text-[0.98rem] font-semibold transition ${
                        isRecording ? "border-red-300 text-red-600" : "border-[var(--pv-border)] text-[var(--pv-ink)]"
                      }`}
                    >
                      {isRecording ? "Stop recording" : "Start recording"}
                    </button>
                    {isRecording ? <p className="mt-2 text-sm text-[var(--pv-ink-faint)]">Recording... describe what happened, then stop.</p> : null}
                  </div>
                ) : (
                  <div>
                    <audio controls src={audioUrl} className="mb-2 w-full" />
                    <button type="button" onClick={reRecord} className="text-sm font-medium text-[var(--pv-green-700)]">
                      Re-record
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-5">
              <PrimaryButton type="button" disabled={reviewing || !canReview} onClick={handleReview}>
                {reviewing ? "Reviewing..." : "Review with AI"}
              </PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-[var(--pv-ink-faint)]">
              Found {candidates.length} piece{candidates.length === 1 ? "" : "s"} of evidence -- review and uncheck anything that's wrong before adding.
            </p>

            <div className="mb-4">
              <TextField
                id="centreName"
                label="Centre or therapist (optional)"
                value={centreName}
                onChange={(e) => setCentreName(e.target.value)}
                placeholder="e.g. Bright Steps Clinic -- leave blank for Home"
              />
            </div>

            <div className="flex flex-col gap-2.5">
              {candidates.map((c, i) => {
                const mLabel = measurementLabel(c);
                const isApproved = approved.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleApproved(i)}
                    className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                      isApproved ? "border-[var(--pv-border)] bg-[var(--pv-surface)]" : "border-[var(--pv-border)] bg-[var(--pv-surface)] opacity-50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 text-[0.7rem] font-bold text-white ${
                        isApproved ? "border-[var(--pv-green-700)] bg-[var(--pv-green-700)]" : "border-[var(--pv-border)] bg-transparent"
                      }`}
                      aria-hidden="true"
                    >
                      {isApproved ? "✓" : ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.95rem] font-semibold text-[var(--pv-ink)]">{c.goalTitle}</p>
                      <p className="text-[0.78rem] text-[var(--pv-ink-faint)]">
                        {c.domainName} › {c.skillName}
                      </p>
                      <p className="mt-1 text-[0.88rem] text-[var(--pv-ink-soft)]">
                        {c.itemHint ? <span className="font-semibold text-[var(--pv-ink)]">{c.itemHint} — </span> : null}
                        {mLabel ?? OUTCOME_LABEL[c.outcome] ?? c.outcome}
                        {MODALITY_LABEL[c.modality] ? ` · ${MODALITY_LABEL[c.modality]}` : ""}
                        <span className="text-[var(--pv-ink-faint)]"> ({Math.round(c.confidence * 100)}% confident)</span>
                      </p>
                      <p className="mt-1 text-[0.78rem] italic text-[var(--pv-ink-faint)]">"{c.excerpt}"</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-4">
              <div className="flex-1">
                <PrimaryButton type="button" disabled={saving || approved.size === 0} onClick={handleAddApproved}>
                  {saving ? "Saving..." : `Add ${approved.size} approved`}
                </PrimaryButton>
              </div>
              <button type="button" onClick={startOver} className="text-[0.95rem] font-medium text-[var(--pv-ink-faint)]">
                Start over
              </button>
            </div>
          </>
        )}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {savedCount > 0 && !candidates ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--pv-green-100)] px-4 py-3">
            <img src={mark} alt="" className="h-5 w-5" />
            <p className="text-sm text-[var(--pv-green-900)]">
              Added {savedCount} entr{savedCount === 1 ? "y" : "ies"}. Ready whenever you are for the next one.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
