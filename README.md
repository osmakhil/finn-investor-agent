# FINN: your portfolio, filtered

A mobile-first investment agent for an Indian-equities investor. It has two modes.

- **Push: the Brief and Alerts.** "N things need you today." Every filing across an 18-stock portfolio is scored for importance. Material ones become one story card per company, mid-importance ones get a single line, and routine paperwork is folded away. Results cards show Revenue, EBITDA, PBT and PAT against last quarter (QoQ) and the same quarter last year (YoY). Management-change cards include a short bio of the person. Alerts fire on thresholds you set yourself: volume above X× average, price moves beyond ±Y%, and filing types you choose.
- **Pull: the Promise Ledger.** Type any NSE symbol. FINN reads the company's last four earnings-call transcripts, pulls out every quantified promise management made, and checks each one against the reported numbers: **Delivered / Partly / Missed / Pending / Can't verify**, with the verbatim quote. Around that it shows the latest quarter, an 8-quarter trend, quality checks (growth CAGR, cash conversion, free cash flow, debt/equity) and a bull/bear case. It uses primary sources only: transcripts, filings and reported statements.

## The point of view

An investor doesn't need more information. They need to know **what changed and whether to believe management**. So:

1. **The Brief opens on a verdict, not a feed.** The headline is a count of things needing attention. Everything else is ranked below it or folded away, and push links to pull: every story card has "Check their promises →".
2. **Research focuses on credibility.** Summarising management is easy and mostly useless. Comparing what they said with what they delivered is the analysis that matters, so it's the main thing on the research screen.
3. **The user defines "unusual."** Alert rules are written as a sentence the user edits ("Tell me when volume is above 2× its 20-day average…"), not buried in settings.

## Architecture

```
screener.in (filings, transcript links, standardised financials) ─┐
Yahoo Finance via yahoo-finance2 (EOD price/volume) ──────────────┤
BSE PDFs (results filings, transcripts) ──────────────────────────┤
                                                                  ▼
 scripts/build-brief.mts  → data/brief.json   (push snapshot; GitHub Action refreshes it daily)
 app/api/research         → live for any ticker; cached in memory, /tmp, then repo snapshots
 Next.js App Router (mobile-first PWA) on Vercel
```

**Cost: model routing, caching and cutting text down before any model sees it**

| Step | How | Cost |
|---|---|---|
| Classify ~90 filings | Regex rules on BSE subcategories settle about 80% for free; the rest go to the small model in **one batched call** | ~1 call |
| Results QoQ/YoY | Taken from standardised quarterly data when it's current. If the filing is newer than that data, the P&L page of the results PDF goes to the small model; EBITDA is computed, not asked for | 0–1 call |
| Management bio | Small model with built-in browser search, only for top-level changes | 1 call per change |
| Promise ledger | A local pre-filter keeps only forward-looking, numeric sentences (a 94k-character transcript becomes ~4.5k), the **small model** extracts the promises, and the **large model** makes **one** judgement call | 4–5 calls, ~10–14k tokens per company |
| Everything | Cached by filing URL / symbol, so nothing is processed twice | |

Models (Groq free tier): `openai/gpt-oss-20b` for bulk work, `openai/gpt-oss-120b` only for the promise-vs-delivery judgement.

**Data notes and trade-offs**
- BSE's announcements API blocks automated clients, so filings come from screener.in's mirror of BSE filings. Each links to the original BSE PDF.
- Standardised quarterly data lags the exchange by a day or two. FINN detects when a results filing is for a quarter that isn't in the data yet, and reads the numbers straight from the PDF (labelled "read from filing").
- Health checks (CAGR, cash conversion, D/E, FCF) are **computed in code**, not generated, so they can't be hallucinated.
- Every quarter label given to the model includes its fiscal name (`Sep 2026 (Q2 FY27)`). Without that, the model mislabelled quarters.

## Left out on purpose
- Voice and chat UIs. A credibility ledger and a ranked brief are more useful than a chat box for this job.
- Intraday data, live push notifications and user accounts. Settings live on the device.
- News and broker notes. Research must use primary sources only.
- Segment-level and volume KPIs. Many promises are "Can't verify" because standardised data has no segment or volume numbers. The next step is to also read the investor presentation.

## Known limitations
- The ledger is a first cut. The model can still mis-judge timing, e.g. calling an H2 target "missed" mid-year. Every verdict shows its quote and evidence so a human can check it in seconds.
- Results extraction from PDFs depends on a text layer. Scanned PDFs fall back to "open the filing".

## Where I'd take it next
1. **Goalpost tracker.** Diff each guidance item across calls ("15–18% → 12–15% → 'high single digit'") and alert when it quietly moves.
2. Push-triggered research: when results land, auto-run the ledger and put "promised vs delivered" on the results card itself.
3. Read investor presentations to test segment and volume promises.
4. Real push notifications (Web Push) and a short 7pm "after the bell" digest.

## Run locally
```bash
npm install
echo "GROQ_API_KEY=..." > .env.local
npx tsx --env-file=.env.local scripts/build-brief.mts      # push snapshot
npx tsx --env-file=.env.local scripts/build-research.mts   # precompute demo research
npm run dev
```
