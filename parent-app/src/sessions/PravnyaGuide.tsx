import { useCallback, useEffect, useRef, useState } from "react";

// Pravnya as an on-screen guide: a friendly face that blinks while idle and "talks" while it reads
// a step aloud, with the line being spoken shown as a caption -- like a short video call. Speech
// is the phone's own voice (speechSynthesis); nothing is recorded.

export type Mood = "idle" | "talking" | "listening" | "cheer";

/** mouthLevel (0..1), when given, opens the mouth with the actual voice instead of a loop (on a call). */
export function PravnyaFace({ mood, size = 112, mouthLevel }: { mood: Mood; size?: number; mouthLevel?: number }) {
  return (
    <div className={`pv-guide pv-guide--${mood}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="pv-guide__halo" />
      <svg viewBox="0 0 120 120" width={size} height={size}>
        <defs>
          <radialGradient id="pvFace" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#2acb87" />
            <stop offset="100%" stopColor="#136b4d" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="52" fill="url(#pvFace)" />
        {/* a leaf, from the Pravnya mark */}
        <path d="M60 10 C72 2 86 6 88 14 C78 18 68 18 60 10 Z" fill="#0d4834" />
        <g className="pv-guide__eyes">
          <ellipse cx="44" cy="54" rx="8" ry="10" fill="#fff" />
          <ellipse cx="76" cy="54" rx="8" ry="10" fill="#fff" />
          <circle cx="46" cy="56" r="4.5" fill="#1c2b22" />
          <circle cx="78" cy="56" r="4.5" fill="#1c2b22" />
        </g>
        <circle cx="34" cy="72" r="6" fill="#f39c4a" opacity="0.35" />
        <circle cx="86" cy="72" r="6" fill="#f39c4a" opacity="0.35" />
        {mood === "talking" && mouthLevel !== undefined ? (
          <ellipse cx="60" cy="82" rx="10" ry={1.5 + 8 * Math.min(1, mouthLevel)} fill="#0d4834" />
        ) : mood === "talking" ? (
          <ellipse className="pv-guide__mouth" cx="60" cy="82" rx="10" ry="7" fill="#0d4834" />
        ) : mood === "listening" ? (
          <circle cx="60" cy="82" r="5" fill="#0d4834" />
        ) : (
          <path d={mood === "cheer" ? "M44 76 Q60 96 76 76 Z" : "M46 78 Q60 90 74 78"} fill={mood === "cheer" ? "#0d4834" : "none"} stroke="#0d4834" strokeWidth="4" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

/** Reads lines aloud one at a time, reporting which line is being spoken. */
export function useSpeaker(enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);
  const [line, setLine] = useState(-1);
  const run = useRef(0);

  const stop = useCallback(() => {
    run.current++;
    setSpeaking(false);
    setLine(-1);
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
  }, []);

  const speak = useCallback(
    (lines: string[], lang: string) => {
      stop();
      if (!enabled || !lines.length) return;
      try {
        if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
      } catch {
        return;
      }
      const id = run.current;
      setSpeaking(true);
      lines.forEach((text, i) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 0.95;
        u.onstart = () => run.current === id && setLine(i);
        u.onend = () => {
          if (run.current === id && i === lines.length - 1) {
            setSpeaking(false);
            setLine(-1);
          }
        };
        u.onerror = u.onend;
        window.speechSynthesis.speak(u);
      });
    },
    [enabled, stop]
  );

  useEffect(() => stop, [stop]);
  return { speak, stop, speaking, line };
}

/** The face with a speech bubble under it: the caption while talking, otherwise the given text. */
export function GuideHeader({ mood, caption, onReplay, compact }: { mood: Mood; caption: string | null; onReplay?: () => void; compact?: boolean }) {
  return (
    <div className={`flex ${compact ? "items-center gap-3" : "flex-col items-center gap-3"} `}>
      <PravnyaFace mood={mood} size={compact ? 64 : 112} />
      {caption ? (
        <div className={`relative ${compact ? "flex-1" : "w-full"} rounded-2xl bg-[var(--pv-surface)] px-4 py-3 shadow-sm`} aria-live="polite">
          <p className="text-[1rem] leading-relaxed text-[var(--pv-ink)]">{caption}</p>
          {onReplay ? (
            <button type="button" onClick={onReplay} className="mt-1 text-sm font-semibold text-[var(--pv-green-700)]">
              ▶ Hear it again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
