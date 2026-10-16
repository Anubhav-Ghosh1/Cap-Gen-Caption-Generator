/** Whisper sizes the user can download to their own device. Client-safe. */
export const MODELS = [
  { id: "Xenova/whisper-tiny", label: "Tiny", approxMb: 40, note: "Fastest, lowest accuracy" },
  { id: "Xenova/whisper-base", label: "Base", approxMb: 80, note: "Good balance (default)" },
  { id: "Xenova/whisper-small", label: "Small", approxMb: 250, note: "Best accuracy, slower" },
] as const;

export const DEFAULT_MODEL = "Xenova/whisper-base";
export const MODEL_STORAGE_KEY = "captionai.model";

export function parseModel(v: unknown): string {
  return MODELS.find((m) => m.id === v)?.id ?? DEFAULT_MODEL;
}
