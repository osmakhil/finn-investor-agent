"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Brief as BriefT, BriefCompany, BriefFiling } from "@/lib/types";
import { LABEL } from "@/lib/classify";
import { Pct, ResultsTable, Spark, Tag } from "./ui";
import { computeAlerts, DEFAULT_SETTINGS } from "@/lib/alerts";

const WINDOWS = [
  { k: "24h", h: 24 },
  { k: "3d", h: 72 },
  { k: "7d", h: 168 },
  { k: "30d", h: 720 },
];

type Item = { co: BriefCompany; f: BriefFiling };

const dayChg = (co: BriefCompany) => {
  const p = co.prices;
  return p.length > 1 ? ((p.at(-1)!.c - p.at(-2)!.c) / p.at(-2)!.c) * 100 : null;
};

const ago = (iso: string, now: number) => {
  const h = (now - +new Date(iso)) / 36e5;
  return h < 1 ? "just now" : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

export default function Brief({ data }: { data: BriefT }) {
  const [win, setWin] = useState("24h");
  // Anchor the window to the snapshot time so the demo still reads sensibly if the snapshot is a day old.
  const now = +new Date(data.generatedAt);
  const hours = WINDOWS.find((w) => w.k === win)!.h;

  const { top, mid, routine, total } = useMemo(() => {
    const items: Item[] = data.companies.flatMap((co) =>
      co.filings.filter((f) => f.date && now - +new Date(f.date) <= hours * 36e5).map((f) => ({ co, f })),
    );
    items.sort((a, b) => b.f.score - a.f.score || b.f.date.localeCompare(a.f.date));
    // Group material items by company: one story per company, the lead filing on top.
    const byCo = new Map<string, Item[]>();
    for (const it of items.filter((x) => x.f.score >= 70)) {
      byCo.set(it.co.symbol, [...(byCo.get(it.co.symbol) ?? []), it]);
    }
    return {
      top: [...byCo.values()],
      mid: items.filter((x) => x.f.score >= 40 && x.f.score < 70),
      routine: items.filter((x) => x.f.score < 40),
      total: items.length,
    };
  }, [data, hours, now]);

  const moves = useMemo(
    () => computeAlerts(data.companies, { ...DEFAULT_SETTINGS, cats: [] }, 1),
    [data],
  );

  const when = new Date(data.generatedAt);
  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),16px)]">
      <header className="mb-4">
        <div className="text-[12px] uppercase tracking-[0.14em] text-mute">
          {when.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} · as of{" "}
          {when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">
          {top.length === 0 ? "Nothing needs you." : `${top.length} ${top.length === 1 ? "thing needs" : "things need"} you.`}
        </h1>
        <p className="mt-1 text-[14px] text-sub">
          {total} filings across {data.companies.length} holdings in the last {win}.{" "}
          {routine.length > 0 && <>{routine.length} routine ones are folded away.</>}
        </p>
      </header>

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {WINDOWS.map((w) => (
          <button
            key={w.k}
            onClick={() => setWin(w.k)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] ${win === w.k ? "border-ink bg-ink text-bg" : "border-line text-sub"}`}
          >
            Last {w.k}
          </button>
        ))}
      </div>

      {moves.length > 0 && (
        <Link href="/alerts" className="mb-4 flex items-center justify-between rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3">
          <div className="text-[13.5px]">
            <span className="font-medium text-warn">{moves.length} unusual {moves.length === 1 ? "move" : "moves"}</span>
            <span className="text-sub"> last session · {[...new Set(moves.map((m) => m.symbol))].slice(0, 3).join(", ")}</span>
          </div>
          <span className="text-warn">›</span>
        </Link>
      )}

      {top.length > 0 && <SectionTitle>Needs attention</SectionTitle>}
      <div className="space-y-3">
        {top.map((group) => (
          <StoryCard key={group[0].co.symbol} items={group} now={now} />
        ))}
      </div>

      {mid.length > 0 && (
        <>
          <SectionTitle>Worth knowing</SectionTitle>
          <div className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
            {mid.map(({ co, f }) => (
              <a key={f.url + co.symbol} href={f.url} target="_blank" rel="noreferrer" className="block px-4 py-3">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-semibold">{co.symbol}</span>
                  <Tag>{LABEL[f.cat]}</Tag>
                  <span className="ml-auto text-mute">{ago(f.date, now)}</span>
                </div>
                <p className="mt-1 text-[13.5px] leading-snug text-sub">{f.summary || f.why || f.category}</p>
              </a>
            ))}
          </div>
        </>
      )}

      {routine.length > 0 && (
        <details className="group mt-6 rounded-2xl border border-line">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13.5px] text-sub">
            <span>{routine.length} routine filings: investor meets, call notices, ESOPs, newspaper ads</span>
            <span className="transition group-open:rotate-90">›</span>
          </summary>
          <div className="divide-y divide-line border-t border-line">
            {routine.map(({ co, f }) => (
              <a key={f.url + co.symbol} href={f.url} target="_blank" rel="noreferrer" className="flex gap-3 px-4 py-2.5 text-[12.5px]">
                <span className="w-20 shrink-0 font-medium text-sub">{co.symbol}</span>
                <span className="text-mute">{f.category}</span>
              </a>
            ))}
          </div>
        </details>
      )}

      {total === 0 && <p className="mt-8 text-center text-sub">Quiet window. Try a longer one.</p>}

      <p className="mt-8 text-center text-[11px] text-mute">
        Sorted by rules first, AI only for the ambiguous ones: {data.usage.calls} model calls for {data.companies.reduce((a, c) => a + c.filings.length, 0)} filings.
      </p>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-mute">{children}</h2>;
}

function StoryCard({ items, now }: { items: Item[]; now: number }) {
  const { co, f } = items[0];
  const chg = dayChg(co);
  return (
    <article className="rounded-2xl bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-semibold">{co.symbol}</span>
            <Tag tone={f.score >= 85 ? "hot" : "warm"}>{LABEL[f.cat]}</Tag>
          </div>
          <div className="truncate text-[12px] text-mute">{co.name} · {co.sector}</div>
        </div>
        <div className="flex flex-col items-end">
          <Spark values={co.prices.slice(-30).map((p) => p.c)} highlightLast />
          <Pct v={chg} className="text-[12px]" />
        </div>
      </div>

      <p className="mt-3 text-[14.5px] leading-snug">{f.summary || f.why || f.category}</p>

      {f.results && <ResultsTable h={f.results} />}

      {f.person && f.person.name && (
        <div className="mt-3 rounded-xl bg-card2 p-3">
          <div className="text-[11px] uppercase tracking-wide text-mute">{f.person.incoming ? "Incoming" : "Outgoing"} · {f.person.role}</div>
          <div className="mt-0.5 text-[14px] font-medium">{f.person.name}</div>
          {f.person.bio && <p className="mt-1 text-[12.5px] leading-snug text-sub">{f.person.bio}</p>}
        </div>
      )}

      {items.length > 1 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {items.slice(1).map(({ f: g }) => (
            <li key={g.url} className="flex gap-2 text-[12.5px] text-sub">
              <Tag>{LABEL[g.cat]}</Tag>
              <a href={g.url} target="_blank" rel="noreferrer" className="line-clamp-2">{g.summary || g.why || g.category}</a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-4 text-[12.5px]">
        <span className="text-mute">{ago(f.date, now)}</span>
        <a href={f.url} target="_blank" rel="noreferrer" className="text-sub underline-offset-2 hover:underline">Filing ↗</a>
        <Link href={`/research/${co.symbol}`} className="ml-auto font-medium text-accent">Check their promises →</Link>
      </div>
    </article>
  );
}
