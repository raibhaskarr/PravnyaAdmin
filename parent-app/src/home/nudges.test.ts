import { describe, expect, test } from "vitest";
import { computeNudge } from "./nudges";

const kid = (overrides: Partial<Parameters<typeof computeNudge>[0]> = {}) => ({
  id: "kid-1",
  firstName: "Sam",
  lastName: "Testchild",
  dob: null,
  gender: "Male",
  selfReportedTherapies: ["Speech therapy"],
  selfReportedScheduleDays: ["Mon"],
  ...overrides
});

describe("computeNudge -- asks for the most useful missing detail first", () => {
  test("nothing missing -> no nudge", () => {
    expect(computeNudge(kid())).toBeNull();
  });

  test("therapies come first", () => {
    expect(computeNudge(kid({ selfReportedTherapies: [], selfReportedScheduleDays: [], gender: null }))).toBe("therapies");
  });

  test("then schedule days", () => {
    expect(computeNudge(kid({ selfReportedScheduleDays: [], gender: null }))).toBe("schedule");
  });

  test("then gender", () => {
    expect(computeNudge(kid({ gender: null }))).toBe("gender");
  });
});
