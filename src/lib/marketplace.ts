import { create } from "zustand";
import type { TemplateCategory } from "./templates";

export type MarketCategory = TemplateCategory | "All";

type MarketState = {
  category: MarketCategory;
  setCategory: (c: MarketCategory) => void;
};

/** Template gallery filters. */
export const useMarket = create<MarketState>((set) => ({
  category: "All",
  setCategory: (category) => set({ category }),
}));
