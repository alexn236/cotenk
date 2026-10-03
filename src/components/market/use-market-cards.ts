import { TEMPLATES, type TemplateCategory } from "@/lib/templates";

/** A template as the gallery shows it. */
export type MarketCard = {
  key: string;
  title: string;
  description: string;
  category: TemplateCategory;
  author: string;
  content: string;
  interactive: boolean;
};

const CARDS: MarketCard[] = TEMPLATES.map((t) => ({
  key: t.id,
  title: t.title,
  description: t.description,
  category: t.category,
  author: t.author,
  content: t.content,
  interactive: t.interactive,
}));

export function useMarketCards(): MarketCard[] {
  return CARDS;
}
