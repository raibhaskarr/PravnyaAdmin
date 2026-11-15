import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../../api/client";
import { deferred } from "../../test/apiMock";
import { makeKid, makeProfile } from "../../test/fixtures";
import { renderOnboarding } from "../../test/onboarding";

// The six required steps: CreateLogin, YourName, Consent, VerifyEmail, ChildName, ChildDob.

vi.mock("../../api/client", async (orig) => (await import("../../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

const continueBtn = () => screen.getByRole("button", { name: "Continue" });

describe("CreateLogin", () => {
  const cases: { email: string; password: string; ok: boolean }[] = [
    { email: "", password: "", ok: false },
    { email: "parent@test.local", password: "1234567", ok: false }, // 7 chars
    { email: "parent@test.local", password: "12345678", ok: true }, // exactly 8
    { email: "not-an-email", password: "longenough", ok: false },
    { email: "missing@tld", password: "longenough", ok: false },
    { email: "a@b.co", password: "longenough", ok: true }
  ];
  for (const c of cases) {
    test(`email=${JSON.stringify(c.email)} password length ${c.password.length} -> ${c.ok ? "enabled" : "disabled"}`, async () => {
      const user = userEvent.setup();
      renderOnboarding();
      if (c.email) await user.type(screen.getByLabelText("Email"), c.email);
      if (c.password) await user.type(screen.getByLabelText("Password"), c.password);
      if (c.ok) expect(continueBtn()).toBeEnabled();
      else expect(continueBtn()).toBeDisabled();
    });
  }

  test("valid details + Enter advances to your-name", async () => {
    const user = userEvent.setup();
    const { currentStep } = renderOnboarding();
    await user.type(screen.getByLabelText("Email"), "parent@test.local");
    await user.type(screen.getByLabelText("Password"), "longenough{Enter}");
    expect(currentStep()).toBe("your-name");
    expect(screen.getByText("What should we call you?")).toBeInTheDocument();
  });

  // The button is disabled while invalid, so a user can't normally trigger this -- submitting the
  // form directly still shouldn't advance, and does reveal the field hints.
  test("submitting invalid details shows both hints and stays put", () => {
    const { currentStep, container } = renderOnboarding();
    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("At least 8 characters.")).toBeInTheDocument();
    expect(currentStep()).toBe("create-login");
  });

  test("the first step has no Back button", () => {
    renderOnboarding();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });
});

describe("YourName", () => {
  test("whitespace-only name can't continue; a real name advances to consent", async () => {
    const user = userEvent.setup();
    const { currentStep } = renderOnboarding({ step: "your-name" });
    await user.type(screen.getByLabelText("Your name"), "   ");
    expect(continueBtn()).toBeDisabled();
    await user.type(screen.getByLabelText("Your name"), "Asha{Enter}");
    expect(currentStep()).toBe("consent");
  });

  test("Enter on an empty name doesn't advance", async () => {
    const { currentStep, container } = renderOnboarding({ step: "your-name" });
    fireEvent.submit(container.querySelector("form")!);
    expect(currentStep()).toBe("your-name");
  });

  test("Back returns to create-login with the draft intact", async () => {
    const user = userEvent.setup();
    const { currentStep } = renderOnboarding({ step: "your-name", draft: { email: "kept@test.local" } });
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(currentStep()).toBe("create-login");
    expect(screen.getByLabelText("Email")).toHaveValue("kept@test.local");
  });
});

describe("Consent", () => {
  beforeEach(() => {
    mockApi.sendVerificationCode.mockResolvedValue({ sent: true });
  });

  test("never pre-checked; Continue only enabled once ticked (and disabled again if unticked)", async () => {
    const user = userEvent.setup();
    renderOnboarding({ step: "consent" });
    const box = screen.getByRole("checkbox", { name: "Confirm parent or guardian consent" });
    expect(box).not.toBeChecked();
    expect(continueBtn()).toBeDisabled();
    await user.click(box);
    expect(continueBtn()).toBeEnabled();
    await user.click(box);
    expect(continueBtn()).toBeDisabled();
  });

  test("links to the privacy policy in a new tab", () => {
    renderOnboarding({ step: "consent" });
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("target", "_blank");
  });

  test("Continue sends the verification code to the draft email and advances", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ sent: boolean }>();
    mockApi.sendVerificationCode.mockReturnValue(pending.promise);
    const { currentStep } = renderOnboarding({ step: "consent", draft: { email: "parent@test.local" } });
    await user.click(screen.getByRole("checkbox"));
    await user.click(continueBtn());
    expect(screen.getByRole("button", { name: "Sending code..." })).toBeDisabled();
    expect(mockApi.sendVerificationCode).toHaveBeenCalledWith("parent@test.local");
    pending.resolve({ sent: true });
    await waitFor(() => expect(currentStep()).toBe("verify-email"));
  });

  test("API error is shown and the step doesn't advance", async () => {
    const user = userEvent.setup();
    mockApi.sendVerificationCode.mockRejectedValue(new ApiError(429, "Too many codes requested"));
    const { currentStep } = renderOnboarding({ step: "consent", draft: { consentAccepted: true } });
    await user.click(continueBtn());
    expect(await screen.findByText("Too many codes requested")).toBeInTheDocument();
    expect(currentStep()).toBe("consent");
    expect(continueBtn()).toBeEnabled();
  });

  test("non-API error -> generic message", async () => {
    const user = userEvent.setup();
    mockApi.sendVerificationCode.mockRejectedValue(new Error("offline"));
    renderOnboarding({ step: "consent", draft: { consentAccepted: true } });
    await user.click(continueBtn());
    expect(await screen.findByText("Couldn't send a verification code. Try again.")).toBeInTheDocument();
  });
});

describe("VerifyEmail", () => {
  const draft = { email: "parent@test.local", password: "longenough", parentName: "Asha", consentAccepted: true };

  beforeEach(() => {
    mockApi.register.mockResolvedValue({ token: "new-token", parent: makeProfile({ kids: undefined }) });
    mockApi.me.mockResolvedValue(makeProfile({ kids: [] }));
  });

  test("names the email the code went to (or a fallback)", () => {
    renderOnboarding({ step: "verify-email", draft });
    expect(screen.getByText("We sent a 6-digit code to parent@test.local.")).toBeInTheDocument();
  });

  test("fallback copy without an email", () => {
    renderOnboarding({ step: "verify-email" });
    expect(screen.getByText("We sent a 6-digit code to your email.")).toBeInTheDocument();
  });

  test("strips non-digits, caps at 6, and only enables Continue for exactly 6 digits", async () => {
    const user = userEvent.setup();
    renderOnboarding({ step: "verify-email", draft });
    const input = screen.getByLabelText("Verification code");
    await user.type(input, "12a-34 5");
    expect(input).toHaveValue("12345");
    expect(continueBtn()).toBeDisabled();
    await user.type(input, "6");
    expect(input).toHaveValue("123456");
    expect(continueBtn()).toBeEnabled();
    await user.type(input, "7");
    expect(input).toHaveValue("123456");
  });

  test("registers with the whole draft + consent, then checks /me; no kids -> child-name", async () => {
    const user = userEvent.setup();
    const { currentStep } = renderOnboarding({ step: "verify-email", draft });
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(continueBtn());
    await waitFor(() => expect(currentStep()).toBe("child-name"));
    expect(mockApi.register).toHaveBeenCalledWith({ email: "parent@test.local", password: "longenough", name: "Asha", verificationCode: "123456", consent: true });
    expect(mockApi.me).toHaveBeenCalledWith("new-token");
  });

  test("/me without a kids field is treated as no kids", async () => {
    const user = userEvent.setup();
    mockApi.me.mockResolvedValue(makeProfile({ kids: undefined }));
    const { currentStep } = renderOnboarding({ step: "verify-email", draft });
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(continueBtn());
    await waitFor(() => expect(currentStep()).toBe("child-name"));
  });

  test("an account that already has kids skips straight to done; Go to Home uses the new token", async () => {
    const user = userEvent.setup();
    mockApi.me.mockResolvedValue(makeProfile({ kids: [makeKid()] }));
    const { currentStep, onFinish } = renderOnboarding({ step: "verify-email", draft });
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(continueBtn());
    await waitFor(() => expect(currentStep()).toBe("done"));
    expect(screen.getByText("Your account's ready -- head to Home to see what's already there.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to Home" }));
    expect(onFinish).toHaveBeenCalledWith("new-token");
  });

  test("shows Verifying... while in flight", async () => {
    const user = userEvent.setup();
    mockApi.register.mockReturnValue(new Promise(() => {}));
    renderOnboarding({ step: "verify-email", draft: { ...draft, verificationCode: "123456" } });
    await user.click(continueBtn());
    expect(screen.getByRole("button", { name: "Verifying..." })).toBeDisabled();
  });

  test("wrong code -> server message, stays on the step", async () => {
    const user = userEvent.setup();
    mockApi.register.mockRejectedValue(new ApiError(400, "That code is incorrect or expired"));
    const { currentStep } = renderOnboarding({ step: "verify-email", draft: { ...draft, verificationCode: "000000" } });
    await user.click(continueBtn());
    expect(await screen.findByText("That code is incorrect or expired")).toBeInTheDocument();
    expect(currentStep()).toBe("verify-email");
  });

  test("non-API error -> generic message", async () => {
    const user = userEvent.setup();
    mockApi.me.mockRejectedValue(new Error("offline"));
    renderOnboarding({ step: "verify-email", draft: { ...draft, verificationCode: "123456" } });
    await user.click(continueBtn());
    expect(await screen.findByText("Couldn't verify that code. Try again.")).toBeInTheDocument();
  });
});

describe("ChildName", () => {
  test("requires a non-blank name, then advances to child-dob", async () => {
    const user = userEvent.setup();
    const { currentStep } = renderOnboarding({ step: "child-name" });
    expect(continueBtn()).toBeDisabled();
    await user.type(screen.getByLabelText("Child's name"), "  ");
    expect(continueBtn()).toBeDisabled();
    await user.type(screen.getByLabelText("Child's name"), "Sam Testchild");
    await user.click(continueBtn());
    expect(currentStep()).toBe("child-dob");
  });
});

describe("ChildDob", () => {
  test("asks using the child's first name; a full date enables Continue; future dates are capped", async () => {
    const { currentStep } = renderOnboarding({ step: "child-dob", draft: { childName: "  Sam Testchild " } });
    expect(screen.getByText("When was Sam born?")).toBeInTheDocument();
    const input = screen.getByLabelText("Date of birth");
    expect(input).toHaveAttribute("max", new Date().toISOString().slice(0, 10));
    expect(continueBtn()).toBeDisabled();
    fireEvent.change(input, { target: { value: "2021-03-04" } });
    expect(continueBtn()).toBeEnabled();
    await userEvent.click(continueBtn());
    expect(currentStep()).toBe("child-gender");
  });

  test("falls back to 'your child' without a name", () => {
    renderOnboarding({ step: "child-dob" });
    expect(screen.getByText("When was your child born?")).toBeInTheDocument();
  });

  test("shows the full progress bar on the last required step", () => {
    const { container } = renderOnboarding({ step: "child-dob" });
    expect(container.querySelector("[style*='width']")).toHaveStyle({ width: "100%" });
  });
});
