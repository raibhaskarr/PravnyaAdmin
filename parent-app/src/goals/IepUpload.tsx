import { useRef, useState } from "react";
import { api, ApiError, type Centre, type EvidenceCandidate, type IepGoalCandidate, type IepSource } from "../api/client";
import { CentrePicker } from "../components/CentrePicker";
import { PrimaryButton } from "../onboarding/components";

// Reachable anytime from the Goals tab, not onboarding-only -- onboarding's ChildIep.tsx only ever
// handles newGoals (nothing exists yet at onboarding time, so statusUpdates always comes back
// empty there). A returning parent is likely to have existing goals an IEP revision should update
// too, so this screen reviews both candidate categories the extract endpoint already returns, same
// shape admin's IepUploadForm.tsx already handles. Own screen (not inlined into Goals) -- this is
// a real multi-phase flow (pick -> extract -> review two lists -> save), not a quick add.

function fileToSource(file: File): Promise<IepSource> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] ?? "";
      if (file.type === "application/pdf") resolve({ kind: "pdf", base64 });
      else resolve({ kind: "image", base64, mimeType: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
}

// Same labels as LogSession.tsx's own review step -- a status-update candidate here is heading
// into the exact same evidence shape a manual/AI-assisted log would.
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

type Phase = "pick" | "extracting" | "review" | "saving";

function CandidateCheck({ approved }: { approved: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 text-[0.7rem] font-bold text-white ${
        approved ? "border-[var(--pv-green-700)] bg-[var(--pv-green-700)]" : "border-[var(--pv-border)] bg-transparent"
      }`}
      aria-hidden="true"
    >
      {approved ? "✓" : ""}
    </span>
  );
}

export function IepUpload({ token, kidId, kidName, onBack }: { token: string; kidId: string; kidName: string; onBack: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [statusUpdates, setStatusUpdates] = useState<EvidenceCandidate[]>([]);
  const [newGoals, setNewGoals] = useState<IepGoalCandidate[]>([]);
  const [approvedUpdates, setApprovedUpdates] = useState<Set<number>>(new Set());
  const [approvedGoals, setApprovedGoals] = useState<Set<number>>(new Set());
  const [centre, setCentre] = useState<Centre | null>(null);
  const [error, setError] = useState("");

  const reviewing = phase === "review" || phase === "saving";

  function toggleUpdate(i: number) {
    setApprovedUpdates((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleGoal(i: number) {
    setApprovedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleExtract() {
    if (!file) return;
    setError("");
    setPhase("extracting");
    try {
      const source = await fileToSource(file);
      const result = await api.extractIep(token, kidId, source);
      if ("error" in result) {
        setError(result.error);
        setPhase("pick");
        return;
      }
      if (result.statusUpdates.length === 0 && result.newGoals.length === 0) {
        setError(`We couldn't find anything matching ${kidName}'s goals in this document.`);
        setPhase("pick");
        return;
      }
      setStatusUpdates(result.statusUpdates);
      setNewGoals(result.newGoals);
      setApprovedUpdates(new Set(result.statusUpdates.map((_, i) => i)));
      setApprovedGoals(new Set(result.newGoals.map((_, i) => i)));
      setPhase("review");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read that document. Try again.");
      setPhase("pick");
    }
  }

  function startOver() {
    setFile(null);
    setStatusUpdates([]);
    setNewGoals([]);
    setApprovedUpdates(new Set());
    setApprovedGoals(new Set());
    setCentre(null);
    setError("");
    setPhase("pick");
  }

  async function handleSave() {
    setPhase("saving");
    setError("");
    const centreId = centre?.id ?? null;
    try {
      for (const i of approvedUpdates) {
        const c = statusUpdates[i];
        await api.logEvidence(token, kidId, c.goalId, {
          newItemCustomText: c.itemHint ?? undefined,
          logDate: new Date().toISOString(),
          centreId,
          outcome: c.outcome,
          supportLevel: c.supportLevel,
          modality: c.modality,
          measurementValue: c.measurementValue,
          measurementUnit: c.measurementUnit,
          measurementBoolean: c.measurementBoolean,
          measurementText: c.measurementText
        });
      }
      const goalsToAccept = [...approvedGoals].map((i) => newGoals[i]);
      if (goalsToAccept.length > 0) await api.acceptIepGoals(token, kidId, goalsToAccept);
      onBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save some of these -- whatever saved before the failure is still saved.");
      setPhase("review");
    }
  }

  const totalApproved = approvedUpdates.size + approvedGoals.size;
  const totalFound = statusUpdates.length + newGoals.length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--pv-bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-3.5">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--pv-ink-soft)] transition hover:bg-[var(--pv-border)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p className="text-[1.05rem] font-semibold text-[var(--pv-ink)]">Upload IEP</p>
      </header>

      <main className="mx-auto w-full min-h-0 max-w-2xl flex-1 overflow-y-auto px-5 py-6">
        {!reviewing ? (
          <>
            <p className="mb-4 text-sm text-[var(--pv-ink-faint)]">
              Upload an IEP document -- the AI will look for updates to {kidName}'s existing goals and any new goals it finds.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={phase === "extracting"}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-10 text-center transition hover:border-[var(--pv-green-500)]"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--pv-green-700)]">
                <path d="M12 16V4m0 0L7 9m5-5l5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[1rem] font-medium text-[var(--pv-ink)]">{file ? file.name : "Tap to choose a file"}</span>
              <span className="text-sm text-[var(--pv-ink-faint)]">PDF, photo, or scan</span>
            </button>
            <input ref={inputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

            <div className="mt-5">
              <PrimaryButton type="button" disabled={!file || phase === "extracting"} onClick={handleExtract}>
                {phase === "extracting" ? "Reading document..." : "Review with AI"}
              </PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-[var(--pv-ink-faint)]">
              Found {totalFound} thing{totalFound === 1 ? "" : "s"} -- review and uncheck anything that's wrong before adding.
            </p>

            {statusUpdates.length > 0 ? (
              <div className="mb-4">
                <span className="mb-1.5 block text-[0.95rem] font-medium text-[var(--pv-ink-soft)]">Centre or therapist (optional)</span>
                <CentrePicker token={token} value={centre} onChange={setCentre} placeholder="e.g. Bright Steps Clinic -- leave blank for Home" />
              </div>
            ) : null}

            {statusUpdates.length > 0 ? (
              <div className="mb-5">
                <h2 className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">Updates to existing goals</h2>
                <div className="flex flex-col gap-2.5">
                  {statusUpdates.map((c, i) => {
                    const mLabel = measurementLabel(c);
                    const isApproved = approvedUpdates.has(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleUpdate(i)}
                        className={`flex w-full items-start gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3.5 text-left transition ${isApproved ? "" : "opacity-50"}`}
                      >
                        <CandidateCheck approved={isApproved} />
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
              </div>
            ) : null}

            {newGoals.length > 0 ? (
              <div className="mb-5">
                <h2 className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-[var(--pv-ink-faint)]">New goals</h2>
                <div className="flex flex-col gap-2.5">
                  {newGoals.map((c, i) => {
                    const isApproved = approvedGoals.has(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleGoal(i)}
                        className={`flex w-full items-start gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3.5 text-left transition ${isApproved ? "" : "opacity-50"}`}
                      >
                        <CandidateCheck approved={isApproved} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.95rem] font-semibold text-[var(--pv-ink)]">{c.title}</p>
                          <p className="text-[0.78rem] text-[var(--pv-ink-faint)]">
                            {c.domainName} › {c.skillName}
                            <span className="text-[var(--pv-ink-faint)]"> ({Math.round(c.confidence * 100)}% confident)</span>
                          </p>
                          <p className="mt-1 text-[0.78rem] italic text-[var(--pv-ink-faint)]">"{c.sourceExcerpt}"</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-2 flex items-center gap-4">
              <div className="flex-1">
                <PrimaryButton type="button" disabled={phase === "saving" || totalApproved === 0} onClick={handleSave}>
                  {phase === "saving" ? "Saving..." : `Add ${totalApproved} approved`}
                </PrimaryButton>
              </div>
              <button type="button" onClick={startOver} className="text-[0.95rem] font-medium text-[var(--pv-ink-faint)]">
                Start over
              </button>
            </div>
          </>
        )}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </main>
    </div>
  );
}
