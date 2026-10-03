import { create } from "zustand";
import { getSupabase } from "./supabase";
import { flushWorkspaceSync } from "./sync";
import { flushAgentSync } from "./agent-store";
import { identify, resetIdentity } from "./analytics";
import { isDesktop } from "./workspace";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export type AuthUser = {
  id: string;
  email: string;
};

/** Profile + personal workspace of the signed-in account. */
export type AccountStatus = "idle" | "loading" | "ready" | "error";

/**
 * Sign-in dialog screens. "recovery" sets a new password after a reset
 * link or code signed the user in.
 */
export type DialogMode = "signin" | "signup" | "reset" | "recovery";

export const AUTH_TITLES: Record<DialogMode, string> = {
  signin: "Sign in",
  signup: "Create account",
  reset: "Reset password",
  recovery: "Set a new password",
};

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  /** Sign-in dialog: open flag plus an optional line explaining why. */
  dialogOpen: boolean;
  dialogReason: string | null;
  dialogMode: DialogMode;
  /** Name shown to other people (marketplace, shared workspaces). */
  displayName: string;
  /** The account's personal workspace — docs/folders are keyed by it. */
  workspaceId: string | null;
  accountStatus: AccountStatus;
  accountError: string | null;
  /** One-shot bootstrap: restore session, then keep it in sync. */
  init: () => void;
  /** Returns an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  /**
   * Returns null on success (signed in) or a message to show —
   * e.g. "check your email" when confirmation is required.
   */
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Sends the reset email (link + one-time code). Error or null. */
  requestPasswordReset: (email: string) => Promise<string | null>;
  /** Signs in with the code from the reset email. Error or null. */
  verifyResetCode: (email: string, code: string) => Promise<string | null>;
  /** Sets a new password for the signed-in user. Error or null. */
  updatePassword: (password: string) => Promise<string | null>;
  /** Loads profile + personal workspace for the signed-in user. */
  loadAccount: () => Promise<void>;
  /** Saves the display name. Error or null. */
  setDisplayName: (name: string) => Promise<string | null>;
  openDialog: (reason?: string, mode?: DialogMode) => void;
  setDialogMode: (mode: DialogMode) => void;
  closeDialog: () => void;
};

let initialized = false;

const toUser = (u: { id: string; email?: string } | null): AuthUser | null =>
  u ? { id: u.id, email: u.email ?? "" } : null;

const signedOutAccount = {
  displayName: "",
  workspaceId: null,
  accountStatus: "idle" as AccountStatus,
  accountError: null,
};

export const MISSING_MIGRATION_MESSAGE =
  "The database is missing the workspaces migration (20260928_workspaces_profiles.sql).";

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  dialogOpen: false,
  dialogReason: null,
  dialogMode: "signin",
  ...signedOutAccount,

  init: () => {
    if (initialized || typeof window === "undefined") return;
    initialized = true;
    let sb;
    try {
      sb = getSupabase();
    } catch {
      // No Supabase configured — the app runs purely local.
      set({ status: "signedOut", user: null });
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      const user = toUser(data.session?.user ?? null);
      if (user) identify(user.id, "session");
      set({ status: user ? "signedIn" : "signedOut", user });
    });
    sb.auth.onAuthStateChange((event, session) => {
      const user = toUser(session?.user ?? null);
      // Only a real sign-in counts — token refreshes re-emit SIGNED_IN.
      if (user && get().status === "signedOut") identify(user.id, "sign_in");
      if (!user) resetIdentity();
      // A reset link (web) signs in with a recovery session: ask for the
      // new password right away instead of dropping into the app.
      const recovery = event === "PASSWORD_RECOVERY";
      set((s) => {
        const keepOpen = recovery || (!!user && s.dialogMode === "recovery");
        return {
          status: user ? "signedIn" : "signedOut",
          user,
          // A successful sign-in closes the dialog wherever it was opened.
          dialogOpen: user ? keepOpen : s.dialogOpen,
          dialogReason: user ? null : s.dialogReason,
          dialogMode: recovery ? "recovery" : s.dialogMode,
          ...(user ? {} : signedOutAccount),
        };
      });
    });
  },

  signIn: async (email, password) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    });
    return error?.message ?? null;
  },

  signUp: async (email, password, displayName) => {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      // Picked up by the sign-up trigger (profiles.display_name).
      options: { data: { display_name: displayName.trim().slice(0, 60) } },
    });
    if (error) return error.message;
    if (!data.session) {
      return "Account created. Check your email to confirm, then sign in.";
    }
    return null;
  },

  signOut: async () => {
    // Push edits still inside the debounce window first — the session
    // (and with it the sync) ends with the sign-out.
    await Promise.all([flushWorkspaceSync(), flushAgentSync()]).catch(
      () => {},
    );
    await getSupabase().auth.signOut();
  },

  requestPasswordReset: async (email) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      // The link only works where the web app runs; the desktop app
      // uses the code from the same email instead.
      redirectTo: isDesktop() ? undefined : window.location.origin,
    });
    return error?.message ?? null;
  },

  verifyResetCode: async (email, code) => {
    // Switch first so the SIGNED_IN event keeps the dialog open.
    set({ dialogMode: "recovery" });
    const { error } = await getSupabase().auth.verifyOtp({
      email,
      token: code.trim(),
      type: "recovery",
    });
    if (error) {
      set({ dialogMode: "reset" });
      return error.message;
    }
    return null;
  },

  updatePassword: async (password) => {
    const { error } = await getSupabase().auth.updateUser({ password });
    if (error) return error.message;
    set({ dialogOpen: false, dialogMode: "signin", dialogReason: null });
    return null;
  },

  loadAccount: async () => {
    const user = get().user;
    if (!user) return;
    set({ accountStatus: "loading", accountError: null });
    const sb = getSupabase();
    const [ws, profile] = await Promise.all([
      sb.rpc("ensure_personal_workspace"),
      sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);
    // Signed out (or switched account) while this was in flight.
    if (get().user?.id !== user.id) return;
    if (ws.error || typeof ws.data !== "string") {
      const msg = ws.error?.message ?? "";
      set({
        accountStatus: "error",
        accountError: /ensure_personal_workspace|schema cache|does not exist/i.test(
          msg,
        )
          ? MISSING_MIGRATION_MESSAGE
          : msg || "Could not load your workspace.",
      });
      return;
    }
    set({
      workspaceId: ws.data,
      displayName:
        (profile.data?.display_name as string | undefined)?.trim() ?? "",
      accountStatus: "ready",
      accountError: null,
    });
  },

  setDisplayName: async (name) => {
    const user = get().user;
    if (!user) return "Sign in first.";
    const displayName = name.trim().slice(0, 60);
    const { error } = await getSupabase().from("profiles").upsert({
      id: user.id,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    });
    if (error) return error.message;
    set({ displayName });
    return null;
  },

  openDialog: (reason, mode = "signin") =>
    set({ dialogOpen: true, dialogReason: reason ?? null, dialogMode: mode }),
  setDialogMode: (mode) => set({ dialogMode: mode }),
  closeDialog: () =>
    set({ dialogOpen: false, dialogReason: null, dialogMode: "signin" }),
}));

/** Opens the sign-in dialog; `reason` is shown above the form. */
export function requestSignIn(reason?: string) {
  useAuth.getState().openDialog(reason);
}
