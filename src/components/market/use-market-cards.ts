import { useMemo } from "react";
import { TEMPLATES, type TemplateCategory } from "@/lib/templates";
import { useUserTemplates } from "@/lib/user-templates";
import { parseBlocks } from "@/lib/blocks";
import { isHtmlPage } from "@/lib/html-page";

/** A template as the gallery shows it. */
export type MarketCard = {
  key: string;
  title: string;
  description: string;
  category: TemplateCategory;
  author: string;
  content: string;
  interactive: boolean;
  /** Made by you (saved from a page or built with AI) — can be deleted. */
  userTemplateId?: string;
};

const BUILT_IN: MarketCard[] = TEMPLATES.map((t) => ({
  key: t.id,
  title: t.title,
  description: t.description,
  category: t.category,
  author: t.author,
  content: t.content,
  interactive: t.interactive,
}));

const interactive = (content: string) =>
  isHtmlPage(content) || parseBlocks(content).some((b) => b.type === "embed");

/** Your templates first, then the built-in ones. */
export function useMarketCards(): MarketCard[] {
  const mine = useUserTemplates((s) => s.items);
  return useMemo(
    () => [
      ...mine.map((t) => ({
        key: `user-${t.id}`,
        title: t.title,
        description: t.description,
        category: "Personal" as TemplateCategory,
        author: "You",
        content: t.content,
        interactive: interactive(t.content),
        userTemplateId: t.id,
      })),
      ...BUILT_IN,
    ],
    [mine],
  );
}
