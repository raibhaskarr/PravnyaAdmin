/* oxlint-disable react/only-export-components -- test-only helper, never hot-reloaded */
import { render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { vi } from "vitest";
import { OnboardingProvider, useOnboarding } from "../onboarding/OnboardingContext";
import { OnboardingFlow } from "../onboarding/OnboardingFlow";
import type { OnboardingDraft, StepId } from "../onboarding/types";

// Test harness: renders the real provider + flow, optionally jumping straight to a step with a
// pre-filled draft/token/kidId, plus an invisible probe exposing the context's step + skip state.

function Setup({ step, draft, token, kidId }: { step?: StepId; draft?: Partial<OnboardingDraft>; token?: string; kidId?: string }) {
  const ctx = useOnboarding();
  useLayoutEffect(() => {
    if (draft) ctx.patchDraft(draft);
    if (token) ctx.setToken(token);
    if (kidId) ctx.setKidId(kidId);
    if (step) ctx.goToStep(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Probe() {
  const { stepId, optionalStatus } = useOnboarding();
  return (
    <div hidden>
      <span data-testid="step">{stepId}</span>
      <span data-testid="optional-status">{JSON.stringify(optionalStatus)}</span>
    </div>
  );
}

export function renderOnboarding(opts: { step?: StepId; draft?: Partial<OnboardingDraft>; token?: string; kidId?: string } = {}) {
  const onFinish = vi.fn();
  const utils = render(
    <OnboardingProvider>
      <Setup {...opts} />
      <Probe />
      <OnboardingFlow onFinish={onFinish} />
    </OnboardingProvider>
  );
  return {
    ...utils,
    onFinish,
    currentStep: () => screen.getByTestId("step").textContent as StepId,
    optionalStatus: () => JSON.parse(screen.getByTestId("optional-status").textContent!) as Record<string, string>
  };
}
