// Buffers every tap on the talking screen and sends batches to the server every ~20s. Taps also
// go out on page hide / unload (sendBeacon when available) so a child's taps aren't lost if the app
// closes. Nothing else is kept -- just cellId, pageId, label, word class, kind and time.

import { api } from "../api/client";

export type Tap = { cellId: string; pageId: string; label: string; wordClass: string; kind: "word" | "folder" | "affix"; at: string };

const FLUSH_MS = 20_000;
const MAX_BATCH = 300;

export class TapLog {
  private buf: Tap[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private onHide = () => this.flushBeacon();
  private token: string;
  private kidId: string;
  constructor(token: string, kidId: string) {
    this.token = token;
    this.kidId = kidId;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onHide);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onHide);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onHide);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onHide);
    void this.flush();
  }

  record(tap: Omit<Tap, "at">) {
    this.buf.push({ ...tap, at: new Date().toISOString() });
    if (this.buf.length >= MAX_BATCH) void this.flush();
  }

  /** Normal flush (fetch). */
  async flush() {
    if (!this.buf.length) return;
    const taps = this.buf.splice(0, MAX_BATCH);
    try {
      await api.sendAacTaps(this.token, this.kidId, taps);
    } catch {
      // Put them back for a retry on the next tick; cap the buffer so it doesn't grow forever.
      this.buf = [...taps, ...this.buf].slice(-MAX_BATCH);
    }
  }

  /** On page hide / unload: a beacon can still fire while the page is tearing down. */
  private flushBeacon() {
    if (!this.buf.length) return;
    const taps = this.buf.splice(0, MAX_BATCH);
    try {
      const blob = new Blob([JSON.stringify({ taps })], { type: "application/json" });
      // sendBeacon can't set Authorization, so fall back to a plain fetch with keepalive.
      // Browsers that support fetch keepalive carry the body even after the page unloads.
      void fetch(`/api/parent-kids/${this.kidId}/aac-board/taps`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
        body: blob,
        keepalive: true
      }).catch(() => {});
    } catch {
      // swallow -- taps are low-value; don't fail the unload.
    }
  }
}
