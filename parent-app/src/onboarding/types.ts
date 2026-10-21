// The required path is exactly: login -> name -> consent -> verify -> child name -> child dob.
// Everything after that is optional and individually skippable -- see OnboardingContext for the
// skip-tracking that makes "skipped" a real, distinguishable outcome from "answered."
export type RequiredStepId =
  | "create-login"
  | "your-name"
  | "consent"
  | "verify-email"
  | "child-name"
  | "child-dob";

export type OptionalStepId = "child-gender" | "child-therapies" | "child-schedule" | "child-iep";

export type StepId = RequiredStepId | OptionalStepId | "done";

export const REQUIRED_STEPS: RequiredStepId[] = [
  "create-login",
  "your-name",
  "consent",
  "verify-email",
  "child-name",
  "child-dob",
];

export const OPTIONAL_STEPS: OptionalStepId[] = ["child-gender", "child-therapies", "child-schedule", "child-iep"];

export const STEP_ORDER: StepId[] = [...REQUIRED_STEPS, ...OPTIONAL_STEPS, "done"];

export interface OnboardingDraft {
  email: string;
  password: string;
  parentName: string;
  consentAccepted: boolean;
  verificationCode: string;
  childName: string;
  childDob: string; // ISO yyyy-mm-dd, kept as a plain string until submit
  childGender: string | null;
  childTherapies: string[];
  childScheduleDays: string[];
  childIepFile: File | null;
}

export function emptyDraft(): OnboardingDraft {
  return {
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
    childIepFile: null,
  };
}

/** Distinguishes "answered" from "explicitly skipped" from "not reached yet" -- a skipped step
 * should never be silently indistinguishable from one the parent never saw, since that's exactly
 * the data future activation-style nudges need to decide what to ask about later. */
export type OptionalStepStatus = "answered" | "skipped" | "pending";
