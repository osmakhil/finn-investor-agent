// Precompute research for demo names (the API computes any other ticker live).
// Run: npx tsx --env-file=.env.local scripts/build-research.mts ASIANPAINT BAJFINANCE ...
import { writeFileSync, mkdirSync } from "node:fs";
import { research } from "../lib/research.ts";
import { RESEARCH_SUGGESTIONS } from "../lib/portfolio.ts";
mkdirSync("data/research", { recursive: true });
const syms = process.argv.slice(2).length ? process.argv.slice(2) : RESEARCH_SUGGESTIONS;
for (const s of syms) {
  const r = await research(s);
  writeFileSync(`data/research/${r.symbol}.json`, JSON.stringify(r));
  console.log(r.symbol, r.ledger.length, "promises", r.error ?? "", r.cost);
}
