import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";

// A thin wrapper round Gemini's Live API, so the call screen (and its tests) deal in plain events.
// The token comes from our server and is locked to Pravnya's instructions and tools; the config
// sent here is ignored by the API in favour of the locked one.

export type LiveEvents = {
  onOpen(): void;
  onAudio(base64: string, mimeType: string | undefined): void;
  /** Pravnya's words as she speaks (pieces to append), and the parent's words as heard. */
  onPravnyaText(piece: string): void;
  onParentText(piece: string): void;
  /** The parent talked over Pravnya: stop playing what's queued. */
  onInterrupted(): void;
  onTurnComplete(): void;
  onToolCall(calls: { id: string; name: string; args: Record<string, unknown> }[]): void;
  onClose(reason: string): void;
};

export type LiveCall = {
  sendAudio(base64: string): void;
  /** A note to Pravnya from the app (e.g. "the parent joined"). */
  sendText(text: string): void;
  sendToolResponses(responses: { id: string; name: string; response: Record<string, unknown> }[]): void;
  close(): void;
};

export async function connectLive(opts: { token: string; model: string; apiVersion: string }, events: LiveEvents): Promise<LiveCall> {
  const ai = new GoogleGenAI({ apiKey: opts.token, httpOptions: { apiVersion: opts.apiVersion } });
  let closed = false;
  const session: Session = await ai.live.connect({
    model: opts.model,
    config: { responseModalities: [Modality.AUDIO] },
    callbacks: {
      onopen: () => events.onOpen(),
      onmessage: (m: LiveServerMessage) => {
        const c = m.serverContent;
        if (c?.interrupted) events.onInterrupted();
        for (const part of c?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) events.onAudio(part.inlineData.data, part.inlineData.mimeType);
        }
        if (c?.outputTranscription?.text) events.onPravnyaText(c.outputTranscription.text);
        if (c?.inputTranscription?.text) events.onParentText(c.inputTranscription.text);
        if (c?.turnComplete) events.onTurnComplete();
        if (m.toolCall?.functionCalls?.length)
          events.onToolCall(m.toolCall.functionCalls.map((f) => ({ id: f.id ?? "", name: f.name ?? "", args: (f.args as Record<string, unknown>) ?? {} })));
        if (m.goAway) events.onClose("goaway");
      },
      onerror: () => {
        // onclose follows with the reason.
      },
      onclose: (e: CloseEvent) => {
        if (closed) return;
        closed = true;
        events.onClose(e.reason || `closed (${e.code})`);
      }
    }
  });
  return {
    sendAudio: (data) => !closed && session.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } }),
    sendText: (text) => !closed && session.sendRealtimeInput({ text }),
    sendToolResponses: (functionResponses) => !closed && session.sendToolResponse({ functionResponses }),
    close: () => {
      closed = true;
      session.close();
    }
  };
}
