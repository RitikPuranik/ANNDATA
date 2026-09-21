/**
 * Speech-to-text extension point for farmer voice notes.
 *
 * ANNDATA has no STT infrastructure today, so the default provider reports
 * "unavailable" and the assistant answers voice notes with the standard
 * "I can process text" hint. To enable voice later: implement this interface
 * (e.g. Google Cloud STT with hi-IN), and pass it to createWhatsAppModule().
 * The transcript then flows through the exact same pipeline as typed text
 * (command parser → optional AI → deterministic ANNDATA services).
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
