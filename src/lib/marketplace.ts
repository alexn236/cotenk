import { create } from "zustand";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth-store";
import type { TemplateCategory } from "./templates";

/** A page someone published to the community marketplace. */
export type Listing = {
  id: string;
  userId: string;
  author: string;
  title: string;
  description: string;
  category: TemplateCategory;
  content: string;
  priceCents: number;
  installs: number;
  createdAt: number;
};

type ListingRow = {
  id: string;
  user_id: string;
  author: string;
  title: string;
  description: string;
  category: string;
  content: string;
  price_cents: number;
  installs: number;
  created_at: string;
};

const toListing = (r: ListingRow): Listing => ({
  id: r.id,
  userId: r.user_id,
  author: r.author,
  title: r.title,
  description: r.description,
  category: r.category as TemplateCategory,
  content: r.content,
  priceCents: r.price_cents ?? 0,
  installs: r.installs ?? 0,
  createdAt: Date.parse(r.created_at) || 0,
});

/** "anna.k@x.io" → "anna.k" — a readable default author name. */
export function authorFromEmail(email: string): string {
  return email.split("@")[0] || "Anonymous";
}

export type MarketCategory = TemplateCategory | "All";

type MarketState = {
  category: MarketCategory;
  setCategory: (c: MarketCategory) => void;
  listings: Listing[];
  loading: boolean;
  /** Set when the table is missing or the network failed. */
  error: string | null;
  loaded: boolean;
  fetch: () => Promise<void>;
  publish: (input: {
    title: string;
    description: string;
    category: TemplateCategory;
    content: string;
  }) => Promise<string | null>;
  unpublish: (id: string) => Promise<string | null>;
  /** Fire-and-forget install counter. */
  countInstall: (id: string) => void;
};

let idSeq = 0;

export const useMarket = create<MarketState>((set, get) => ({
  category: "All",
  setCategory: (category) => set({ category }),
  listings: [],
  loading: false,
  error: null,
  loaded: false,

  fetch: async () => {
    if (get().loading) return;
    set({ loading: true });
    const { data, error } = await getSupabase()
      .from("marketplace_listings")
      .select(
        "id, user_id, author, title, description, category, content, price_cents, installs, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      set({
        loading: false,
        loaded: true,
        error:
          "Community listings are unavailable. Apply the marketplace migration in Supabase to enable publishing.",
      });
      return;
    }
    set({
      listings: ((data ?? []) as ListingRow[]).map(toListing),
      loading: false,
      loaded: true,
      error: null,
    });
  },

  publish: async ({ title, description, category, content }) => {
    const user = useAuth.getState().user;
    if (!user) return "Sign in to publish.";
    const id = `lst-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;
    const { error } = await getSupabase()
      .from("marketplace_listings")
      .insert({
        id,
        user_id: user.id,
        author: authorFromEmail(user.email),
        title,
        description,
        category,
        content,
        price_cents: 0,
      });
    if (error) return error.message;
    await get().fetch();
    return null;
  },

  unpublish: async (id) => {
    const { error } = await getSupabase()
      .from("marketplace_listings")
      .delete()
      .eq("id", id);
    if (error) return error.message;
    set((s) => ({ listings: s.listings.filter((l) => l.id !== id) }));
    return null;
  },

  countInstall: (id) => {
    set((s) => ({
      listings: s.listings.map((l) =>
        l.id === id ? { ...l, installs: l.installs + 1 } : l,
      ),
    }));
    void getSupabase()
      .rpc("marketplace_install", { listing_id: id })
      .then(() => {}, () => {});
  },
}));
