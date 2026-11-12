import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { api, ApiError } from "./api/client";
import { getStoredToken, setStoredToken } from "./session";
import { makeProfile } from "./test/fixtures";

vi.mock("./api/client", async (orig) => (await import("./test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

beforeEach(() => {
  mockApi.me.mockResolvedValue(makeProfile());
  mockApi.listGoals.mockResolvedValue([]);
  mockApi.listCompanionMessages.mockResolvedValue([]);
  mockApi.listSchedule.mockResolvedValue([]);
  mockApi.login.mockResolvedValue({ token: "tok-login", parent: makeProfile() });
  mockApi.sendVerificationCode.mockResolvedValue({ sent: true });
  mockApi.resetPassword.mockResolvedValue({ token: "tok-reset", parent: makeProfile() });
});

const welcomeShown = () => screen.findByRole("button", { name: "Get started" });

describe("App phase switching", () => {
  test("no stored token -> Welcome", async () => {
    render(<App />);
    expect(await welcomeShown()).toBeInTheDocument();
    expect(mockApi.me).not.toHaveBeenCalled();
  });

  test("a stored token resumes straight to Home, validated against /me", async () => {
    setStoredToken("tok-stored");
    render(<App />);
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(mockApi.me).toHaveBeenCalledWith("tok-stored");
  });

  test("signing out clears the token and returns to Welcome", async () => {
    setStoredToken("tok-stored");
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await welcomeShown()).toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
  });

  test("an expired stored token (401 from /me) bounces back to Welcome and clears it", async () => {
    setStoredToken("tok-stale");
    mockApi.me.mockRejectedValue(new ApiError(401, "expired"));
    render(<App />);
    expect(await welcomeShown()).toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
  });

  test("Welcome -> Get started -> onboarding", async () => {
    render(<App />);
    await userEvent.click(await welcomeShown());
    expect(screen.getByText("Let's get set up")).toBeInTheDocument();
  });

  test("Welcome -> Sign in -> successful login stores the token and opens Home", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    await user.type(screen.getByLabelText("Email"), "parent@test.local");
    await user.type(screen.getByLabelText("Password"), "secret-pass{Enter}");
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(getStoredToken()).toBe("tok-login");
    expect(mockApi.me).toHaveBeenCalledWith("tok-login");
  });

  test("Login Back -> Welcome; Login 'Create an account' -> onboarding", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await welcomeShown()).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    await user.click(screen.getByRole("button", { name: "New here? Create an account" }));
    expect(screen.getByText("Let's get set up")).toBeInTheDocument();
  });

  test("Login -> Forgot password -> Back returns to Login; a reset signs you in", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Welcome back")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "parent@test.local{Enter}");
    await user.type(await screen.findByLabelText("Verification code"), "123456");
    await user.type(screen.getByLabelText("New password"), "newpass99{Enter}");
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(getStoredToken()).toBe("tok-reset");
  });
});
