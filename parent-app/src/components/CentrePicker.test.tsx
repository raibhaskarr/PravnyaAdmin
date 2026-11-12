import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, type Centre } from "../api/client";
import { deferred } from "../test/apiMock";
import { CENTRE_A, CENTRE_B } from "../test/fixtures";
import { CentrePicker } from "./CentrePicker";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

// Controlled wrapper so value/onChange behave like a real parent component.
function Harness({ initial = null, onChange }: { initial?: Centre | null; onChange: (c: Centre | null) => void }) {
  const [value, setValue] = useState<Centre | null>(initial);
  return (
    <>
      <CentrePicker
        token="tok"
        value={value}
        onChange={(c) => {
          setValue(c);
          onChange(c);
        }}
      />
      <button type="button" onClick={() => setValue(CENTRE_B)}>
        external set
      </button>
    </>
  );
}

function renderPicker(initial: Centre | null = null) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} />);
  return { onChange, user: userEvent.setup(), input: screen.getByPlaceholderText("Centre or therapist (optional)") };
}

const option = (name: string) => screen.queryByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => {
  mockApi.listCentres.mockResolvedValue([CENTRE_A, CENTRE_B]);
  mockApi.createCentre.mockImplementation(async (_t, input) => ({ id: "centre-new", name: input.name, city: null }));
});

describe("<CentrePicker />", () => {
  test("loads centres once and shows them all on focus", async () => {
    const { user, input } = renderPicker();
    expect(mockApi.listCentres).toHaveBeenCalledWith("tok");
    expect(option(CENTRE_A.name)).not.toBeInTheDocument();
    await user.click(input);
    await waitFor(() => expect(option(CENTRE_A.name)).toBeInTheDocument());
    expect(option(CENTRE_B.name)).toBeInTheDocument();
  });

  test("custom placeholder", () => {
    render(<CentrePicker token="tok" value={null} onChange={vi.fn()} placeholder="Pick one" />);
    expect(screen.getByPlaceholderText("Pick one")).toBeInTheDocument();
  });

  test("filters case-insensitively by substring", async () => {
    const { user, input } = renderPicker();
    await waitFor(() => expect(mockApi.listCentres).toHaveBeenCalled());
    await user.type(input, "LEAPS");
    expect(option(CENTRE_B.name)).toBeInTheDocument();
    expect(option(CENTRE_A.name)).not.toBeInTheDocument();
  });

  test("picking a centre sets the value, fills the box, marks it selected and closes the list", async () => {
    const { user, input, onChange } = renderPicker();
    await user.click(input);
    await user.click(await screen.findByRole("button", { name: CENTRE_A.name }));
    expect(onChange).toHaveBeenLastCalledWith(CENTRE_A);
    expect(input).toHaveValue(CENTRE_A.name);
    expect(option(CENTRE_B.name)).not.toBeInTheDocument();
    await user.click(input);
    expect(screen.getByRole("button", { name: CENTRE_A.name })).toHaveTextContent("✓");
    // The box now holds the picked name, so the reopened list is filtered to it.
    expect(option(CENTRE_B.name)).not.toBeInTheDocument();
  });

  test("an exact (case-insensitive) match hides the 'add new' option; a new name offers it", async () => {
    const { user, input } = renderPicker();
    await waitFor(() => expect(mockApi.listCentres).toHaveBeenCalled());
    await user.type(input, CENTRE_A.name.toUpperCase());
    expect(screen.queryByRole("button", { name: /as a new centre/ })).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "  Brand New Place ");
    expect(screen.getByRole("button", { name: '+ Add "Brand New Place" as a new centre' })).toBeInTheDocument();
  });

  test("adding a new centre creates it with the trimmed name, selects it and closes", async () => {
    const pending = deferred<Centre>();
    mockApi.createCentre.mockReturnValue(pending.promise);
    const { user, input, onChange } = renderPicker();
    await user.type(input, " Brand New Place ");
    await user.click(screen.getByRole("button", { name: /as a new centre/ }));
    expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
    expect(mockApi.createCentre).toHaveBeenCalledWith("tok", { name: "Brand New Place" });
    pending.resolve({ id: "centre-new", name: "Brand New Place", city: null });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ id: "centre-new", name: "Brand New Place", city: null }));
    expect(screen.queryByRole("button", { name: /as a new centre/ })).not.toBeInTheDocument();
    // The new centre is now part of the list.
    await user.click(input);
    expect(screen.getByRole("button", { name: "Brand New Place" })).toHaveTextContent("✓");
  });

  test("clearing the box clears the selection", async () => {
    const { user, input, onChange } = renderPicker(CENTRE_A);
    expect(input).toHaveValue(CENTRE_A.name);
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("'No centres yet.' when the directory is empty and nothing typed", async () => {
    mockApi.listCentres.mockResolvedValue([]);
    const { user, input } = renderPicker();
    await user.click(input);
    expect(await screen.findByText("No centres yet.")).toBeInTheDocument();
    await user.type(input, "x");
    expect(screen.queryByText("No centres yet.")).not.toBeInTheDocument();
  });

  test("tapping outside closes the list", async () => {
    const { user, input } = renderPicker();
    await user.click(input);
    await screen.findByRole("button", { name: CENTRE_A.name });
    await user.click(document.querySelector("button[aria-hidden='true']")!);
    expect(option(CENTRE_A.name)).not.toBeInTheDocument();
  });

  test("the box follows an externally changed value", async () => {
    const { user, input } = renderPicker(CENTRE_A);
    await user.click(screen.getByRole("button", { name: "external set" }));
    expect(input).toHaveValue(CENTRE_B.name);
  });

  // BUG: neither listCentres() nor createCentre() failures are handled -- handleCreate has
  // try/finally with no catch, and the list fetch has no .catch, so a failure is an unhandled
  // promise rejection and the parent sees no feedback (the "Adding..." just reverts). Can't be
  // written as a passing/failing assertion without the unhandled rejection failing the run.
  test.todo("BUG: a failed 'add new centre' shows an error instead of an unhandled rejection");
  test.todo("BUG: a failed centre-list fetch is handled (no unhandled rejection)");
});
