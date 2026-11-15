// Builds data/brief.json — the push-side snapshot (prices + classified filings + enrichment).
// Run: npx tsx --env-file=.env.local scripts/build-brief.mts
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import YahooFinance from "yahoo-finance2";
import { getCompany } from "../lib/screener.ts";
import { PORTFOLIO } from "../lib/portfolio.ts";
import { ruleClassify, score, BASE_SCORE, type Category } from "../lib/classify.ts";
import { headline } from "../lib/metrics.ts";
import { expectedQuarter, headlineFromFiling } from "../lib/resultsPdf.ts";
import { chatJSON, chat, MODELS, hasLLM, usage } from "../lib/llm.ts";
import type { BriefFiling, BriefCompany, Brief } from "../lib/types.ts";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cache enrichment across runs so nothing is ever sent to a model twice.
const CACHE = "data/llm-cache.json";
const cache: Record<string, unknown> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

const companies: BriefCompany[] = [];
const ambiguous: { c: number; f: number }[] = [];

for (const { symbol, sector } of PORTFOLIO) {
  try {
    const co = await getCompany(symbol);
    const chart = await yf.chart(`${symbol}.NS`, { period1: new Date(Date.now() - 100 * 864e5), interval: "1d" });
    const prices = chart.quotes
      .filter((q) => q.close != null)
      .map((q) => ({ d: q.date.toISOString().slice(0, 10), c: +q.close!.toFixed(2), v: q.volume ?? 0 }));
    const hl = headline(co.quarters);
    const filings: BriefFiling[] = co.filings.map((f) => {
      const cat = ruleClassify(f.category, f.title, f.summary);
      const bf: BriefFiling = { ...f, cat: cat ?? "unclassified", score: cat ? score(cat, `${f.category} ${f.summary}`) : 30, ruled: !!cat };
      if (cat === "results" && bf.score >= 70 && hl) {
        const want = expectedQuarter(f.date);
        bf.results = hl.quarter === want ? hl : { ...hl, pendingQuarter: want };
      }
      return bf;
    });
    companies.push({ symbol, name: co.name, sector, prices, filings, marketCap: co.ratios["Market Cap"] ?? "" });
    filings.forEach((f, i) => !f.ruled && ambiguous.push({ c: companies.length - 1, f: i }));
    console.log(`✓ ${symbol.padEnd(11)} ${prices.length}d prices, ${filings.length} filings`);
  } catch (e) {
    console.warn(`✗ ${symbol}: ${(e as Error).message}`);
  }
  await sleep(700); // be polite to screener
}

if (hasLLM()) {
  // 0) Results whose quarter isn't in standardised data yet: read the filing PDF itself.
  for (const co of companies) {
    for (const f of co.filings) {
      if (!f.results?.pendingQuarter) continue;
      const key = `res:${f.url}`;
      if (!cache[key]) cache[key] = await headlineFromFiling(f.url, f.results.pendingQuarter).catch((e) => (console.warn("results pdf", co.symbol, e.message), null));
      console.log(`results from filing ${co.symbol}: ${cache[key] ? "ok" : "failed"}`);
      if (cache[key]) f.results = cache[key] as BriefFiling["results"];
    }
  }
  // 1) One batched call for every filing the rules couldn't place.
  const todo = ambiguous.filter(({ c, f }) => !cache[companies[c].filings[f].url]);
  if (todo.length) {
    const list = todo.map(({ c, f }, i) => `${i}. [${companies[c].symbol}] ${companies[c].filings[f].category} — ${companies[c].filings[f].summary}`).join("\n");
    const out = await chatJSON<{ items: { i: number; cat: Category; score: number; why: string }[] }>(
      MODELS.fast,
      `Classify Indian stock-exchange filings for a portfolio investor. Categories: results, M&A, fund_raise, management_change, litigation, insider_trading, earnings_call, investor_meetings, credit_rating, dividend, bonus_split, capex, press_release, postal_ballot, agm_egm, pledging, unclassified (routine paperwork). score = 0-100 materiality to the share price. why = max 14 words on why an investor should care, or "" if routine. Return {"items":[{"i":0,"cat":"...","score":0,"why":"..."}]}.`,
      list,
      4000,
    ).catch((e) => (console.warn("classify failed", e.message), { items: [] }));
    for (const it of out.items ?? []) {
      const t = todo[it.i];
      if (t) cache[companies[t.c].filings[t.f].url] = it;
    }
  }
  for (const { c, f } of ambiguous) {
    const hit = cache[companies[c].filings[f].url] as { cat: Category; score: number; why: string } | undefined;
    // Blend the model's materiality with our category prior so one noisy guess can't top the feed.
    if (hit && BASE_SCORE[hit.cat] != null) {
      const fl = companies[c].filings[f];
      Object.assign(fl, { cat: hit.cat, score: Math.round((hit.score + score(hit.cat, `${fl.category} ${fl.summary}`)) / 2), why: hit.why });
    }
  }

  // 2) Management changes at the top: who is the incoming person? (web-search model)
  for (const co of companies) {
    for (const f of co.filings) {
      if (f.cat !== "management_change" || f.score < 70) continue;
      const key = `bio:${f.url}`;
      if (!cache[key]) {
        const who = await chatJSON<{ name: string; role: string; incoming: boolean }>(
          MODELS.fast,
          `From an Indian company filing summary, extract the person whose change is announced. Return {"name":"","role":"","incoming":true|false}. incoming=false for resignations/retirements.`,
          `${co.name}: ${f.summary}`,
          600,
        ).catch(() => ({ name: "", role: "", incoming: false }));
        let bio = "";
        if (who.name) {
          bio = await chat(
            MODELS.search,
            "You write 2-sentence professional bios for investors. Facts only: current/previous roles, employers, years, education if notable. No fluff. If unsure who this is, say so.",
            `Professional background of ${who.name}, ${who.role} at ${co.name} (India).`,
            { search: true, maxTokens: 1500 },
          ).catch(() => "");
        }
        cache[key] = { ...who, bio };
      }
      f.person = cache[key] as BriefFiling["person"];
    }
  }
  mkdirSync("data", { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache, null, 1));
} else {
  console.log("No GROQ_API_KEY — skipping LLM enrichment (rules-only).");
}

const brief: Brief = { generatedAt: new Date().toISOString(), companies, usage };
mkdirSync("data", { recursive: true });
writeFileSync("data/brief.json", JSON.stringify(brief));
console.log(`Done. ${companies.length} companies. LLM usage:`, usage, `ambiguous=${ambiguous.length}`);
