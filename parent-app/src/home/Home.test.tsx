import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Home } from "./Home";

// Every api call resolves with empty data except /me -- enough to render each tab's shell. Real
// data rendering is covered by the E2E suite against a real backend.
vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  const me = {
    id: "parent-1",
    email: "parent@test.local",
    name: "Test Parent",
    kids: [{ id: "kid-1", firstName: "Sam", lastName: "Testchild", dob: null, gender: "Male", selfReportedTherapies: ["ABA"], selfReportedScheduleDays: ["Mon"] }]
  };
  const api = new Proxy({} as typeof actual.api, {
    get: (_t, prop) => vi.fn(() => Promise.resolve(prop === "me" ? me : []))
  });
  return { ...actual, api };
});

function renderHome() {
  return render(<Home token="t" onSessionExpired={vi.fn()} onSignOut={vi.fn()} />);
}

// The phone-width bottom bar is the last <nav>; the wide-screen left rail is the first.
const bottomBar = () => screen.getAllByRole("navigation").at(-1)!;

describe("Home tab navigation", () => {
  beforeEach(() => vi.clearAllMocks());

  test("starts on Home with Home marked as the current tab", async () => {
    renderHome();
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(within(bottomBar()).getByRole("button", { name: /Home/ })).toHaveAttribute("aria-current", "page");
  });

  for (const tab of ["Growth", "Activities", "Goals", "Profile"]) {
    test(`${tab}: tab bar stays visible, ${tab} is current, and there's no Back arrow`, async () => {
      const user = userEvent.setup();
      renderHome();
      await screen.findByText("Sam");
      await user.click(within(bottomBar()).getByRole("button", { name: new RegExp(tab) }));

      expect(await screen.findByText(tab, { selector: "header p" })).toBeInTheDocument();
      expect(within(bottomBar()).getByRole("button", { name: new RegExp(tab) })).toHaveAttribute("aria-current", "page");
      expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    });
  }

  test("tapping Home from another tab goes back to the feed", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText("Sam");
    await user.click(within(bottomBar()).getByRole("button", { name: /Goals/ }));
    await user.click(within(bottomBar()).getByRole("button", { name: /Home/ }));
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(within(bottomBar()).getByRole("button", { name: /Home/ })).toHaveAttribute("aria-current", "page");
  });
});
