import { describe, expect, test } from "vitest";
import { itemLabel, measurementLabel } from "./goalEvidence";

const m = (fields: Partial<Parameters<typeof measurementLabel>[0]>) =>
  measurementLabel({ measurementType: null, measurementValue: null, measurementUnit: null, measurementBoolean: null, measurementText: null, ...fields });

describe("measurementLabel -- the extra value shown next to a logged session", () => {
  test("trial-shaped skills (no measurement type) show nothing extra", () => {
    expect(m({})).toBeNull();
  });
  test("frequency, with and without a unit", () => {
    expect(m({ measurementType: "FREQUENCY", measurementValue: 4, measurementUnit: "requests" })).toBe("4 requests");
    expect(m({ measurementType: "FREQUENCY", measurementValue: 4 })).toBe("4 times");
  });
  test("duration is humanised", () => {
    expect(m({ measurementType: "DURATION", measurementValue: 45 })).toBe("45 sec");
    expect(m({ measurementType: "DURATION", measurementValue: 120 })).toBe("2 min");
    expect(m({ measurementType: "DURATION", measurementValue: 150 })).toBe("2 min 30 sec");
  });
  test("percentage is rounded, rating is out of 5", () => {
    expect(m({ measurementType: "PERCENTAGE", measurementValue: 66.6 })).toBe("67%");
    expect(m({ measurementType: "RATING", measurementValue: 4 })).toBe("Rated 4/5");
  });
  test("yes/no reads as Yes / Not yet, and missing stays empty", () => {
    expect(m({ measurementType: "YES_NO", measurementBoolean: true })).toBe("Yes");
    expect(m({ measurementType: "YES_NO", measurementBoolean: false })).toBe("Not yet");
    expect(m({ measurementType: "YES_NO" })).toBeNull();
  });
  test("a typed measurement with no value shows nothing rather than 'null'", () => {
    expect(m({ measurementType: "FREQUENCY" })).toBeNull();
    expect(m({ measurementType: "PERCENTAGE" })).toBeNull();
  });
  test("free observation shows the note", () => {
    expect(m({ measurementType: "FREE_OBSERVATION", measurementText: "Waited for turn" })).toBe("Waited for turn");
  });
});

describe("itemLabel", () => {
  const base = { id: "i1", canonicalSkillItemId: null, customText: null, canonicalSkillItem: null, evidence: [] };
  test("custom text wins, then the catalogue name, then 'General practice'", () => {
    expect(itemLabel({ ...base, customText: "Bubbles", canonicalSkillItem: { displayName: "Ball" } } as never)).toBe("Bubbles");
    expect(itemLabel({ ...base, canonicalSkillItem: { displayName: "Ball" } } as never)).toBe("Ball");
    expect(itemLabel(base as never)).toBe("General practice");
  });
});
