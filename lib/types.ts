import type { Category } from "./classify";
import type { Filing } from "./screener";
import type { Headline } from "./metrics";

export type BriefFiling = Filing & {
  cat: Category;
  score: number;
  ruled: boolean;
  why?: string;
  results?: Headline;
  person?: { name: string; role: string; incoming: boolean; bio: string };
};

export type BriefCompany = {
  symbol: string;
  name: string;
  sector: string;
  marketCap: string;
  prices: { d: string; c: number; v: number }[];
  filings: BriefFiling[];
};

export type Brief = {
  generatedAt: string;
  companies: BriefCompany[];
  usage: { calls: number; inTokens: number; outTokens: number };
};
