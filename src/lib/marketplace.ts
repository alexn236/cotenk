import { create } from "zustand";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth-store";
import { track } from "./analytics";
import { newId } from "./ids";
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
    /** Display name shown on the listing (never the email). */
    author: string;
    title: string;
    description: string;
    category: TemplateCategory;
    content: string;
  }) => Promise<string | null>;
  unpublish: (id: string) => Promise<string | null>;
  /** Forgets loaded listings so the next view refetches (auth change). */
  reset: () => void;
  /** Fire-and-forget install counter. */
  countInstall: (id: string) => void;
};


export const useMarket = create<MarketState>((set, get) => ({
  category: "All",
  setCategory: (category) => set({ category }),
  listings: [],
  loading: false,
  error: null,
  loaded: false,

  fetch: async () => {
    if (get().loading) return;
    // Listings are public (migration 20260927_marketplace_public_read);
    // signing in is only needed to publish.
    let sb;
    try {
      sb = getSupabase();
    } catch {
      set({
        listings: [],
        loaded: true,
        error: "Community pages need a connection to the CoTenk service.",
      });
      return;
    }
    set({ loading: true });
    const { data, error } = await sb
      .from("marketplace_listings")
      .select(
        "id, user_id, author, title, description, category, content, price_cents, installs, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      const signedOut = !useAuth.getState().user;
      set({
        loading: false,
        loaded: true,
        error: signedOut
          ? "Sign in to browse community pages and publish your own."
          : "Community listings are unavailable. Apply the marketplace migration in Supabase to enable publishing.",
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

  publish: async ({ author, title, description, category, content }) => {
    const user = useAuth.getState().user;
    if (!user) return "Sign in to publish.";
    if (!author.trim()) return "Add the name to publish under.";
    const id = newId();
    const { error } = await getSupabase()
      .from("marketplace_listings")
      .insert({
        id,
        user_id: user.id,
        author: author.trim().slice(0, 60),
        title,
        description,
        category,
        content,
        price_cents: 0,
      });
    if (error) return error.message;
    track("page_published", { category });
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

  reset: () => set({ listings: [], loaded: false, error: null }),

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
