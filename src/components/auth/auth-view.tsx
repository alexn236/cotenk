import { useState } from "react";
import type { FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth-store";

type Mode = "signin" | "signup";

/**
 * Centered sign-in / sign-up card shown when no session exists.
 * Email + password only; errors and "check your email" notes render inline.
 */
export function AuthView() {
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);
  const reduceMotion = useReducedMotion();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const result =
      mode === "signin"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
    setBusy(false);
    if (result === null) return; // signed in — the gate swaps the view
    if (mode === "signup" && result.startsWith("Account created")) {
      setNote(result);
    } else {
      setError(result);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNote(null);
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-canvas px-4">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[340px]"
      >
        <div className="flex flex-col items-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-dim">
            <span className="text-[16px] font-semibold leading-none text-accent">
              C
            </span>
          </div>
          <h1 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-ink">
            CoTenk
          </h1>
          <p className="mt-1 text-[12.5px] text-ink-3">
            Think together. Work together.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="mt-7 rounded-[14px] border border-line-soft bg-panel p-5"
        >
          <h2 className="text-[14px] font-semibold text-ink">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h2>

          <label className="mt-4 block text-[11.5px] font-medium text-ink-3">
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="you@example.com"
            className="mt-1.5 h-9 w-full rounded-[8px] border border-line bg-panel-2 px-3 text-[13px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 focus:border-accent-line"
          />

          <label className="mt-3.5 block text-[11.5px] font-medium text-ink-3">
            Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder="6+ characters"
            className="mt-1.5 h-9 w-full rounded-[8px] border border-line bg-panel-2 px-3 text-[13px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 focus:border-accent-line"
          />

          {error && (
            <p className="mt-3 text-[12px] leading-snug text-danger">
              {error}
            </p>
          )}
          {note && (
            <p className="mt-3 text-[12px] leading-snug text-accent-2">
              {note}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 h-9 w-full rounded-[8px] bg-accent text-[13px] font-medium text-on-accent transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? mode === "signin"
                ? "Signing in…"
                : "Creating account…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-[12px] text-ink-3">
          {mode === "signin" ? "New here? " : "Have an account? "}
          <button
            type="button"
            onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
            className="text-accent-2 transition-colors duration-150 hover:text-accent"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
