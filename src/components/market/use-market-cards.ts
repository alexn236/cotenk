import { useMemo } from "react";
import { useAuth } from "@/lib/auth-store";
import { useMarket } from "@/lib/marketplace";
import { TEMPLATES, type TemplateCategory } from "@/lib/templates";
import { parseBlocks } from "@/lib/blocks";

/** Unified shape for official templates and community listings. */
export type MarketCard = {
  key: string;
  title: string;
  description: string;
  category: TemplateCategory;
  author: string;
  content: string;
  interactive: boolean;
  official: boolean;
  installs: number | null;
  priceCents: number;
  listingId?: string;
  mine?: boolean;
};

const hasEmbed = (content: string) =>
  parseBlocks(content).some((b) => b.type === "embed");

export function useMarketCards(): MarketCard[] {
  const listings = useMarket((s) => s.listings);
  const userId = useAuth((s) => s.user?.id);
  return useMemo(() => {
    const official: MarketCard[] = TEMPLATES.map((t) => ({
      key: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      author: t.author,
      content: t.content,
      interactive: t.interactive,
      official: true,
      installs: null,
      priceCents: 0,
    }));
    const community: MarketCard[] = listings.map((l) => ({
      key: l.id,
      title: l.title,
      description: l.description,
      category: l.category,
      author: l.author,
      content: l.content,
      interactive: hasEmbed(l.content),
      official: false,
      installs: l.installs,
      priceCents: l.priceCents,
      listingId: l.id,
      mine: l.userId === userId,
    }));
    return [...official, ...community];
  }, [listings, userId]);
}
