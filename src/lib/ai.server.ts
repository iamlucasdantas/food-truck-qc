// Single place for the AI provider now that the app no longer runs on Lovable.
// Google Gemini is the only provider: native calls live in ./gemini.server, and the
// OpenAI-compatible endpoint below serves code that still speaks chat/completions.
export const AI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
export const AI_CHAT_COMPLETIONS_URL = `${AI_BASE_URL}/chat/completions`;
export const AI_DEFAULT_MODEL = "gemini-3.8-flash";

/** The Gemini key; throws a clear error when the app is not configured. */
export function aiKey(): string {
  const key = process.env["GOOGLE_API_KEY"]?.trim();
  if (!key) throw new Error("GOOGLE_API_KEY is not set: the AI features are not configured.");
  return key;
}
export const hasAiKey = () => !!process.env["GOOGLE_API_KEY"]?.trim();

/** Maps the model ids used while the app ran on the Lovable gateway to Gemini. */
export function aiModel(requested?: string): string {
  if (!requested) return AI_DEFAULT_MODEL;
  if (requested === "openai/gpt-6-astra") return AI_DEFAULT_MODEL;
  if (requested.startsWith("google/")) return requested.slice("google/".length);
  return requested;
}
