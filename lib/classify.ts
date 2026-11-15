// Rule-first announcement classifier. BSE subcategory titles are already fairly structured,
// so regex rules settle most filings for free; only the ambiguous ones go to a small LLM.

export type Category =
  | "results" | "M&A" | "fund_raise" | "management_change" | "litigation" | "insider_trading"
  | "earnings_call" | "investor_meetings" | "credit_rating" | "dividend" | "bonus_split" | "capex"
  | "press_release" | "postal_ballot" | "agm_egm" | "pledging" | "unclassified";

export const BASE_SCORE: Record<Category, number> = {
  results: 90,
  management_change: 85,
  "M&A": 85,
  litigation: 75,
  fund_raise: 75,
  pledging: 70,
  capex: 70,
  bonus_split: 60,
  press_release: 50,
  credit_rating: 45,
  insider_trading: 45,
  dividend: 45,
  earnings_call: 25,
  agm_egm: 20,
  postal_ballot: 20,
  investor_meetings: 12,
  unclassified: 5,
};

export const LABEL: Record<Category, string> = {
  results: "Results",
  management_change: "Management",
  "M&A": "M&A",
  litigation: "Litigation",
  fund_raise: "Fund raise",
  pledging: "Pledge",
  capex: "Capex",
  bonus_split: "Bonus / split",
  press_release: "Business update",
  credit_rating: "Credit rating",
  insider_trading: "Insider trade",
  dividend: "Dividend",
  earnings_call: "Earnings call",
  agm_egm: "AGM / EGM",
  postal_ballot: "Postal ballot",
  investor_meetings: "Investor meet",
  unclassified: "Routine",
};

const RULES: [Category, RegExp][] = [
  ["earnings_call", /transcript|audio recording|earnings call|conference call|con-?call/i],
  ["investor_meetings", /analyst|investor meet|institutional investor/i],
  ["press_release", /results issued by|holding company|parent company/i],
  ["results", /financial results?|^results\b|outcome of board meeting.*result|board meeting intimation.*result|integrated filing.*financial/i],
  ["management_change", /change in (director|management|key managerial|kmp)|resignation|appointment of|cessation|re-?appoint|(ceo|cfo|managing director|company secretary)\b.*(appoint|resign)/i],
  ["M&A", /acquisition|amalgamation|merger|demerger|scheme of arrangement|joint venture|stake (sale|purchase)|divest/i],
  ["fund_raise", /qualified institutional|\bqip\b|rights issue|preferential (issue|allotment)|buy-?back|commercial paper|non-convertible|\bncd\b|fund raising|raising of funds/i],
  ["litigation", /litigation|dispute|penalty|show cause|order passed|tax demand|gst|insolvency|nclt|sebi order|regulatory action|fine\b/i],
  ["pledging", /pledge|encumbrance/i],
  ["insider_trading", /insider trading|regulation 7\(2\)|reg\. 29|regulation 29|regulation 31|sast/i],
  ["credit_rating", /credit rating/i],
  ["bonus_split", /bonus|sub-?division|stock split|split of/i],
  ["dividend", /dividend|record date/i],
  ["capex", /capex|capital expenditure|capacity expansion|new plant|commissioning|greenfield|brownfield/i],
  ["agm_egm", /\bagm\b|\begm\b|annual general meeting|extra-?ordinary general/i],
  ["postal_ballot", /postal ballot|e-?voting/i],
  ["unclassified", /esop|esos|allotment of (equity )?shares under|trading window|compliance certificate|regulation 74|reg\. 74|newspaper (publication|advertisement)|loss of share|duplicate share|certificate under|brsr|esg|copy of newspaper|closure of trading/i],
  ["press_release", /press release|media release|order|contract|award|launch|partnership|agreement|clarification/i],
];

export function ruleClassify(category: string, title: string, summary: string): Category | null {
  // Match on the BSE subcategory first (most reliable), then the summary text.
  for (const text of [category, `${title} ${summary}`]) {
    for (const [cat, re] of RULES) if (re.test(text)) return cat;
  }
  return null;
}

/** Nudge the base score with signals in the text — e.g. downgrades matter, reaffirmations don't. */
export function score(cat: Category, text: string): number {
  let s = BASE_SCORE[cat];
  const t = text.toLowerCase();
  if (cat === "credit_rating") s = /downgrad|negative|watch/.test(t) ? 80 : /upgrad|positive/.test(t) ? 65 : 25;
  if (cat === "management_change" && /(ceo|cfo|managing director|chief executive|chief financial|chairman|whole[- ]time)/.test(t)) s += 8;
  if (cat === "management_change" && /independent director|company secretary|compliance officer|senior management/.test(t)) s -= 25;
  if (cat === "results" && /intimation|to consider|will be held|newspaper/.test(t)) s = 35;
  if (cat === "pledging" && /release|revoc/.test(t)) s -= 25;
  if (cat === "press_release" && /order|contract|award/.test(t) && /crore|cr\b|bn|billion|million/.test(t)) s += 15;
  return Math.max(0, Math.min(100, s));
}
