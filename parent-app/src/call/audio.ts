// Audio for "Call Pravnya". The voice model takes 16 kHz 16-bit PCM from the microphone and sends
// back 16-bit PCM (24 kHz unless the message says otherwise). Nothing is recorded or stored: the
// audio is streamed in small chunks and dropped.

export const MIC_RATE = 16_000;
export const DEFAULT_OUT_RATE = 24_000;

/** Float samples (-1..1) -> little-endian 16-bit PCM, base64. */
export function floatToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Base64 little-endian 16-bit PCM -> float samples. */
export function pcm16Base64ToFloat(b64: string): Float32Array<ArrayBuffer> {
  const binary = atob(b64);
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
  const out = new Float32Array(new ArrayBuffer(Math.floor(binary.length / 2) * 4));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

/** "audio/pcm;rate=24000" -> 24000. */
export function rateFromMime(mime: string | undefined, fallback = DEFAULT_OUT_RATE) {
  const m = /rate=(\d+)/.exec(mime ?? "");
  return m ? Number(m[1]) : fallback;
}

// Collects ~100 ms of microphone audio at a time and hands it to the page.
const CAPTURE_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${MIC_RATE / 10}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

export type Mic = { setMuted(muted: boolean): void; stop(): void };

/**
 * Streams the microphone as base64 PCM chunks. Create the AudioContext in the tap that starts the
 * call (phones only allow audio to start from a user gesture), then pass it in.
 */
export async function startMic(ctx: AudioContext, onChunk: (base64: string) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-capture");
  let muted = false;
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (!muted) onChunk(floatToPcm16Base64(e.data));
  };
  // A silent path to the speakers keeps the worklet running on every browser.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(node);
  node.connect(sink);
  sink.connect(ctx.destination);
  return {
    setMuted(m) {
      muted = m;
      stream.getAudioTracks().forEach((t) => (t.enabled = !m));
    },
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
    }
  };
}

/** Plays Pravnya's voice chunks back to back, and says how loud it is right now (for the face). */
export class VoicePlayer {
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private analyser: AnalyserNode;
  private data: Uint8Array<ArrayBuffer>;

  private ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.analyser.connect(ctx.destination);
  }

  play(base64: string, mime?: string) {
    const samples = pcm16Base64ToFloat(base64);
    if (!samples.length) return;
    const buffer = this.ctx.createBuffer(1, samples.length, rateFromMime(mime));
    buffer.copyToChannel(samples, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser);
    const at = Math.max(this.next, this.ctx.currentTime + 0.03);
    src.start(at);
    this.next = at + buffer.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** The parent talked over Pravnya: stop at once. */
  interrupt() {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    });
    this.sources.clear();
    this.next = 0;
  }

  get speaking() {
    return this.sources.size > 0;
  }

  /** 0..1, roughly how loud the voice is now. */
  level() {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (const v of this.data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / this.data.length) * 4);
  }
}
