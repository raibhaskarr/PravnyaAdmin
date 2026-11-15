import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../api/client";
import { makeProfile } from "../test/fixtures";
import { renderOnboarding } from "../test/onboarding";
import { OnboardingProvider, useOnboarding } from "./OnboardingContext";
import { OnboardingShell } from "./OnboardingShell";
import { STEP_ORDER, type StepId } from "./types";
import { Welcome } from "./Welcome";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

describe("OnboardingFlow -- full happy path", () => {
  beforeEach(() => {
    mockApi.sendVerificationCode.mockResolvedValue({ sent: true });
    mockApi.register.mockResolvedValue({ token: "tok-new", parent: makeProfile({ kids: undefined }) });
    mockApi.me.mockResolvedValue(makeProfile({ kids: [] }));
    mockApi.createFirstKid.mockResolvedValue({ id: "kid-new", firstName: "Sam", lastName: "", dob: null, gender: null });
    mockApi.updateKid.mockResolvedValue({} as never);
  });

  test("required steps, then skipping every optional step, ends on Done and finishes with the new token", async () => {
    const user = userEvent.setup();
    const { onFinish, currentStep, optionalStatus } = renderOnboarding();

    await user.type(screen.getByLabelText("Email"), "parent@test.local");
    await user.type(screen.getByLabelText("Password"), "longenough");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Your name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(await screen.findByLabelText("Child's name"), "Sam");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2021-03-04" } });
    await user.click(screen.getByRole("button", { name: "Continue" }));

    for (const step of ["child-gender", "child-therapies", "child-schedule", "child-iep"] as StepId[]) {
      await waitFor(() => expect(currentStep()).toBe(step));
      await user.click(screen.getByRole("button", { name: "Skip for now" }));
    }

    expect(await screen.findByText("You're all set")).toBeInTheDocument();
    expect(Object.values(optionalStatus())).toEqual(["skipped", "skipped", "skipped", "skipped"]);
    await user.click(screen.getByRole("button", { name: "Go to Home" }));
    expect(onFinish).toHaveBeenCalledWith("tok-new");
  });

  test("every step id renders a screen (no blank step)", () => {
    for (const step of STEP_ORDER) {
      const { container, unmount } = renderOnboarding({ step });
      expect(container.querySelector("h1"), step).not.toBeNull();
      unmount();
    }
  });
});

describe("OnboardingShell", () => {
  // Renders the bare shell (not a real step) inside the provider, positioned at `step`.
  function renderShellAt(step: StepId, footer?: ReactNode) {
    return render(
      <OnboardingProvider>
        <Jump step={step} />
        <OnboardingShell footer={footer}>
          <p>child content</p>
        </OnboardingShell>
      </OnboardingProvider>
    );
  }

  test("first step: no Back, progress 1/6", () => {
    const { container } = renderShellAt("create-login");
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(container.querySelector("[style*='width']")).toHaveStyle({ width: `${(1 / 6) * 100}%` });
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  test("a later required step: Back present, progress grows", () => {
    const { container } = renderShellAt("verify-email");
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(container.querySelector("[style*='width']")).toHaveStyle({ width: `${(4 / 6) * 100}%` });
    expect(screen.queryByText(/Almost there/)).not.toBeInTheDocument();
  });

  test("optional steps swap the bar for a soft 'almost there' label", () => {
    const { container } = renderShellAt("child-schedule");
    expect(container.querySelector("[style*='width']")).toBeNull();
    expect(screen.getByText("Almost there — a few optional details")).toBeInTheDocument();
  });

  test("done: no Back, no progress, no label", () => {
    const { container } = renderShellAt("done");
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(container.querySelector("[style*='width']")).toBeNull();
    expect(screen.queryByText(/Almost there/)).not.toBeInTheDocument();
  });

  test("renders an optional footer", () => {
    renderShellAt("consent", <span>footer bits</span>);
    expect(screen.getByText("footer bits").closest("footer")).not.toBeNull();
  });
});

function Jump({ step }: { step: StepId }) {
  const { goToStep } = useOnboarding();
  useLayoutEffect(() => goToStep(step), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

describe("Welcome", () => {
  test("Get started and Sign in call their handlers", async () => {
    const onStart = vi.fn();
    const onSignIn = vi.fn();
    render(<Welcome onStart={onStart} onSignIn={onSignIn} />);
    expect(screen.getByRole("heading", { name: "Pravnya" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(onStart).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
