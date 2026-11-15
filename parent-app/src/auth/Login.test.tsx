import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, ApiError } from "../api/client";
import { deferred } from "../test/apiMock";
import { makeProfile } from "../test/fixtures";
import { Login } from "./Login";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

describe("<Login />", () => {
  function renderLogin() {
    const props = { onBack: vi.fn(), onLoggedIn: vi.fn(), onForgotPassword: vi.fn(), onCreateAccount: vi.fn() };
    render(<Login {...props} />);
    return props;
  }
  const signIn = () => screen.getByRole("button", { name: /^Sign(ing)? in/ });

  beforeEach(() => {
    mockApi.login.mockResolvedValue({ token: "tok-login", parent: makeProfile() });
  });

  test("Sign in needs both email and password", async () => {
    const user = userEvent.setup();
    renderLogin();
    expect(signIn()).toBeDisabled();
    await user.type(screen.getByLabelText("Email"), "parent@test.local");
    expect(signIn()).toBeDisabled();
    await user.type(screen.getByLabelText("Password"), "x");
    expect(signIn()).toBeEnabled();
  });

  test("submits credentials and hands back the token", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ token: string; parent: ReturnType<typeof makeProfile> }>();
    mockApi.login.mockReturnValue(pending.promise);
    const { onLoggedIn } = renderLogin();
    await user.type(screen.getByLabelText("Email"), "parent@test.local");
    await user.type(screen.getByLabelText("Password"), "secret-pass{Enter}");
    expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled();
    expect(mockApi.login).toHaveBeenCalledWith("parent@test.local", "secret-pass");
    pending.resolve({ token: "tok-login", parent: makeProfile() });
    await vi.waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith("tok-login"));
  });

  test("wrong credentials -> server message; generic message otherwise", async () => {
    const user = userEvent.setup();
    mockApi.login.mockRejectedValueOnce(new ApiError(401, "Invalid email or password")).mockRejectedValueOnce(new Error("offline"));
    const { onLoggedIn } = renderLogin();
    await user.type(screen.getByLabelText("Email"), "parent@test.local");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(signIn());
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    await user.click(signIn());
    expect(await screen.findByText("Couldn't sign in. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  test("Back, Forgot password and Create account links", async () => {
    const user = userEvent.setup();
    const { onBack, onForgotPassword, onCreateAccount } = renderLogin();
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.click(screen.getByRole("button", { name: "New here? Create an account" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onForgotPassword).toHaveBeenCalledOnce();
    expect(onCreateAccount).toHaveBeenCalledOnce();
    expect(mockApi.login).not.toHaveBeenCalled();
  });
});
