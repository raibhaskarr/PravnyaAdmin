import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  emptyDraft,
  OPTIONAL_STEPS,
  STEP_ORDER,
  type OnboardingDraft,
  type OptionalStepId,
  type OptionalStepStatus,
  type StepId,
} from "./types";

interface OnboardingContextValue {
  draft: OnboardingDraft;
  patchDraft: (patch: Partial<OnboardingDraft>) => void;
  stepId: StepId;
  stepIndex: number;
  goNext: () => void;
  goBack: () => void;
  /** Jumps straight to a step, skipping everything in between -- used when a just-claimed account
   * (register() against an email a tenant admin already added kids under) turns out to already
   * have kids, so the child-name..child-iep steps (built for a parent with zero kids) don't apply. */
  goToStep: (step: StepId) => void;
  /** Only meaningful for OPTIONAL_STEPS -- marks the step explicitly skipped (not just "not
   * answered yet") and advances. */
  skipStep: (step: OptionalStepId) => void;
  optionalStatus: Record<OptionalStepId, OptionalStepStatus>;
  requiredStepNumber: number | null;
  requiredStepCount: number;
  /** Set once register() succeeds (VerifyEmail step) -- the only piece of real session state this
   * flow needs before Home exists. Not persisted to localStorage yet; a reload mid-onboarding
   * starts over, same as every other piece of draft state. */
  token: string | null;
  setToken: (token: string) => void;
  /** Set once createFirstKid() succeeds (ChildGender step) -- needed by Therapies/Schedule to
   * PATCH the right kid. */
  kidId: string | null;
  setKidId: (kidId: string) => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [kidId, setKidId] = useState<string | null>(null);
  const [optionalStatus, setOptionalStatus] = useState<Record<OptionalStepId, OptionalStepStatus>>({
    "child-gender": "pending",
    "child-therapies": "pending",
    "child-schedule": "pending",
    "child-iep": "pending",
  });

  const stepId = STEP_ORDER[stepIndex];

  function patchDraft(patch: Partial<OnboardingDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function goNext() {
    if (OPTIONAL_STEPS.includes(stepId as OptionalStepId)) {
      setOptionalStatus((s) => ({ ...s, [stepId as OptionalStepId]: "answered" }));
    }
    setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function goToStep(step: StepId) {
    const idx = STEP_ORDER.indexOf(step);
    if (idx >= 0) setStepIndex(idx);
  }

  function skipStep(step: OptionalStepId) {
    setOptionalStatus((s) => ({ ...s, [step]: "skipped" }));
    setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  }

  const requiredStepCount = 6;
  const requiredStepNumber = useMemo(() => {
    const idx = STEP_ORDER.indexOf(stepId);
    return idx >= 0 && idx < requiredStepCount ? idx + 1 : null;
  }, [stepId, requiredStepCount]);

  const value: OnboardingContextValue = {
    draft,
    patchDraft,
    stepId,
    stepIndex,
    goNext,
    goBack,
    goToStep,
    skipStep,
    optionalStatus,
    requiredStepNumber,
    requiredStepCount,
    token,
    setToken,
    kidId,
    setKidId,
  };

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}
