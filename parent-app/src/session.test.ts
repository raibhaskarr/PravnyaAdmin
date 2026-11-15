import { describe, expect, test, vi } from "vitest";
import { clearStoredToken, getStoredToken, setStoredToken } from "./session";

const KEY = "pravnya_parent_token";

describe("session token storage", () => {
  test("nothing stored -> null", () => {
    expect(getStoredToken()).toBeNull();
  });

  test("set then get round-trips under the expected key", () => {
    setStoredToken("tok-abc");
    expect(getStoredToken()).toBe("tok-abc");
    expect(localStorage.getItem(KEY)).toBe("tok-abc");
  });

  test("set overwrites a previous token", () => {
    setStoredToken("first");
    setStoredToken("second");
    expect(getStoredToken()).toBe("second");
  });

  test("clear removes it", () => {
    setStoredToken("tok-abc");
    clearStoredToken();
    expect(getStoredToken()).toBeNull();
  });

  describe("storage disabled (private browsing) never throws", () => {
    const boom = () => {
      throw new DOMException("denied", "SecurityError");
    };

    test("get returns null", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
      expect(getStoredToken()).toBeNull();
    });

    test("set is a silent no-op", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
      expect(() => setStoredToken("x")).not.toThrow();
      expect(spy).toHaveBeenCalledWith(KEY, "x");
    });

    test("clear is a silent no-op", () => {
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
      expect(() => clearStoredToken()).not.toThrow();
    });
  });
});
