/**
 * Languages offered for transcription. `id` is the Whisper language name that
 * Transformers.js accepts. Whisper (Transformers.js) has no auto-detect, so
 * the user picks the spoken language; English is the default.
 */
export const LANGUAGES = [
  { id: "english", label: "English" },
  { id: "hindi", label: "Hindi (हिन्दी)" },
  { id: "bengali", label: "Bengali (বাংলা)" },
  { id: "tamil", label: "Tamil (தமிழ்)" },
  { id: "telugu", label: "Telugu (తెలుగు)" },
  { id: "marathi", label: "Marathi (मराठी)" },
  { id: "gujarati", label: "Gujarati (ગુજરાતી)" },
  { id: "kannada", label: "Kannada (ಕನ್ನಡ)" },
  { id: "urdu", label: "Urdu (اردو)" },
  { id: "spanish", label: "Spanish" },
  { id: "french", label: "French" },
  { id: "german", label: "German" },
  { id: "italian", label: "Italian" },
  { id: "portuguese", label: "Portuguese" },
  { id: "dutch", label: "Dutch" },
  { id: "russian", label: "Russian" },
  { id: "turkish", label: "Turkish" },
  { id: "arabic", label: "Arabic" },
  { id: "indonesian", label: "Indonesian" },
  { id: "japanese", label: "Japanese" },
  { id: "korean", label: "Korean" },
  { id: "chinese", label: "Chinese" },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]["id"];

export function parseLanguage(v: unknown): LanguageId {
  return LANGUAGES.find((l) => l.id === v)?.id ?? "english";
}
