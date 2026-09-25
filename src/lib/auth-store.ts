import { create } from "zustand";
import { getSupabase } from "./supabase";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export type AuthUser = {
  id: string;
  email: string;
};

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  /** One-shot bootstrap: restore session, then keep it in sync. */
  init: () => void;
  /** Returns an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  /**
   * Returns null on success (signed in) or a message to show —
   * e.g. "check your email" when confirmation is required.
   */
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

let initialized = false;

const toUser = (u: { id: string; email?: string } | null): AuthUser | null =>
  u ? { id: u.id, email: u.email ?? "" } : null;

export const useAuth = create<AuthState>((set) => ({
  status: "loading",
  user: null,

  init: () => {
    if (initialized || typeof window === "undefined") return;
    initialized = true;
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      const user = toUser(data.session?.user ?? null);
      set({ status: user ? "signedIn" : "signedOut", user });
    });
    sb.auth.onAuthStateChange((_event, session) => {
      const user = toUser(session?.user ?? null);
      set({ status: user ? "signedIn" : "signedOut", user });
    });
  },

  signIn: async (email, password) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });
    return error?.message ?? null;
  },

  signUp: async (email, password) => {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
    });
    if (error) return error.message;
    if (!data.session) {
      return "Account created. Check your email to confirm, then sign in.";
    }
    return null;
  },

  signOut: async () => {
    await getSupabase().auth.signOut();
  },
}));
