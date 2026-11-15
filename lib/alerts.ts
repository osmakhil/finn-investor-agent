import type { BriefCompany } from "./types";
import type { Category } from "./classify";

export type AlertSettings = {
  volX: number; // volume multiple vs trailing average
  pricePct: number; // absolute daily move %
  lookback: number; // days in trailing average
  cats: Category[]; // filing types that should alert
  minScore: number;
};

export const DEFAULT_SETTINGS: AlertSettings = {
  volX: 2,
  pricePct: 4,
  lookback: 20,
  cats: ["results", "M&A", "management_change", "fund_raise", "litigation", "pledging", "capex", "credit_rating"],
  minScore: 60,
};

export type Alert = {
  symbol: string;
  name: string;
  date: string;
  kind: "volume" | "price" | "filing";
  headline: string;
  detail: string;
  value: number;
  closes: number[];
  url?: string;
};

/** Scan EOD history for days that breach the user's thresholds, plus filings of watched types. */
export function computeAlerts(cos: BriefCompany[], s: AlertSettings, days = 10): Alert[] {
  const out: Alert[] = [];
  for (const c of cos) {
    const p = c.prices;
    for (let i = Math.max(s.lookback, p.length - days); i < p.length; i++) {
      const win = p.slice(i - s.lookback, i);
      const avgV = win.reduce((a, x) => a + x.v, 0) / win.length;
      const chg = ((p[i].c - p[i - 1].c) / p[i - 1].c) * 100;
      const closes = p.slice(Math.max(0, i - 30), i + 1).map((x) => x.c);
      const vx = avgV ? p[i].v / avgV : 0;
      if (vx >= s.volX) {
        out.push({
          symbol: c.symbol, name: c.name, date: p[i].d, kind: "volume", value: vx, closes,
          headline: `Volume ${vx.toFixed(1)}× its ${s.lookback}-day average`,
          detail: `${(p[i].v / 1e5).toFixed(1)} lakh shares vs ${(avgV / 1e5).toFixed(1)} lakh avg · price ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`,
        });
      }
      if (Math.abs(chg) >= s.pricePct) {
        out.push({
          symbol: c.symbol, name: c.name, date: p[i].d, kind: "price", value: chg, closes,
          headline: `${chg > 0 ? "Up" : "Down"} ${Math.abs(chg).toFixed(1)}% in a day`,
          detail: `Closed ₹${p[i].c.toLocaleString("en-IN")} from ₹${p[i - 1].c.toLocaleString("en-IN")}`,
        });
      }
    }
    for (const f of c.filings) {
      if (!s.cats.includes(f.cat) || f.score < s.minScore) continue;
      out.push({
        symbol: c.symbol, name: c.name, date: f.date.slice(0, 10), kind: "filing", value: f.score,
        closes: p.slice(-30).map((x) => x.c), headline: f.category, detail: f.summary || f.why || "", url: f.url,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.value) - Math.abs(a.value));
}
