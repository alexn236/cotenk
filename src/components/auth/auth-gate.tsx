import { useEffect } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth-store";
import { initSync } from "@/lib/sync";
import { initFileSync } from "@/lib/file-sync";
import { initAgentSync } from "@/lib/agent-store";
import { AuthView } from "./auth-view";

/**
 * Session gate: shows a splash while the session is restored, the auth
 * card when signed out, and the app shell when signed in. Starts the
 * workspace sync for the lifetime of the session.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  // Keyed by id: Supabase emits a fresh user object on every auth event
  // (tab refocus, token refresh). Re-running the sync then re-pulled the
  // workspace and dropped pages that were not uploaded yet.
  const userId = useAuth((s) => s.user?.id ?? null);
  const init = useAuth((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (status !== "signedIn" || !userId) return;
    const stopWorkspace = initSync(userId);
    const stopAgents = initAgentSync(userId);
    const stopFiles = initFileSync();
    return () => {
      stopWorkspace();
      stopAgents();
      stopFiles();
    };
  }, [status, userId]);

  if (status === "loading") return <Splash />;
  if (status !== "signedIn") return <AuthView />;
  return <>{children}</>;
}

function Splash() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-dim"
      >
        <motion.span
          animate={reduceMotion ? undefined : { opacity: [0.5, 1, 0.5] }}
          transition={
            reduceMotion ? undefined : { duration: 1.6, repeat: Infinity }
          }
          className="text-[16px] font-semibold leading-none text-accent"
        >
          C
        </motion.span>
      </motion.div>
    </div>
  );
}
