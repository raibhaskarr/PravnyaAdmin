// In the Android app, "Scan" opens Google's document scanner (ML Kit, part of Play services):
// it finds the page edges, crops and flattens the note, and cleans it up -- much easier for the
// AI to read than a tilted photo on a table, and a fraction of the size. In a browser (or if the
// scanner can't start, e.g. a phone with too little memory) we fall back to the ordinary camera.

import { Capacitor } from "@capacitor/core";
import { DocumentScanner } from "@capacitor-mlkit/document-scanner";

export function canScanDocuments(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export type ScanOutcome = { kind: "scanned"; file: File } | { kind: "cancelled" } | { kind: "unavailable" };

export async function scanDocument(): Promise<ScanOutcome> {
  let uri: string | undefined;
  try {
    const result = await DocumentScanner.scanDocument({
      pageLimit: 1,
      resultFormats: "JPEG",
      scannerMode: "FULL",
      galleryImportAllowed: true
    });
    uri = result.scannedImages?.[0];
  } catch (err) {
    // The plugin rejects with "Scan cancelled or failed. Result code: 0" when the parent backs out.
    const message = err instanceof Error ? err.message : String(err);
    return /cancel/i.test(message) && /code: 0\b/.test(message) ? { kind: "cancelled" } : { kind: "unavailable" };
  }
  if (!uri) return { kind: "cancelled" };
  try {
    const response = await fetch(Capacitor.convertFileSrc(uri));
    const blob = await response.blob();
    return { kind: "scanned", file: new File([blob], "scan.jpg", { type: blob.type || "image/jpeg" }) };
  } catch {
    return { kind: "unavailable" };
  }
}
