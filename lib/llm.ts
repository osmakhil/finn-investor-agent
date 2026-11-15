import Groq from "groq-sdk";

// Model routing: a small fast model (low reasoning effort) for bulk extraction/classification,
// the large model only for the promise-vs-delivery judgement, and the small model with Groq's
// built-in browser search for people bios.
export const MODELS = {
  fast: process.env.FINN_FAST_MODEL || "openai/gpt-oss-20b",
  reason: process.env.FINN_REASON_MODEL || "openai/gpt-oss-120b",
  search: process.env.FINN_SEARCH_MODEL || "openai/gpt-oss-20b",
};

let client: Groq | null = null;
const groq = () => (client ??= new Groq({ apiKey: process.env.GROQ_API_KEY }));
export const hasLLM = () => !!process.env.GROQ_API_KEY;

// Shared across module instances (scripts load lib both as ESM and CJS).
const g = globalThis as unknown as { __finnUsage?: { calls: number; inTokens: number; outTokens: number } };
export const usage = (g.__finnUsage ??= { calls: 0, inTokens: 0, outTokens: 0 });

type Opts = { json?: boolean; maxTokens?: number; effort?: "low" | "medium" | "high"; search?: boolean };

export async function chat(model: string, system: string, user: string, o: Opts = {}): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        model,
        temperature: 0.1,
        max_completion_tokens: o.maxTokens ?? 2000,
        reasoning_effort: o.effort ?? "low",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      };
      if (o.json) body.response_format = { type: "json_object" };
      if (o.search) body.tools = [{ type: "browser_search" }];
      const r = await groq().chat.completions.create(body);
      usage.calls++;
      usage.inTokens += r.usage?.prompt_tokens ?? 0;
      usage.outTokens += r.usage?.completion_tokens ?? 0;
      return r.choices[0]?.message?.content ?? "";
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if ((status === 429 || status === 503) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  return "";
}

export async function chatJSON<T>(model: string, system: string, user: string, maxTokens = 2000, effort: Opts["effort"] = "low"): Promise<T> {
  const out = await chat(model, `${system}\nRespond with a single JSON object.`, user, { json: true, maxTokens, effort });
  return JSON.parse(out) as T;
}
