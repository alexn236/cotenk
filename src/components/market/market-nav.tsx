import { motion } from "motion/react";
import {
  Compass,
  Sparkle,
  SquaresFour,
  UserCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useWorkspace, type MarketTab } from "@/lib/store";
import { useMarket, type MarketCategory } from "@/lib/marketplace";
import { TEMPLATE_CATEGORIES } from "@/lib/templates";
import { useMarketCards } from "./use-market-cards";

const TABS: { id: MarketTab; label: string; Icon: Icon }[] = [
  { id: "discover", label: "Discover", Icon: Compass },
  { id: "mine", label: "My listings", Icon: UserCircle },
  { id: "build", label: "Build with AI", Icon: Sparkle },
];

const SECTION_LABEL =
  "px-2 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3";
const INDICATOR =
  "absolute inset-y-0 left-0 my-auto h-3.5 w-[2px] rounded-full bg-accent";

/** Sidebar for the marketplace: tabs plus category filters. */
export function MarketNav() {
  const tab = useWorkspace((s) => s.marketTab);
  const setTab = useWorkspace((s) => s.setMarketTab);
  const category = useMarket((s) => s.category);
  const setCategory = useMarket((s) => s.setCategory);
  const cards = useMarketCards();

  const count = (c: MarketCategory) =>
    c === "All" ? cards.length : cards.filter((x) => x.category === c).length;

  const row = (active: boolean) =>
    `relative flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[13px] transition-colors duration-150 ${
      active ? "bg-elev text-ink" : "text-ink-2 hover:bg-hover"
    }`;

  return (
    <div>
      <section>
        <div className={SECTION_LABEL}>Marketplace</div>
        {TABS.map(({ id, label, Icon: TabIcon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={row(tab === id)}
          >
            {tab === id && (
              <motion.span
                layoutId="marketnav-active"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className={INDICATOR}
              />
            )}
            <TabIcon size={15} className="shrink-0 text-ink-3" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </section>

      {tab === "discover" && (
        <section className="mt-3">
          <div className={SECTION_LABEL}>Categories</div>
          {(["All", ...TEMPLATE_CATEGORIES] as MarketCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={row(category === c)}
            >
              <SquaresFour size={15} className="shrink-0 text-ink-3" />
              <span className="flex-1 truncate text-left">{c}</span>
              <span className="font-mono text-[11px] text-ink-3">
                {count(c)}
              </span>
            </button>
          ))}
        </section>
      )}

      <p className="mt-4 px-2 text-[11.5px] leading-relaxed text-ink-3">
        Publish any page from its ⋯ menu. Paid listings are coming soon.
      </p>
    </div>
  );
}
