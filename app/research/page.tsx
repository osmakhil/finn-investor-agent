"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PORTFOLIO, RESEARCH_SUGGESTIONS } from "@/lib/portfolio";

export default function ResearchHome() {
  const [q, setQ] = useState("");
  const r = useRouter();
  return (
    <main className="px-4 pt-[max(env(safe-area-inset-top),16px)]">
      <div className="text-[12px] uppercase tracking-[0.14em] text-mute">Pull</div>
      <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">Did they do what they said?</h1>
      <p className="mt-2 text-[14px] leading-snug text-sub">
        FINN reads a company&apos;s last four earnings calls, pulls out every number management promised, and checks each one
        against what they actually reported. It uses primary sources only.
      </p>
      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) r.push(`/research/${q.trim().toUpperCase()}`);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Any NSE symbol, e.g. TITAN"
          autoCapitalize="characters"
          className="num min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-3 text-[15px] uppercase outline-none placeholder:normal-case placeholder:text-mute focus:border-accent"
        />
        <button className="rounded-xl bg-ink px-5 text-[14px] font-medium text-bg">Go</button>
      </form>
      <h2 className="mb-2 mt-7 text-[12px] font-medium uppercase tracking-[0.14em] text-mute">Try</h2>
      <div className="flex flex-wrap gap-2">
        {RESEARCH_SUGGESTIONS.map((s) => (
          <Link key={s} href={`/research/${s}`} className="rounded-full border border-line px-3.5 py-1.5 text-[13px]">{s}</Link>
        ))}
      </div>
      <h2 className="mb-2 mt-7 text-[12px] font-medium uppercase tracking-[0.14em] text-mute">Your holdings</h2>
      <div className="flex flex-wrap gap-2">
        {PORTFOLIO.map((p) => (
          <Link key={p.symbol} href={`/research/${p.symbol}`} className="rounded-full bg-card px-3.5 py-1.5 text-[13px] text-sub">{p.symbol}</Link>
        ))}
      </div>
    </main>
  );
}
