import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../api/client";
import { TapLog } from "./taps";

vi.mock("../api/client", async (orig) => (await import("../test/apiMock")).mockedClient(orig));
const mockApi = vi.mocked(api);

beforeEach(() => {
  mockApi.sendAacTaps.mockResolvedValue({ saved: 0 });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TapLog", () => {
  test("every ~20s it flushes the buffer to the server; nothing goes out while the buffer is empty", async () => {
    const log = new TapLog("tok", "kid-1");
    log.start();
    expect(mockApi.sendAacTaps).not.toHaveBeenCalled();
    log.record({ cellId: "c1", pageId: "p1", label: "eat", wordClass: "verb", kind: "word" });
    await vi.advanceTimersByTimeAsync(20_100);
    expect(mockApi.sendAacTaps).toHaveBeenCalledOnce();
    const [token, kidId, batch] = mockApi.sendAacTaps.mock.calls[0];
    expect(token).toBe("tok");
    expect(kidId).toBe("kid-1");
    expect(batch[0]).toMatchObject({ cellId: "c1", pageId: "p1", label: "eat", wordClass: "verb", kind: "word" });
    expect(batch[0].at).toMatch(/\d{4}-\d{2}-\d{2}T/);
    log.stop();
  });

  test("stop() flushes what's still buffered", async () => {
    const log = new TapLog("tok", "kid-1");
    log.start();
    log.record({ cellId: "c2", pageId: "p1", label: "more", wordClass: "describe", kind: "word" });
    log.stop();
    await Promise.resolve();
    expect(mockApi.sendAacTaps).toHaveBeenCalledOnce();
  });

  test("a failed send keeps the taps for the next tick (so nothing is lost)", async () => {
    mockApi.sendAacTaps.mockRejectedValueOnce(new Error("offline"));
    const log = new TapLog("tok", "kid-1");
    log.start();
    log.record({ cellId: "c3", pageId: "p1", label: "help", wordClass: "verb", kind: "word" });
    await vi.advanceTimersByTimeAsync(20_100);
    expect(mockApi.sendAacTaps).toHaveBeenCalledTimes(1);
    mockApi.sendAacTaps.mockResolvedValueOnce({ saved: 1 });
    await vi.advanceTimersByTimeAsync(20_100);
    expect(mockApi.sendAacTaps).toHaveBeenCalledTimes(2);
    expect(mockApi.sendAacTaps.mock.calls[1][2][0].cellId).toBe("c3");
    log.stop();
  });
});
