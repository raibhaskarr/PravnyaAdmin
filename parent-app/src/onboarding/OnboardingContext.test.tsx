import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { OnboardingProvider, useOnboarding } from "./OnboardingContext";
import { emptyDraft, OPTIONAL_STEPS, REQUIRED_STEPS, STEP_ORDER } from "./types";

const wrapper = ({ children }: { children: ReactNode }) => <OnboardingProvider>{children}</OnboardingProvider>;
const setup = () => renderHook(() => useOnboarding(), { wrapper });

describe("onboarding step definitions (types.ts)", () => {
  test("the required path, then optional steps, then done", () => {
    expect(REQUIRED_STEPS).toEqual(["create-login", "your-name", "consent", "verify-email", "child-name", "child-dob"]);
    expect(OPTIONAL_STEPS).toEqual(["child-gender", "child-therapies", "child-schedule", "child-iep"]);
    expect(STEP_ORDER).toEqual([...REQUIRED_STEPS, ...OPTIONAL_STEPS, "done"]);
  });

  test("emptyDraft is blank, consent unticked, and a fresh object each call", () => {
    const a = emptyDraft();
    expect(a).toEqual({
      email: "",
      password: "",
      parentName: "",
      consentAccepted: false,
      verificationCode: "",
      childName: "",
      childDob: "",
      childGender: null,
      childTherapies: [],
      childScheduleDays: [],
      childIepFile: null
    });
    a.childTherapies.push("ABA");
    expect(emptyDraft().childTherapies).toEqual([]);
  });
});

describe("OnboardingProvider / useOnboarding", () => {
  test("throws a clear error outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useOnboarding())).toThrow("useOnboarding must be used within OnboardingProvider");
  });

  test("starts at create-login with an empty draft, no token/kid, all optional steps pending", () => {
    const { result } = setup();
    expect(result.current.stepId).toBe("create-login");
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.draft).toEqual(emptyDraft());
    expect(result.current.token).toBeNull();
    expect(result.current.kidId).toBeNull();
    expect(Object.values(result.current.optionalStatus)).toEqual(["pending", "pending", "pending", "pending"]);
  });

  test("goNext walks STEP_ORDER and stops at done", () => {
    const { result } = setup();
    const seen = [result.current.stepId];
    for (let i = 0; i < STEP_ORDER.length + 2; i++) {
      act(() => result.current.goNext());
      seen.push(result.current.stepId);
    }
    expect(seen.slice(0, STEP_ORDER.length)).toEqual(STEP_ORDER);
    expect(result.current.stepId).toBe("done");
  });

  test("goBack steps back and never goes below the first step", () => {
    const { result } = setup();
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    act(() => result.current.goBack());
    expect(result.current.stepId).toBe("your-name");
    act(() => result.current.goBack());
    act(() => result.current.goBack());
    expect(result.current.stepId).toBe("create-login");
  });

  test("required step number is 1..6 on the required path and null afterwards", () => {
    const { result } = setup();
    expect(result.current.requiredStepCount).toBe(6);
    const numbers: (number | null)[] = [];
    for (let i = 0; i < STEP_ORDER.length; i++) {
      numbers.push(result.current.requiredStepNumber);
      act(() => result.current.goNext());
    }
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, null, null, null, null, null]);
  });

  test("goNext on an optional step marks it answered; required steps don't touch optional status", () => {
    const { result } = setup();
    act(() => result.current.goToStep("child-dob"));
    act(() => result.current.goNext());
    expect(result.current.optionalStatus["child-gender"]).toBe("pending");
    act(() => result.current.goNext());
    expect(result.current.optionalStatus["child-gender"]).toBe("answered");
    expect(result.current.stepId).toBe("child-therapies");
  });

  test("skipStep marks the step skipped and advances", () => {
    const { result } = setup();
    act(() => result.current.goToStep("child-therapies"));
    act(() => result.current.skipStep("child-therapies"));
    expect(result.current.optionalStatus).toEqual({ "child-gender": "pending", "child-therapies": "skipped", "child-schedule": "pending", "child-iep": "pending" });
    expect(result.current.stepId).toBe("child-schedule");
  });

  test("skipping the last optional step lands on done, and can't advance past it", () => {
    const { result } = setup();
    act(() => result.current.goToStep("child-iep"));
    act(() => result.current.skipStep("child-iep"));
    expect(result.current.stepId).toBe("done");
    act(() => result.current.skipStep("child-iep"));
    expect(result.current.stepId).toBe("done");
  });

  test("goToStep jumps; an unknown step id is ignored", () => {
    const { result } = setup();
    act(() => result.current.goToStep("done"));
    expect(result.current.stepId).toBe("done");
    act(() => result.current.goToStep("nope" as never));
    expect(result.current.stepId).toBe("done");
  });

  test("patchDraft merges into the draft without dropping other fields", () => {
    const { result } = setup();
    act(() => result.current.patchDraft({ email: "a@test.local" }));
    act(() => result.current.patchDraft({ childTherapies: ["ABA"] }));
    expect(result.current.draft).toEqual({ ...emptyDraft(), email: "a@test.local", childTherapies: ["ABA"] });
  });

  test("setToken / setKidId store session ids", () => {
    const { result } = setup();
    act(() => result.current.setToken("tok"));
    act(() => result.current.setKidId("kid-9"));
    expect(result.current.token).toBe("tok");
    expect(result.current.kidId).toBe("kid-9");
  });
});
