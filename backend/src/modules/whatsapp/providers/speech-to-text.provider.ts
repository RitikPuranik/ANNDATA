/**
 * Speech-to-text extension point for farmer voice notes.
 *
 * `WHATSAPP_STT_PROVIDER=none` (default) reports "unavailable" and the
 * assistant answers voice notes with the standard "I can process text" hint.
 * `WHATSAPP_STT_PROVIDER=gemini` enables `GeminiSpeechToTextProvider` below,
 * reusing the same `GEMINI_API_KEY` already used for NLU. Either way the
 * transcript flows through the exact same pipeline as typed text (command
 * parser → optional AI → deterministic Anndata services) — see
 * whatsapp-webhook.service.ts's `run()`, which only ever swaps
 * `inbound.type` from "audio" to "text" once a non-empty transcript comes
 * back; it never changes any downstream authorization or business logic.
 */
export interface SpeechToTextResult {
  text: string;
  languageCode?: string;
  confidence?: number;
}

export interface SpeechToTextProvider {
  readonly available: boolean;
  transcribe(audio: Buffer, mimeType: string, languageHints: string[]): Promise<SpeechToTextResult>;
}

export class UnavailableSpeechToTextProvider implements SpeechToTextProvider {
  readonly available = false;
  async transcribe(): Promise<SpeechToTextResult> {
    throw new Error("Speech-to-text is not configured");
  }
}

/**
 * Transcribes a WhatsApp voice note using Gemini's multimodal
 * `generateContent` endpoint (audio input is sent as inline base64 data,
 * same as an image would be). No separate STT vendor/credential is needed —
 * this reuses `GEMINI_API_KEY`/`GEMINI_MODEL`/`GEMINI_API_BASE_URL`, the same
 * config already used by `GeminiNluProvider`.
 *
 * Output is a plain transcript string, not JSON — the prompt explicitly asks
 * for nothing else, and it is treated as UNTRUSTED user text afterwards
 * (fed straight back into the existing command parser / NLU / Zod
 * validation pipeline, exactly like typed text). This provider never
 * interprets the audio itself; it only turns sound into text.
 */
export class GeminiSpeechToTextProvider implements SpeechToTextProvider {
  readonly available = true;
  constructor(
    private readonly config: {
      geminiApiKey: string;
      geminiModel: string;
      geminiBaseUrl: string;
      aiTimeoutMs: number;
    },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async transcribe(audio: Buffer, mimeType: string, languageHints: string[]): Promise<SpeechToTextResult> {
    const url = `${this.config.geminiBaseUrl}/v1beta/models/${encodeURIComponent(this.config.geminiModel)}:generateContent`;
    const prompt =
      `Transcribe this voice note exactly as spoken. The speaker is an Indian farmer or buyer and may speak ` +
      `English, Hindi, or a mix (Hinglish). Likely languages: ${languageHints.join(", ") || "en, hi"}. ` +
      `Reply with ONLY the transcript text, in the original language/script the speaker used — no translation, ` +
      `no commentary, no quotation marks. If the audio has no clear speech, reply with an empty string.`;
    // WhatsApp sends e.g. "audio/ogg; codecs=opus" — Gemini's inlineData
    // wants a bare MIME type ("audio/ogg"), so the ";codecs=..." part is
    // stripped. Anything Gemini doesn't recognise falls back to audio/ogg
    // (what WhatsApp voice notes actually are) rather than sending garbage.
    const cleanMimeType = mimeType.split(";")[0].trim() || "audio/ogg";
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.config.geminiApiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, { inlineData: { mimeType: cleanMimeType, data: audio.toString("base64") } }],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 300 },
      }),
      signal: AbortSignal.timeout(this.config.aiTimeoutMs),
    });
    if (!res.ok) {
      // Truncated response body surfaces in the "[WhatsApp] voice
      // transcription failed" log line so a bad API key / unsupported
      // model / quota error is diagnosable without guesswork.
      const detail = await res.text().catch(() => "");
      throw new Error(`STT provider HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    return { text };
  }
}
