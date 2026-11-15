import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { research } from "@/lib/research";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const TTL = 24 * 3600 * 1000;
const mem = new Map<string, { at: number; body: unknown }>();

async function readJSON(p: string) {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return null;
  }
}

// Cache layers: memory → /tmp (per warm instance) → precomputed snapshot in repo → compute live.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("symbol") || "";
  const symbol = raw.toUpperCase().replace(/[^A-Z0-9&-]/g, "").slice(0, 20);
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const hit = mem.get(symbol);
  if (!fresh && hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);

  if (!fresh) {
    const tmp = await readJSON(path.join("/tmp", `finn-${symbol}.json`));
    if (tmp && Date.now() - +new Date(tmp.generatedAt) < TTL) return NextResponse.json(tmp);
    const snap = await readJSON(path.join(process.cwd(), "data", "research", `${symbol}.json`));
    if (snap) return NextResponse.json({ ...snap, cached: true });
  }

  try {
    const r = await research(symbol);
    mem.set(symbol, { at: Date.now(), body: r });
    if (!r.error) {
      await mkdir("/tmp", { recursive: true }).catch(() => {});
      await writeFile(path.join("/tmp", `finn-${symbol}.json`), JSON.stringify(r)).catch(() => {});
    }
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: `Couldn't find ${symbol} on screener.in. Check the NSE symbol.`, detail: (e as Error).message }, { status: 404 });
  }
}
