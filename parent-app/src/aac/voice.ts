import { useEffect, useRef, useState } from "react";
import { assetUrl, type AacCell } from "../api/client";

// What a button sounds like: the recording someone made of it, or else the phone's voice.

function speak(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.95;
      // Some browsers never report the end: don't wait forever.
      const fallback = setTimeout(resolve, 1500 + text.length * 120);
      u.onend = u.onerror = () => {
        clearTimeout(fallback);
        resolve();
      };
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

function playClip(url: string, current: { audio: HTMLAudioElement | null }): Promise<void> {
  return new Promise((resolve) => {
    try {
      const a = new Audio(assetUrl(url));
      current.audio = a;
      a.onended = a.onerror = () => resolve();
      void a.play().catch(() => resolve());
    } catch {
      resolve();
    }
  });
}

/** Says one button or a whole sentence; a new call stops what's playing. */
export function useBoardVoice(lang: string) {
  const run = useRef(0);
  const current = useRef<{ audio: HTMLAudioElement | null }>({ audio: null });

  function stop() {
    run.current++;
    current.current.audio?.pause();
    current.current.audio = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
  }

  async function say(cells: AacCell[]) {
    stop();
    const id = run.current;
    // No recordings: one sentence in the phone's voice sounds most natural.
    if (cells.every((c) => !c.audio)) return speak(cells.map((c) => c.say ?? c.label).join(" "), lang);
    for (const c of cells) {
      if (run.current !== id) return;
      if (c.audio) await playClip(c.audio.url, current.current);
      else await speak(c.say ?? c.label, lang);
    }
  }

  useEffect(() => stop, []);
  return { say, stop };
}

const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
export const MAX_RECORDING_MS = 10_000;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).slice((r.result as string).indexOf(",") + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Records up to 10 seconds from the microphone; hands back the recording, base64-encoded. */
export function useRecorder(onRecorded: (base64: string) => void) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        setRecording(false);
        const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        if (blob.size) onRecorded(await toBase64(blob));
      };
      rec.current = r;
      r.start();
      setRecording(true);
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), MAX_RECORDING_MS);
    } catch {
      setError("Couldn't use the microphone. Allow it for Pravnya in your phone's settings, then try again.");
    }
  }

  function stop() {
    if (rec.current?.state === "recording") rec.current.stop();
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (rec.current?.state === "recording") rec.current.stop();
    },
    []
  );
  return { recording, error, start, stop };
}
