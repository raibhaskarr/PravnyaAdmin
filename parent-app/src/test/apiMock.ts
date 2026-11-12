import { vi } from "vitest";
import type * as Client from "../api/client";

/**
 * Factory for `vi.mock("../api/client", ...)`: keeps the real module (ApiError, constants, types)
 * but replaces every `api.*` method with a bare `vi.fn()`. Tests set return values per case:
 *
 *   vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
 *   const mockApi = vi.mocked(api);
 *   mockApi.listGoals.mockResolvedValue([...]);
 */
export async function mockedClient(importOriginal: <T>() => Promise<T>): Promise<typeof Client> {
  const actual = await importOriginal<typeof Client>();
  const api = Object.fromEntries(Object.keys(actual.api).map((k) => [k, vi.fn()])) as unknown as typeof actual.api;
  return { ...actual, api };
}

/** A promise you resolve/reject by hand -- for asserting "Saving..." / disabled-while-pending states. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
