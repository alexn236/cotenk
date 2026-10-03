import { create } from "zustand";
import type { TemplateCategory } from "./templates";

/** "Yours" shows the templates you saved or built. */
export type MarketCategory = TemplateCategory | "All" | "Yours";

type MarketState = {
  category: MarketCategory;
  setCategory: (c: MarketCategory) => void;
};

/** Template gallery filters. */
export const useMarket = create<MarketState>((set) => ({
  category: "All",
  setCategory: (category) => set({ category }),
}));
