import { describe, expect, test } from "vitest";
import { floatToPcm16Base64, pcm16Base64ToFloat, rateFromMime } from "./audio";

describe("call audio", () => {
  test("float <-> 16-bit PCM round trip, little-endian, clipped", () => {
    const b64 = floatToPcm16Base64(new Float32Array([0, 0.5, -0.5, 1, -1, 2]));
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(bytes.length).toBe(12);
    expect([bytes[6], bytes[7]]).toEqual([0xff, 0x7f]); // 1.0 -> 32767, low byte first
    const back = pcm16Base64ToFloat(b64);
    expect(back[0]).toBe(0);
    expect(back[1]).toBeCloseTo(0.5, 3);
    expect(back[2]).toBeCloseTo(-0.5, 3);
    expect(back[4]).toBe(-1);
    expect(back[5]).toBeCloseTo(1, 3);
  });

  test("the sample rate comes from the MIME type", () => {
    expect(rateFromMime("audio/pcm;rate=24000")).toBe(24000);
    expect(rateFromMime("audio/pcm;rate=16000")).toBe(16000);
    expect(rateFromMime(undefined)).toBe(24000);
  });
});
