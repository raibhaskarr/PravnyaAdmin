import { describe, expect, test } from "vitest";
import { formatParentName } from "./parent";

describe("formatParentName", () => {
  test("both parents -> first names, mother first", () => {
    expect(formatParentName({ fatherName: "Ravi Kumar", motherName: "Asha Rao" })).toBe("Asha & Ravi");
  });
  test("only one parent on file -> that first name", () => {
    expect(formatParentName({ fatherName: "Ravi Kumar", motherName: null })).toBe("Ravi");
    expect(formatParentName({ fatherName: null, motherName: "  Asha  Rao " })).toBe("Asha");
  });
  test("no names -> 'Parent'", () => {
    expect(formatParentName({ fatherName: null, motherName: null })).toBe("Parent");
  });
});
