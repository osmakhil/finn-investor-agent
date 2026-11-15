import type { Headline } from "@/lib/metrics";

export function Pct({ v, className = "" }: { v: number | null | undefined; className?: string }) {
  if (v == null || !isFinite(v)) return <span className={`num text-mute ${className}`}>—</span>;
  const c = v > 0.05 ? "text-up" : v < -0.05 ? "text-down" : "text-sub";
  return <span className={`num ${c} ${className}`}>{v > 0 ? "+" : ""}{v.toFixed(1)}%</span>;
}

export function Spark({ values, w = 72, h = 22, highlightLast = false }: { values: number[]; w?: number; h?: number; highlightLast?: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const sx = (i: number) => (i / (values.length - 1)) * w;
  const sy = (v: number) => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
  const up = values.at(-1)! >= values[0];
  return (
    <svg width={w} height={h} className="shrink-0">
      <path d={d} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth="1.4" />
      {highlightLast && <circle cx={sx(values.length - 1)} cy={sy(values.at(-1)!)} r="2.5" fill={up ? "var(--up)" : "var(--down)"} />}
    </svg>
  );
}

export const crore = (v: number | null) =>
  v == null ? "—" : `₹${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(0)} Cr`;

/** Results first-cut: Revenue / EBITDA / PBT / PAT, QoQ and YoY. */
export function ResultsTable({ h }: { h: Headline }) {
  if (h.pendingQuarter)
    return (
      <div className="mt-3 rounded-xl bg-card2 p-3 text-[12.5px] text-sub">
        {h.pendingQuarter} numbers are in the filing but not in standardised data yet. Open the filing for the first cut.
      </div>
    );
  return (
    <div className="mt-3 rounded-xl bg-card2 p-3">
      <div className="mb-2 flex items-baseline justify-between text-[11px] text-mute">
        <span>Quarter ending {h.quarter}{h.fromFiling ? " · read from filing" : ""}</span>
        <span className="num">vs {h.prevQuarter} · vs {h.yearAgo}</span>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] text-mute">
            <th className="text-left font-normal" />
            <th className="text-right font-normal">₹ Cr</th>
            <th className="text-right font-normal">QoQ</th>
            <th className="text-right font-normal">YoY</th>
          </tr>
        </thead>
        <tbody>
          {h.lines.map((l) => (
            <tr key={l.label} className="border-t border-line/60">
              <td className="py-1.5 text-sub">{l.label}</td>
              <td className="num py-1.5 text-right">{l.value == null ? "—" : Math.round(l.value).toLocaleString("en-IN")}</td>
              <td className="py-1.5 text-right"><Pct v={l.qoq} /></td>
              <td className="py-1.5 text-right"><Pct v={l.yoy} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {h.margin && h.margin.now != null && (
        <div className="mt-2 text-[12px] text-sub">
          {h.margin.label} <span className="num text-ink">{h.margin.now}%</span>
          <span className="text-mute"> · was {h.margin.prev}% last qtr, {h.margin.yearAgo}% a year ago</span>
        </div>
      )}
    </div>
  );
}

export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "hot" | "warm" | "neutral" }) {
  const c = tone === "hot" ? "bg-down/15 text-down" : tone === "warm" ? "bg-warn/15 text-warn" : "bg-card2 text-sub";
  return <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide ${c}`}>{children}</span>;
}
