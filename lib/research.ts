import { extractText } from "unpdf";
import { getCompany, row, type Company, type Table } from "./screener";
import { headline, type Headline } from "./metrics";
import { chatJSON, MODELS, hasLLM, usage } from "./llm";

export type Claim = { metric: string; promise: string; target: string; period: string; quote: string };
export type LedgerItem = {
  call: string;
  metric: string;
  promise: string;
  target: string;
  actual: string;
  verdict: "delivered" | "partly" | "missed" | "pending" | "unverifiable";
  evidence: string;
  quote: string;
};
export type Research = {
  symbol: string;
  name: string;
  basis: string;
  generatedAt: string;
  ratios: Record<string, string>;
  headline: Headline | null;
  trend: { periods: string[]; revenue: (number | null)[]; pat: (number | null)[]; opm: (number | null)[] };
  quarterly: { periods: string[]; revenue: (number | null)[]; ebitda: (number | null)[]; opm: (number | null)[]; pat: (number | null)[] };
  health: { label: string; value: string; tone: "good" | "bad" | "neutral"; note: string }[];
  sources: { label: string; url: string }[];
  ledger: LedgerItem[];
  scorecard: string;
  business: string;
  bull: string[];
  bear: string[];
  cost: { calls: number; inTokens: number; outTokens: number; ms: number };
  error?: string;
};

const last = <T,>(a: T[], n: number) => a.slice(Math.max(0, a.length - n));
const fmtPct = (x: number | null) => (x == null ? "—" : `${x.toFixed(0)}%`);

/** Deterministic health checks straight from the reported statements — no LLM needed. */
function health(c: Company): Research["health"] {
  const out: Research["health"] = [];
  const a = c.annual;
  const yrs = a.headers.filter((h) => h !== "TTM");
  const sales = row(a, "Sales", "Revenue");
  const pat = row(a, "Net Profit");
  const iL = yrs.length - 1;
  if (iL >= 3 && sales[iL] && sales[iL - 3]) {
    const cagr = (Math.pow(sales[iL]! / sales[iL - 3]!, 1 / 3) - 1) * 100;
    out.push({ label: "3y revenue CAGR", value: fmtPct(cagr), tone: cagr > 12 ? "good" : cagr < 5 ? "bad" : "neutral", note: `${yrs[iL - 3]} → ${yrs[iL]}` });
  }
  if (iL >= 3 && pat[iL] && pat[iL - 3] && pat[iL - 3]! > 0 && pat[iL]! > 0) {
    const cagr = (Math.pow(pat[iL]! / pat[iL - 3]!, 1 / 3) - 1) * 100;
    out.push({ label: "3y profit CAGR", value: fmtPct(cagr), tone: cagr > 12 ? "good" : cagr < 5 ? "bad" : "neutral", note: "PAT" });
  }
  // Cash conversion: 3-year operating cash flow vs 3-year PAT.
  const cf = c.cashflow;
  const cfo = row(cf, "Cash from Operating Activity");
  const cfYears = cf.headers;
  if (cfo.length >= 3 && pat.length) {
    const patByYear = Object.fromEntries(a.headers.map((h, i) => [h, pat[i]]));
    let sC = 0, sP = 0;
    for (const i of [cfo.length - 1, cfo.length - 2, cfo.length - 3]) {
      const p = patByYear[cfYears[i]];
      if (cfo[i] != null && p != null) { sC += cfo[i]!; sP += p; }
    }
    if (sP > 0) {
      const conv = (sC / sP) * 100;
      const isBank = !!row(c.quarters, "Financing Profit").length;
      out.push({
        label: "Cash conversion (3y)",
        value: fmtPct(conv),
        tone: isBank ? "neutral" : conv >= 80 ? "good" : conv < 60 ? "bad" : "neutral",
        note: isBank ? "CFO/PAT — not meaningful for lenders" : "operating cash ÷ profit",
      });
    }
  }
  const fcf = row(cf, "Free Cash Flow");
  if (fcf.length >= 3) {
    const s = last(fcf, 3).reduce<number>((x, y) => x + (y ?? 0), 0);
    out.push({ label: "Free cash flow (3y)", value: `₹${Math.round(s).toLocaleString("en-IN")} Cr`, tone: s > 0 ? "good" : "bad", note: "CFO − capex" });
  }
  const b = c.balance;
  const eq = (row(b, "Equity Capital").at(-1) ?? 0) + (row(b, "Reserves").at(-1) ?? 0);
  const debt = row(b, "Borrowings", "Borrowing").at(-1);
  if (eq > 0 && debt != null && !row(b, "Deposits").length) {
    const de = debt / eq;
    out.push({ label: "Debt / equity", value: de.toFixed(2), tone: de < 0.5 ? "good" : de > 1.5 ? "bad" : "neutral", note: `${b.headers.at(-1)}` });
  }
  return out;
}

/** Keep only sentences that look like forward-looking, quantified statements. Cuts tokens ~10x. */
export function guidanceSnippets(text: string, maxChars = 4500): string {
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.?!])\s+(?=[A-Z])/);
  const cue = /\b(guid|expect|target|aim|outlook|going forward|next (year|quarter|few)|FY\s?'?\d{2}|we will|we should|anticipat|confident|plan(ning)? to|capex|double[- ]digit|high[- ]single|low[- ]teen|mid[- ]teen|margin band|by (the )?end of)/i;
  const numeric = /\d|double|single|teen/i;
  const scored = sentences
    .map((s, i) => ({ s: s.trim(), i, k: (s.match(new RegExp(cue, "gi")) || []).length }))
    .filter((x) => x.k > 0 && numeric.test(x.s) && x.s.length > 40 && x.s.length < 600);
  scored.sort((a, b) => b.k - a.k || a.i - b.i);
  const picked: typeof scored = [];
  let n = 0;
  for (const x of scored) {
    if (n + x.s.length > maxChars) continue;
    picked.push(x);
    n += x.s.length;
  }
  return picked.sort((a, b) => a.i - b.i).map((x) => x.s).join("\n");
}

async function pdfText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; FINN-prototype/0.1)" } });
  if (!res.ok) throw new Error(`pdf ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const { text } = await extractText(buf, { mergePages: true });
  return text as string;
}

function tableSlice(t: Table, n: number, labels: [string, string[]][]) {
  const periods = last(t.headers.filter((h) => h !== "TTM"), n);
  const off = t.headers.indexOf(periods[0]);
  const lines = labels.map(([name, ls]) => {
    const r = row(t, ...ls).slice(off, off + periods.length);
    return `${name}: ${r.map((v) => (v == null ? "na" : v)).join(" | ")}`;
  });
  return `Periods: ${periods.join(" | ")}\n${lines.join("\n")}`;
}

export async function research(symbol: string): Promise<Research> {
  const t0 = Date.now();
  const u0 = { ...usage };
  const c = await getCompany(symbol);
  const q = c.quarters;
  const qp = last(q.headers, 8);
  const qo = q.headers.length - qp.length;
  const pick = (t: Table, off: number, n: number, ...l: string[]) => row(t, ...l).slice(off, off + n);
  const ap = last(c.annual.headers.filter((h) => h !== "TTM"), 6);
  const ao = c.annual.headers.indexOf(ap[0]);

  const r: Research = {
    symbol: c.symbol,
    name: c.name,
    basis: c.basis,
    generatedAt: new Date().toISOString(),
    ratios: c.ratios,
    headline: headline(q),
    trend: {
      periods: ap,
      revenue: pick(c.annual, ao, ap.length, "Sales", "Revenue"),
      pat: pick(c.annual, ao, ap.length, "Net Profit"),
      opm: pick(c.annual, ao, ap.length, "OPM %", "Financing Margin %"),
    },
    quarterly: {
      periods: qp,
      revenue: pick(q, qo, qp.length, "Sales", "Revenue"),
      ebitda: pick(q, qo, qp.length, "Operating Profit", "Financing Profit"),
      opm: pick(q, qo, qp.length, "OPM %", "Financing Margin %"),
      pat: pick(q, qo, qp.length, "Net Profit"),
    },
    health: health(c),
    sources: [],
    ledger: [],
    scorecard: "",
    business: "",
    bull: [],
    bear: [],
    cost: { calls: 0, inTokens: 0, outTokens: 0, ms: 0 },
  };

  const calls = c.concalls.filter((x) => x.transcript).slice(0, 4);
  r.sources = [
    ...calls.map((x) => ({ label: `Concall ${x.month}`, url: x.transcript! })),
    ...c.annualReports.slice(0, 1).map((a) => ({ label: `Annual report ${a.year}`, url: a.url })),
  ];

  if (!hasLLM()) {
    r.error = "LLM key not configured — showing reported numbers only.";
  } else if (!calls.length) {
    r.error = "No concall transcripts found for this company on screener.in.";
  } else {
    // 1) Cheap model: pull explicit, quantified promises out of each transcript (pre-filtered locally).
    const texts = await Promise.all(calls.map((x) => pdfText(x.transcript!).catch(() => "")));
    const claimsByCall: { call: string; claims: Claim[] }[] = [];
    let opening = "";
    for (let i = 0; i < calls.length; i++) {
      if (!texts[i]) continue;
      if (!opening) opening = texts[i].replace(/\s+/g, " ").slice(1500, 5500);
      const snippets = guidanceSnippets(texts[i]);
      if (!snippets) continue;
      const out = await chatJSON<{ claims: Claim[] }>(
        MODELS.fast,
        `You extract MANAGEMENT GUIDANCE from an Indian company's earnings-call transcript excerpts. Only include explicit, forward-looking statements by management with a number or clear direction (growth %, margin band, capex amount, volume, timeline). Ignore analyst questions and past results. Max 6, most material first. metric is one of: revenue_growth, margin, profit, capex, volume, debt, other. Return {"claims":[{"metric":"","promise":"<=15 words, plain English","target":"e.g. 15-18% or ₹2,000 Cr","period":"e.g. FY27 or next 2 quarters","quote":"verbatim <=25 words"}]}`,
        `Call: ${calls[i].month}\n${snippets}`,
        900,
      ).catch(() => ({ claims: [] as Claim[] }));
      claimsByCall.push({ call: calls[i].month, claims: (out.claims || []).slice(0, 6) });
    }

    // 2) Strong model, once: judge promises against reported numbers + write the bull/bear.
    const numbers = [
      "QUARTERLY (₹ Cr)",
      tableSlice(q, 8, [["Revenue", ["Sales", "Revenue"]], ["YoY revenue growth %", ["YoY Sales growth", "YoY Revenue growth"]], ["EBITDA", ["Operating Profit", "Financing Profit"]], ["EBITDA margin %", ["OPM %", "Financing Margin %"]], ["PAT", ["Net Profit"]]]),
      "ANNUAL (₹ Cr)",
      tableSlice(c.annual, 4, [["Revenue", ["Sales", "Revenue"]], ["EBITDA margin %", ["OPM %", "Financing Margin %"]], ["PAT", ["Net Profit"]]]),
      "CASH FLOW (₹ Cr)",
      tableSlice(c.cashflow, 4, [["CFO", ["Cash from Operating Activity"]], ["Investing (≈capex)", ["Cash from Investing Activity"]], ["FCF", ["Free Cash Flow"]]]),
    ].join("\n");
    const claims = claimsByCall.map((x) => `## Call ${x.call}\n${x.claims.map((k, j) => `${j + 1}. [${k.metric}] ${k.promise} | target: ${k.target} | period: ${k.period} | quote: "${k.quote}"`).join("\n")}`).join("\n");
    type Out = { ledger: LedgerItem[]; scorecard: string; business: string; bull: string[]; bear: string[] };
    const out = await chatJSON<Out>(
      MODELS.reason,
      `You are a sceptical buy-side analyst. Use ONLY the data given (management's own statements from earnings calls + reported financials). Never use outside knowledge of the company.
Task: for each promise, compare with what the reported numbers show and give a verdict:
- delivered: numbers meet/beat it; partly: direction right, magnitude short; missed: clearly not met; pending: target period not yet reported; unverifiable: the financials given can't test it (e.g. segment KPI).
Dedupe repeated promises across calls (keep earliest call, note if it was reiterated or quietly changed — "moved goalposts" is important). Max 8 items, most material first. actual and evidence must cite specific numbers from the data (quarter + value).
Also: scorecard = one blunt sentence on management's credibility; business = 2 sentences on what the company does, from the transcript opening; bull and bear = 3 bullets each, <=18 words, grounded in the data.
Return JSON {"ledger":[{"call":"","metric":"","promise":"","target":"","actual":"","verdict":"","evidence":"","quote":""}],"scorecard":"","business":"","bull":[],"bear":[]}`,
      `COMPANY: ${c.name} (${c.basis})\n\nPROMISES\n${claims}\n\nREPORTED NUMBERS\n${numbers}\n\nTRANSCRIPT OPENING (for business description)\n${opening.slice(0, 2500)}`,
      3500,
    ).catch((e) => {
      r.error = `Analysis step failed: ${(e as Error).message?.slice(0, 120)}`;
      return null;
    });
    if (out) Object.assign(r, { ledger: out.ledger ?? [], scorecard: out.scorecard ?? "", business: out.business ?? "", bull: out.bull ?? [], bear: out.bear ?? [] });
  }
  r.cost = { calls: usage.calls - u0.calls, inTokens: usage.inTokens - u0.inTokens, outTokens: usage.outTokens - u0.outTokens, ms: Date.now() - t0 };
  return r;
}
