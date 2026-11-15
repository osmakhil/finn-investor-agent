import { extractText } from "unpdf";
import { chatJSON, MODELS } from "./llm";
import type { Headline } from "./metrics";

const QE = ["Mar", "Jun", "Sep", "Dec"];

/** The quarter a results filing on `iso` most likely reports: the last quarter-end before it. */
export function expectedQuarter(iso: string): string {
  const d = new Date(iso);
  let y = d.getFullYear();
  const m = d.getMonth(); // 0-based
  // quarter ends: Mar(2) Jun(5) Sep(8) Dec(11)
  const ends = [2, 5, 8, 11].filter((e) => e < m);
  if (!ends.length) return `Dec ${--y}`;
  return `${QE[[2, 5, 8, 11].indexOf(ends.at(-1)!)]} ${y}`;
}

type Col = { revenue: number | null; other_income: number | null; finance_costs: number | null; depreciation: number | null; pbt: number | null; pat: number | null };

/** Fetch a PDF; some BSE responses trip Node's HTTP parser, so fall back to curl (build script only). */
export async function fetchPdf(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; FINN-prototype/0.1)" } });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch {}
  try {
    const { execFileSync } = await import("node:child_process");
    const buf = execFileSync("curl", ["-sL", "--max-time", "60", "-A", "Mozilla/5.0 (compatible; FINN-prototype/0.1)", url], { maxBuffer: 50e6 });
    return buf.length > 1000 ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

/**
 * First-cut headline numbers straight from the results filing PDF, for when standardised data
 * hasn't caught up yet. Cheap model, ~2-3k tokens: we only send the P&L page region.
 */
export async function headlineFromFiling(url: string, quarter: string): Promise<Headline | null> {
  const bytes = await fetchPdf(url);
  if (!bytes) return null;
  const { text } = await extractText(bytes, { mergePages: false });
  const pages = (text as string[]).map((p) => p.replace(/\s+/g, " "));
  // Prefer the consolidated P&L page; fall back to the first page with revenue lines.
  const isPL = (p: string) => /revenue from operations|total income/i.test(p) && /profit before tax/i.test(p);
  const page = pages.find((p) => isPL(p) && /consolidated/i.test(p)) ?? pages.find(isPL);
  if (!page) { console.warn("no P&L page", pages.length, url); return null; }
  const out = await chatJSON<{ unit: string; current: Col; previous: Col; year_ago: Col; prev_label: string; year_ago_label: string }>(
    MODELS.fast,
    `Extract quarterly P&L numbers from an Indian listed company's results statement. Columns are usually: quarter ended (current), preceding quarter, corresponding quarter last year, then half-year/year columns (ignore those). Return {"unit":"crore|lakh|million","prev_label":"e.g. Jun 2026","year_ago_label":"e.g. Sep 2025","current":{...},"previous":{...},"year_ago":{...}} where each has revenue (revenue from operations), other_income, finance_costs, depreciation, pbt (profit before tax), pat (net profit for the period). Numbers only, null if absent.`,
    page.replace(/\s+/g, " ").slice(0, 7000),
    2500,
  ).catch(() => null);
  if (!out?.current?.revenue) return null;
  // Unit from the statement header itself (deterministic), model's answer only as fallback.
  const u = (page.match(/(?:rs\.?|₹|inr)\s*(?:in\s*)?(lakhs?|crores?|millions?|cr\b)/i) || page.match(/in\s*(lakhs?|crores?|millions?)/i))?.[1] ?? out.unit ?? "";
  const k = /lakh/i.test(u) ? 0.01 : /million/i.test(u) ? 0.1 : 1;
  const ebitda = (c: Col) =>
    c.pbt == null ? null : c.pbt + (c.finance_costs ?? 0) + (c.depreciation ?? 0) - (c.other_income ?? 0);
  const pct = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
  const line = (label: string, f: (c: Col) => number | null) => {
    const a = f(out.current), b = f(out.previous), c = f(out.year_ago);
    return { label, value: a == null ? null : a * k, qoq: pct(a, b), yoy: pct(a, c) };
  };
  const m = (c: Col) => (c.revenue && ebitda(c) != null ? +((ebitda(c)! / c.revenue) * 100).toFixed(0) : null);
  return {
    quarter,
    prevQuarter: out.prev_label || "prev qtr",
    yearAgo: out.year_ago_label || "year ago",
    isBank: false,
    lines: [line("Revenue", (c) => c.revenue), line("EBITDA", ebitda), line("PBT", (c) => c.pbt), line("PAT", (c) => c.pat)],
    margin: { label: "EBITDA margin", now: m(out.current), prev: m(out.previous), yearAgo: m(out.year_ago) },
    fromFiling: true,
  };
}
