import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (compatible; FINN-prototype/0.1)";

export type Table = { headers: string[]; rows: Record<string, (number | null)[]> };
export type Filing = { title: string; category: string; date: string; summary: string; url: string };
export type Concall = { month: string; transcript?: string; ppt?: string };
export type Company = {
  symbol: string;
  name: string;
  about: string;
  basis: "consolidated" | "standalone";
  ratios: Record<string, string>;
  quarters: Table;
  annual: Table;
  balance: Table;
  cashflow: Table;
  filings: Filing[];
  concalls: Concall[];
  annualReports: { year: string; url: string }[];
};

const num = (s: string): number | null => {
  const t = s.replace(/[,%₹\s]/g, "");
  if (!t || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function parseTable($: cheerio.CheerioAPI, sectionId: string): Table {
  const sec = $(`section#${sectionId} table.data-table`).first();
  const headers = sec
    .find("thead th")
    .map((_, th) => $(th).text().trim())
    .get()
    .slice(1);
  const rows: Table["rows"] = {};
  sec.find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    const label = $(tds[0]).text().replace(/\+/g, "").replace(/\s+/g, " ").trim();
    if (!label) return;
    rows[label] = tds
      .slice(1)
      .map((_, td) => num($(td).text()))
      .get();
  });
  return { headers, rows };
}

async function fetchPage(symbol: string, consolidated: boolean) {
  const url = `https://www.screener.in/company/${encodeURIComponent(symbol)}/${consolidated ? "consolidated/" : ""}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 3600 } } as RequestInit);
  if (!res.ok) throw new Error(`screener ${res.status} for ${symbol}`);
  return res.text();
}

/** "29 Oct" -> ISO date in the most recent past year (IST noon). */
function inferDate(s: string): string {
  const m = s.trim().match(/^(\d{1,2}) (\w{3})(?: (\d{4}))?/);
  if (!m) return "";
  const now = new Date();
  let y = m[3] ? +m[3] : now.getFullYear();
  let d = new Date(`${m[2]} ${m[1]} ${y} 12:00:00 GMT+0530`);
  if (!m[3] && d > now) d = new Date(`${m[2]} ${m[1]} ${--y} 12:00:00 GMT+0530`);
  return isNaN(+d) ? "" : d.toISOString();
}

/** Category label from the BSE title, e.g. "Announcement under Regulation 30 (LODR)-Credit Rating" -> "Credit Rating" */
function bseSubcategory(title: string) {
  const m = title.match(/\(LODR\)\s*-\s*(.+)$/i);
  return (m ? m[1] : title).trim();
}

export async function getCompany(rawSymbol: string): Promise<Company> {
  const symbol = rawSymbol.trim().toUpperCase().replace(/\.(NS|BO)$/, "");
  let html = await fetchPage(symbol, true);
  let $ = cheerio.load(html);
  let basis: Company["basis"] = "consolidated";
  // Companies without subsidiaries have an empty consolidated view — fall back to standalone.
  if ($("section#quarters tbody tr").length === 0) {
    html = await fetchPage(symbol, false);
    $ = cheerio.load(html);
    basis = "standalone";
  }
  const name = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (!name) throw new Error(`No company found for ${symbol}`);

  const ratios: Record<string, string> = {};
  $("#top-ratios li").each((_, li) => {
    const k = $(li).find(".name").text().trim();
    const v = $(li).find(".value").text().replace(/\s+/g, " ").trim();
    if (k) ratios[k] = v;
  });

  const filings: Filing[] = [];
  $("#company-announcements-tab ul.list-links li a").each((_, a) => {
    const el = $(a);
    const meta = el.find("div");
    const time = el.find("time").first();
    const date = time.attr("datetime") || inferDate(time.text());
    const summary = meta.find("time").length ? meta.text().replace(/\s+/g, " ").trim().replace(/^[^-]*-\s*/, "") : "";
    meta.remove();
    time.remove();
    const title = el.text().replace(/\s+/g, " ").trim();
    filings.push({ title, category: bseSubcategory(title), date, summary, url: el.attr("href") || "" });
  });

  const concalls: Concall[] = [];
  $(".documents.concalls ul.list-links li").each((_, li) => {
    const month = $(li).find("div").first().text().trim();
    const c: Concall = { month };
    $(li)
      .find("a")
      .each((_, a) => {
        const t = $(a).text().trim();
        if (t === "Transcript") c.transcript = $(a).attr("href");
        if (t === "PPT") c.ppt = $(a).attr("href");
      });
    concalls.push(c);
  });

  const annualReports: Company["annualReports"] = [];
  $(".documents.annual-reports ul.list-links li a, .annual-reports ul.list-links li a").each((_, a) => {
    const t = $(a).text().replace(/\s+/g, " ").trim();
    const m = t.match(/Financial Year (\d{4})|Annual Report (\d{4})/i);
    if (m) annualReports.push({ year: m[1] || m[2], url: $(a).attr("href") || "" });
  });

  return {
    symbol,
    name,
    about: $(".company-profile .about").text().replace(/\s+/g, " ").trim(),
    basis,
    ratios,
    quarters: parseTable($, "quarters"),
    annual: parseTable($, "profit-loss"),
    balance: parseTable($, "balance-sheet"),
    cashflow: parseTable($, "cash-flow"),
    filings,
    concalls,
    annualReports,
  };
}

/** First matching row among label variants (banks use "Revenue"/"Financing Profit" etc.). */
export function row(t: Table, ...labels: string[]): (number | null)[] {
  for (const l of labels) {
    const k = Object.keys(t.rows).find((r) => r.toLowerCase() === l.toLowerCase());
    if (k) return t.rows[k];
  }
  return [];
}
