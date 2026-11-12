import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../api/client";
import { deferred } from "../test/apiMock";
import { makeProfile } from "../test/fixtures";
import { ForgotPassword } from "./ForgotPassword";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

describe("<ForgotPassword />", () => {
  function renderForgot() {
    const props = { onBack: vi.fn(), onReset: vi.fn() };
    render(<ForgotPassword {...props} />);
    return props;
  }

  beforeEach(() => {
    mockApi.sendVerificationCode.mockResolvedValue({ sent: true });
    mockApi.resetPassword.mockResolvedValue({ token: "tok-reset", parent: makeProfile() });
  });

  async function toResetPhase(user = userEvent.setup()) {
    await user.type(screen.getByLabelText("Email"), "parent@test.local");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByText("Enter the code we sent to parent@test.local, and your new password.");
    return user;
  }

  test("phase 1: Send code needs an email and sends the code", async () => {
    const user = userEvent.setup();
    renderForgot();
    expect(screen.getByRole("button", { name: "Send code" })).toBeDisabled();
    await toResetPhase(user);
    expect(mockApi.sendVerificationCode).toHaveBeenCalledWith("parent@test.local");
  });

  test("phase 1: Sending... while in flight; errors (API vs generic) keep you on phase 1", async () => {
    const user = userEvent.setup();
    const pending = deferred<never>();
    mockApi.sendVerificationCode.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error("offline"));
    renderForgot();
    await user.type(screen.getByLabelText("Email"), "parent@test.local");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    pending.reject(new ApiError(404, "No account with that email"));
    expect(await screen.findByText("No account with that email")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Couldn't send a code. Try again.")).toBeInTheDocument();
  });

  test("phase 1 Back leaves the screen", async () => {
    const { onBack } = renderForgot();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  test("phase 2: needs a 6-digit code (digits only) and an 8+ char password; resets and hands back the token", async () => {
    renderForgot();
    const user = await toResetPhase();
    const reset = () => screen.getByRole("button", { name: "Reset password" });
    expect(reset()).toBeDisabled();

    const code = screen.getByLabelText("Verification code");
    await user.type(code, "12ab3456");
    expect(code).toHaveValue("123456");
    await user.type(screen.getByLabelText("New password"), "1234567");
    expect(reset()).toBeDisabled();
    await user.type(screen.getByLabelText("New password"), "8");
    expect(reset()).toBeEnabled();
    await user.click(reset());
    expect(mockApi.resetPassword).toHaveBeenCalledWith({ email: "parent@test.local", verificationCode: "123456", newPassword: "12345678" });
  });

  test("phase 2: onReset gets the new token", async () => {
    const props = renderForgot();
    const user = await toResetPhase();
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.type(screen.getByLabelText("New password"), "newpass99{Enter}");
    await vi.waitFor(() => expect(props.onReset).toHaveBeenCalledWith("tok-reset"));
  });

  test("phase 2: Resetting... then API error vs generic error", async () => {
    const pending = deferred<never>();
    mockApi.resetPassword.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error("x"));
    const props = renderForgot();
    const user = await toResetPhase();
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.type(screen.getByLabelText("New password"), "newpass99");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByRole("button", { name: "Resetting..." })).toBeDisabled();
    pending.reject(new ApiError(400, "Code expired"));
    expect(await screen.findByText("Code expired")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByText("Couldn't reset your password. Try again.")).toBeInTheDocument();
    expect(props.onReset).not.toHaveBeenCalled();
  });

  test("phase 2 Back returns to the email phase (not out of the screen), email kept", async () => {
    const props = renderForgot();
    const user = await toResetPhase();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("parent@test.local");
    expect(props.onBack).not.toHaveBeenCalled();
  });
});
