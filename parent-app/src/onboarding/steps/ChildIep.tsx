import { useRef, useState } from "react";
import { api, ApiError, type IepGoalCandidate, type IepSource } from "../../api/client";
import { useOnboarding } from "../OnboardingContext";
import { OnboardingShell } from "../OnboardingShell";
import { PrimaryButton, SkipLink, StepHeading } from "../components";

function fileToSource(file: File): Promise<IepSource> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.onload = () => {
      // reader.result is "data:<mime>;base64,<data>" -- strip the prefix, the backend only wants
      // the raw base64.
      const base64 = String(reader.result).split(",")[1] ?? "";
      if (file.type === "application/pdf") resolve({ kind: "pdf", base64 });
      else resolve({ kind: "image", base64, mimeType: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
}

// Heaviest-lift optional step, placed last on purpose. Unlike Therapies/Schedule, this one has a
// real multi-phase flow within a single screen (pick -> extracting -> review) rather than a
// second onboarding step -- the AI-found-goals confirmation is still ONE decision ("add these" /
// "not now"), it just needs the extraction result to ask it, same reasoning VerifyEmail's
// send-then-verify stays one screen.
export function ChildIep() {
  const { draft, patchDraft, goNext, skipStep, token, kidId } = useOnboarding();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"pick" | "extracting" | "review" | "saving">("pick");
  const [candidates, setCandidates] = useState<IepGoalCandidate[]>([]);
  const [error, setError] = useState("");

  async function handleContinue() {
    if (!draft.childIepFile) return;
    setError("");
    setPhase("extracting");
    try {
      const source = await fileToSource(draft.childIepFile);
      const result = await api.extractIep(token!, kidId!, source);
      if ("error" in result) {
        setError(result.error);
        setPhase("pick");
        return;
      }
      if (result.newGoals.length === 0) {
        setError("We couldn't find any goals in this document -- you can add them manually later.");
        setPhase("pick");
        return;
      }
      setCandidates(result.newGoals);
      setPhase("review");
    } catch {
      setError("Couldn't read that document. Try again, or skip for now.");
      setPhase("pick");
    }
  }

  async function handleAddGoals() {
    setError("");
    setPhase("saving");
    try {
      await api.acceptIepGoals(token!, kidId!, candidates);
      goNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save those goals. Try again.");
      setPhase("review");
    }
  }

  if (phase === "review" || phase === "saving") {
    return (
      <OnboardingShell>
        <div className="flex flex-col gap-5">
          <StepHeading
            title={`We found ${candidates.length} possible goal${candidates.length === 1 ? "" : "s"}`}
            subtitle="You can review and adjust these anytime from Goals."
          />
          <ul className="flex flex-col gap-2.5">
            {candidates.map((c, i) => (
              <li key={i} className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
                <p className="text-[0.95rem] font-medium text-[var(--pv-ink)]">{c.title}</p>
                <p className="text-sm text-[var(--pv-ink-faint)]">
                  {c.domainName} &middot; {c.skillName}
                </p>
              </li>
            ))}
          </ul>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <PrimaryButton type="button" disabled={phase === "saving"} onClick={handleAddGoals}>
            {phase === "saving" ? "Saving..." : `Add ${candidates.length === 1 ? "this goal" : "these goals"}`}
          </PrimaryButton>
          {phase !== "saving" ? <SkipLink label="Not now" onClick={goNext} /> : null}
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell>
      <div className="flex flex-col gap-5">
        <StepHeading title="Have an IEP document handy?" subtitle="Optional -- upload now or add it anytime later." />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={phase === "extracting"}
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--pv-border)] bg-[var(--pv-surface)] px-5 py-10 text-center transition hover:border-[var(--pv-green-500)]"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--pv-green-700)]">
            <path d="M12 16V4m0 0L7 9m5-5l5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[1rem] font-medium text-[var(--pv-ink)]">{draft.childIepFile ? draft.childIepFile.name : "Tap to choose a file"}</span>
          <span className="text-sm text-[var(--pv-ink-faint)]">PDF, photo, or scan</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => patchDraft({ childIepFile: e.target.files?.[0] ?? null })}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <PrimaryButton type="button" disabled={!draft.childIepFile || phase === "extracting"} onClick={handleContinue}>
          {phase === "extracting" ? "Reading document..." : "Continue"}
        </PrimaryButton>
        <SkipLink onClick={() => skipStep("child-iep")} />
      </div>
    </OnboardingShell>
  );
}
