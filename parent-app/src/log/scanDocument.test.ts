import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const core = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => "android"),
  convertFileSrc: vi.fn((uri: string) => `https://localhost/_capacitor_file_${uri.replace("file://", "")}`)
}));
const scanner = vi.hoisted(() => ({ scanDocument: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: core }));
vi.mock("@capacitor-mlkit/document-scanner", () => ({ DocumentScanner: scanner }));

import { canScanDocuments, scanDocument } from "./scanDocument";

const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => vi.unstubAllGlobals());

describe("canScanDocuments", () => {
  test("only inside the Android app", () => {
    expect(canScanDocuments()).toBe(true);
    core.getPlatform.mockReturnValueOnce("ios");
    expect(canScanDocuments()).toBe(false);
    core.isNativePlatform.mockReturnValueOnce(false);
    expect(canScanDocuments()).toBe(false);
  });
});

describe("scanDocument", () => {
  test("asks for one cleaned-up JPEG page and reads it from the app's files", async () => {
    scanner.scanDocument.mockResolvedValue({ scannedImages: ["file:///data/cache/page1.jpg"] });
    fetchMock.mockResolvedValue({ blob: async () => new Blob(["jpg"], { type: "image/jpeg" }) });
    const outcome = await scanDocument();
    expect(scanner.scanDocument).toHaveBeenCalledWith({ pageLimit: 1, resultFormats: "JPEG", scannerMode: "FULL", galleryImportAllowed: true });
    expect(fetchMock).toHaveBeenCalledWith("https://localhost/_capacitor_file_/data/cache/page1.jpg");
    expect(outcome.kind).toBe("scanned");
    if (outcome.kind === "scanned") {
      expect(outcome.file.name).toBe("scan.jpg");
      expect(outcome.file.type).toBe("image/jpeg");
    }
  });

  test("a type-less scan is treated as JPEG", async () => {
    scanner.scanDocument.mockResolvedValue({ scannedImages: ["file:///p.jpg"] });
    fetchMock.mockResolvedValue({ blob: async () => new Blob(["jpg"]) });
    const outcome = await scanDocument();
    expect(outcome.kind === "scanned" && outcome.file.type).toBe("image/jpeg");
  });

  test("backing out is 'cancelled'; no page back is 'cancelled' too", async () => {
    scanner.scanDocument.mockRejectedValueOnce(new Error("Scan cancelled or failed. Result code: 0"));
    expect(await scanDocument()).toEqual({ kind: "cancelled" });
    scanner.scanDocument.mockResolvedValueOnce({ scannedImages: [] });
    expect(await scanDocument()).toEqual({ kind: "cancelled" });
    scanner.scanDocument.mockResolvedValueOnce({});
    expect(await scanDocument()).toEqual({ kind: "cancelled" });
  });

  test("a scanner that can't start, a failed scan, or an unreadable file is 'unavailable'", async () => {
    scanner.scanDocument.mockRejectedValueOnce(new Error("Failed to start scan intent: UNSUPPORTED"));
    expect(await scanDocument()).toEqual({ kind: "unavailable" });
    scanner.scanDocument.mockRejectedValueOnce(new Error("Scan cancelled or failed. Result code: 1"));
    expect(await scanDocument()).toEqual({ kind: "unavailable" });
    scanner.scanDocument.mockRejectedValueOnce("not an Error");
    expect(await scanDocument()).toEqual({ kind: "unavailable" });
    scanner.scanDocument.mockResolvedValueOnce({ scannedImages: ["file:///p.jpg"] });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await scanDocument()).toEqual({ kind: "unavailable" });
  });
});
