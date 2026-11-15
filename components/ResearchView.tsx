"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LedgerItem, Research } from "@/lib/research";
import { ResultsTable } from "./ui";

const STEPS = ["Fetching reported financials", "Reading the last 4 earnings-call transcripts", "Extracting what management promised", "Checking promises against the numbers"];

const VERDICT: Record<LedgerItem["verdict"], { label: string; cls: string; bar: string }> = {
  delivered: { label: "Delivered", cls: "bg-up/15 text-up", bar: "bg-up" },
  partly: { label: "Partly", cls: "bg-warn/15 text-warn", bar: "bg-warn" },
  missed: { label: "Missed", cls: "bg-down/15 text-down", bar: "bg-down" },
  pending: { label: "Pending", cls: "bg-accent/15 text-accent", bar: "bg-accent" },
  unverifiable: { label: "Can't verify", cls: "bg-card2 text-mute", bar: "bg-mute" },
};

export default function ResearchView({ symbol }: { symbol: string }) {
  const [r, setR] = useState<(Research & { cached?: boolean }) | null>(null);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(0);

  useEffect(() => {
    let alive = true;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4500);
    fetch(`/api/research?symbol=${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        const j = await res.json();
        if (!alive) return;
        if (!res.ok) setErr(j.error || "Something went wrong");
        else setR(j);
      })
      .catch(() => alive && setErr("Network error"))
      .finally(() => clearInterval(t));
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [symbol]);

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),16px)]">
      <Link href="/research" className="text-[13px] text-mute">‹ Research</Link>
      <h1 className="mt-2 text-[26px] font-semibold tracking-tight">{r?.name || symbol}</h1>
      {r && (
        <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-sub">
          {["Current Price", "Market Cap", "Stock P/E", "ROCE", "ROE"].map((k) =>
            r.ratios[k] ? <span key={k}><span className="text-mute">{k.replace("Current ", "").replace("Stock ", "")}</span> {r.ratios[k]}</span> : null,
          )}
        </div>
      )}

      {!r && !err && (
        <div className="mt-8 space-y-3">
          {STEPS.map((s, i) => (
            <div key={s} className={`flex items-center gap-3 text-[14px] ${i <= step ? "text-ink" : "text-mute"}`}>
              <span className={`h-2 w-2 rounded-full ${i < step ? "bg-up" : i === step ? "animate-pulse bg-accent" : "bg-line"}`} />
              {s}
            </div>
          ))}
          <p className="pt-2 text-[12px] text-mute">A first run takes 20–40s. After that it&apos;s cached.</p>
        </div>
      )}
      {err && <p className="mt-8 rounded-2xl bg-down/10 p-4 text-[14px] text-down">{err}</p>}
      {r && <Body r={r} />}
    </main>
  );
}

function Body({ r }: { r: Research & { cached?: boolean } }) {
  const counts = r.ledger.reduce<Record<string, number>>((a, x) => ((a[x.verdict] = (a[x.verdict] || 0) + 1), a), {});
  const order: LedgerItem["verdict"][] = ["delivered", "partly", "missed", "pending", "unverifiable"];
  return (
    <>
      {r.business && <p className="mt-3 text-[14px] leading-snug text-sub">{r.business}</p>}

      {/* HERO: promise ledger */}
      <section className="mt-6">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-mute">Promise ledger · last 4 calls</h2>
        {r.scorecard && <p className="mt-2 text-[17px] font-medium leading-snug">{r.scorecard}</p>}
        {r.ledger.length > 0 && (
          <>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-card2">
              {order.map((v) => counts[v] ? <div key={v} className={VERDICT[v].bar} style={{ width: `${(counts[v] / r.ledger.length) * 100}%` }} /> : null)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 text-[12px] text-sub">
              {order.map((v) => counts[v] ? <span key={v}><span className="num text-ink">{counts[v]}</span> {VERDICT[v].label.toLowerCase()}</span> : null)}
            </div>
            <div className="mt-4 space-y-3">
              {r.ledger.map((x, i) => <LedgerCard key={i} x={x} />)}
            </div>
          </>
        )}
        {r.error && <p className="mt-3 rounded-xl bg-warn/10 p-3 text-[13px] text-warn">{r.error}</p>}
      </section>

      {r.headline && (
        <section className="mt-8">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-mute">Latest quarter</h2>
          <ResultsTable h={r.headline} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-mute">Last 8 quarters</h2>
        <QuarterBars r={r} />
      </section>

      {r.health.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-mute">Quality checks</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {r.health.map((h) => (
              <div key={h.label} className="rounded-xl bg-card p-3">
                <div className="text-[11.5px] text-mute">{h.label}</div>
                <div className={`num mt-0.5 text-[18px] ${h.tone === "good" ? "text-up" : h.tone === "bad" ? "text-down" : "text-ink"}`}>{h.value}</div>
                <div className="text-[11px] text-mute">{h.note}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(r.bull.length > 0 || r.bear.length > 0) && (
        <section className="mt-8 grid gap-2">
          <Case title="Bull" items={r.bull} cls="text-up" />
          <Case title="Bear" items={r.bear} cls="text-down" />
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-mute">Sources (primary only)</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {r.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3 py-1 text-[12px] text-sub">{s.label} ↗</a>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-mute">
          {r.basis} financials · {r.cost.calls} model calls · {((r.cost.inTokens + r.cost.outTokens) / 1000).toFixed(1)}k tokens · built in{" "}
          {(r.cost.ms / 1000).toFixed(0)}s{r.cached ? " · cached" : ""} · {new Date(r.generatedAt).toLocaleDateString("en-IN")}
        </p>
      </section>
    </>
  );
}

function LedgerCard({ x }: { x: LedgerItem }) {
  const v = VERDICT[x.verdict] ?? VERDICT.unverifiable;
  return (
    <details className="group rounded-2xl bg-card p-4">
      <summary className="cursor-pointer">
        <div className="flex items-center gap-2 text-[11.5px] text-mute">
          <span className={`rounded-md px-1.5 py-0.5 font-medium ${v.cls}`}>{v.label}</span>
          <span>{x.metric?.replace(/_/g, " ")}</span>
          <span className="ml-auto">said {x.call}</span>
        </div>
        <p className="mt-2 text-[14.5px] leading-snug">{x.promise}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
          <div className="rounded-lg bg-card2 px-2.5 py-1.5"><div className="text-[10.5px] uppercase text-mute">Promised</div><div className="num">{x.target || "—"}</div></div>
          <div className="rounded-lg bg-card2 px-2.5 py-1.5"><div className="text-[10.5px] uppercase text-mute">Delivered</div><div className="num">{x.actual || "—"}</div></div>
        </div>
      </summary>
      <div className="mt-3 border-t border-line pt-3 text-[12.5px] leading-snug">
        <p className="text-sub">{x.evidence}</p>
        {x.quote && <p className="mt-2 border-l-2 border-line pl-3 italic text-mute">&ldquo;{x.quote}&rdquo;</p>}
      </div>
    </details>
  );
}

function Case({ title, items, cls }: { title: string; items: string[]; cls: string }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className={`text-[12px] font-semibold uppercase tracking-wide ${cls}`}>{title}</div>
      <ul className="mt-2 space-y-1.5 text-[13.5px] leading-snug text-sub">
        {items.map((b, i) => <li key={i}>· {b}</li>)}
      </ul>
    </div>
  );
}

function QuarterBars({ r }: { r: Research }) {
  const { periods, revenue, opm, pat } = r.quarterly;
  const max = Math.max(...revenue.map((v) => v ?? 0), 1);
  return (
    <div className="mt-2 rounded-2xl bg-card p-4">
      <div className="flex h-28 items-end gap-1.5">
        {periods.map((p, i) => (
          <div key={p} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="num text-[9.5px] text-mute">{opm[i] != null ? `${opm[i]}%` : ""}</div>
            <div className="w-full rounded-t bg-accent/70" style={{ height: `${((revenue[i] ?? 0) / max) * 80}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {periods.map((p) => <div key={p} className="flex-1 text-center text-[9px] text-mute">{p.replace(" 20", " '")}</div>)}
      </div>
      <div className="mt-3 flex justify-between text-[11.5px] text-sub">
        <span>Revenue bars · margin above</span>
        <span className="num">PAT {pat.at(-1) != null ? `₹${Math.round(pat.at(-1)!).toLocaleString("en-IN")} Cr` : "—"}</span>
      </div>
    </div>
  );
}
