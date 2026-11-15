import { row, type Table } from "./screener";

export type Headline = {
  quarter: string;
  prevQuarter: string;
  yearAgo: string;
  isBank: boolean;
  lines: { label: string; value: number | null; qoq: number | null; yoy: number | null }[];
  margin: { label: string; now: number | null; prev: number | null; yearAgo: number | null } | null;
  fromFiling?: boolean; // parsed from the results PDF rather than standardised data
  pendingQuarter?: string; // filing is for a quarter not yet in the standardised table
};

const pct = (a: number | null, b: number | null) =>
  a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100;

/** Revenue / EBITDA / PBT / PAT for the latest quarter vs QoQ and YoY, from the quarterly table. */
export function headline(q: Table): Headline | null {
  const n = q.headers.length;
  if (n < 5) return null;
  const isBank = !!row(q, "Financing Profit").length;
  const get = (labels: string[]) => row(q, ...labels);
  const i = n - 1;
  const defs: [string, string[]][] = [
    ["Revenue", ["Sales", "Revenue"]],
    [isBank ? "Op. profit" : "EBITDA", ["Operating Profit", "Financing Profit"]],
    ["PBT", ["Profit before tax"]],
    ["PAT", ["Net Profit"]],
  ];
  const lines = defs.map(([label, labels]) => {
    const r = get(labels);
    return { label, value: r[i] ?? null, qoq: pct(r[i] ?? null, r[i - 1] ?? null), yoy: pct(r[i] ?? null, r[i - 4] ?? null) };
  });
  const m = get(["OPM %", "Financing Margin %"]);
  return {
    quarter: q.headers[i],
    prevQuarter: q.headers[i - 1],
    yearAgo: q.headers[i - 4],
    isBank,
    lines,
    margin: m.length ? { label: isBank ? "Financing margin" : "EBITDA margin", now: m[i], prev: m[i - 1], yearAgo: m[i - 4] } : null,
  };
}
