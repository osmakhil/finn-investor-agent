import Groq from "groq-sdk";

// Model routing: a tiny fast model for bulk extraction/classification, a stronger reasoning model
// only for the promise-vs-delivery judgement, and Groq's search-enabled model for people bios.
export const MODELS = {
  fast: process.env.FINN_FAST_MODEL || "llama-3.1-8b-instant",
  reason: process.env.FINN_REASON_MODEL || "openai/gpt-oss-120b",
  search: process.env.FINN_SEARCH_MODEL || "groq/compound-mini",
};

let client: Groq | null = null;
const groq = () => (client ??= new Groq({ apiKey: process.env.GROQ_API_KEY }));
export const hasLLM = () => !!process.env.GROQ_API_KEY;

export const usage = { calls: 0, inTokens: 0, outTokens: 0 };

export async function chat(model: string, system: string, user: string, json = false, maxTokens = 1500): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await groq().chat.completions.create({
        model,
        temperature: 0.1,
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" as const } } : {}),
      });
      usage.calls++;
      usage.inTokens += r.usage?.prompt_tokens ?? 0;
      usage.outTokens += r.usage?.completion_tokens ?? 0;
      return r.choices[0]?.message?.content ?? "";
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  return "";
}

export async function chatJSON<T>(model: string, system: string, user: string, maxTokens = 1500): Promise<T> {
  const out = await chat(model, system, user, true, maxTokens);
  return JSON.parse(out) as T;
}
