"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Brief } from "@/lib/types";
import { computeAlerts, DEFAULT_SETTINGS, type AlertSettings } from "@/lib/alerts";
import { LABEL, type Category } from "@/lib/classify";
import { Spark } from "./ui";

const KEY = "finn.alerts.v1";
const ALL_CATS: Category[] = ["results", "M&A", "management_change", "fund_raise", "litigation", "pledging", "capex", "credit_rating", "insider_trading", "bonus_split", "dividend", "press_release"];

export default function Alerts({ data }: { data: Brief }) {
  const [s, setS] = useState<AlertSettings>(DEFAULT_SETTINGS);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v) setS({ ...DEFAULT_SETTINGS, ...JSON.parse(v) });
    } catch {}
  }, []);
  const save = (n: AlertSettings) => {
    setS(n);
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {}
  };
  const alerts = useMemo(() => computeAlerts(data.companies, s, 10), [data, s]);
  const byDay = useMemo(() => {
    const m = new Map<string, typeof alerts>();
    for (const a of alerts) m.set(a.date, [...(m.get(a.date) ?? []), a]);
    return [...m.entries()];
  }, [alerts]);

  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),16px)]">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-[12px] uppercase tracking-[0.14em] text-mute">Watching 18 holdings</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Alerts</h1>
        </div>
        <button onClick={() => setOpen(!open)} className="rounded-full border border-line px-3.5 py-1.5 text-[13px] text-sub">
          {open ? "Done" : "Rules"}
        </button>
      </header>

      {/* The rules are stated as a sentence: the investor decides what "unusual" means. */}
      <p className="mb-4 rounded-2xl bg-card p-4 text-[14px] leading-relaxed text-sub">
        Tell me when volume is above <b className="num text-ink">{s.volX}×</b> its {s.lookback}-day average, a stock moves more than{" "}
        <b className="num text-ink">±{s.pricePct}%</b> in a day, or a holding files on{" "}
        <b className="text-ink">{s.cats.length ? s.cats.map((c) => LABEL[c].toLowerCase()).slice(0, 4).join(", ") + (s.cats.length > 4 ? ` +${s.cats.length - 4}` : "") : "nothing"}</b>.
      </p>

      {open && (
        <section className="mb-5 space-y-5 rounded-2xl border border-line p-4">
          <Slider label="Volume spike" unit="×" min={1.2} max={5} step={0.1} value={s.volX} onChange={(v) => save({ ...s, volX: v })} />
          <Slider label="Daily price move" unit="%" min={1} max={10} step={0.5} value={s.pricePct} onChange={(v) => save({ ...s, pricePct: v })} />
          <Slider label="Average over" unit=" days" min={5} max={50} step={1} value={s.lookback} onChange={(v) => save({ ...s, lookback: v })} />
          <div>
            <div className="mb-2 text-[13px] text-sub">Filing types that should ping me</div>
            <div className="flex flex-wrap gap-2">
              {ALL_CATS.map((c) => {
                const on = s.cats.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => save({ ...s, cats: on ? s.cats.filter((x) => x !== c) : [...s.cats, c] })}
                    className={`rounded-full border px-3 py-1 text-[12.5px] ${on ? "border-accent bg-accent/15 text-accent" : "border-line text-mute"}`}
                  >
                    {LABEL[c]}
                  </button>
                );
              })}
            </div>
          </div>
          <button onClick={() => save(DEFAULT_SETTINGS)} className="text-[12.5px] text-mute underline">Reset to defaults</button>
        </section>
      )}

      {byDay.length === 0 && <p className="mt-10 text-center text-sub">Nothing crossed your thresholds in the last 10 sessions.</p>}
      {byDay.map(([day, list]) => (
        <section key={day} className="mb-5">
          <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-mute">
            {new Date(day).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
            {list.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Dot kind={a.kind} up={a.kind === "price" ? a.value > 0 : undefined} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <Link href={`/research/${a.symbol}`} className="text-[14px] font-semibold">{a.symbol}</Link>
                    <span className="truncate text-[13px] text-ink">{a.headline}</span>
                  </div>
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-[12.5px] text-sub">{a.detail}</a>
                  ) : (
                    <div className="text-[12.5px] text-sub">{a.detail}</div>
                  )}
                </div>
                <Spark values={a.closes} w={56} h={22} highlightLast />
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="mt-6 text-center text-[11px] text-mute">End-of-day data · thresholds saved on this device</p>
    </main>
  );
}

function Dot({ kind, up }: { kind: string; up?: boolean }) {
  const c = kind === "volume" ? "bg-warn/15 text-warn" : kind === "filing" ? "bg-accent/15 text-accent" : up ? "bg-up/15 text-up" : "bg-down/15 text-down";
  const t = kind === "volume" ? "VOL" : kind === "filing" ? "FIL" : up ? "UP" : "DN";
  return <span className={`num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold ${c}`}>{t}</span>;
}

function Slider(p: { label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="text-sub">{p.label}</span>
        <span className="num">{p.value}{p.unit}</span>
      </div>
      <input type="range" className="w-full" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(+e.target.value)} />
    </label>
  );
}
