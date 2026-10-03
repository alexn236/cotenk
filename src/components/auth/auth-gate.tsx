import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth-store";
import { useWorkspace } from "@/lib/store";
import { initSync } from "@/lib/sync";
import { initFileSync } from "@/lib/file-sync";
import { initAgentSync, useAgent } from "@/lib/agent-store";
import { initExtensionSync } from "@/lib/extensions";
import { maybeAutoCleanup } from "@/lib/data-tools";
import { killAllAgents } from "@/lib/agent/acp-client";
import { seedDocs, seedFolders } from "@/lib/mock-docs";
import { upgradeWelcome, WELCOME_ID } from "@/lib/welcome";
import {
  loadLocalWorkspace,
  saveLocalWorkspace,
} from "@/lib/local-workspace";
import { mergeOffer, type MergeOffer } from "@/lib/local-merge";
import { isDesktop, setWorkspaceScope } from "@/lib/workspace";
import { toast } from "@/lib/toast";
import { finishWelcome, welcomeFinished } from "@/lib/onboarding";
import { SignInDialog } from "./auth-view";
import { WelcomeFlow } from "./welcome-flow";
import { MergeDialog } from "./merge-dialog";

/** Empty agent state — chats belong to one account (or the device). */
const resetAgents = () => {
  useAgent.setState({
    chats: [],
    projects: [],
    activeChatId: null,
    hydrated: false,
  });
  // Agents run inside the previous workspace folder — the next turn
  // starts them in the new one.
  if (isDesktop()) void killAllAgents();
};

/** Shows the device's own pages (signed out). */
function showLocalWorkspace() {
  const local = loadLocalWorkspace();
  const docs = local ? upgradeWelcome(local.docs) : seedDocs;
  useWorkspace.setState({
    docs,
    folders: local?.folders ?? seedFolders,
    activeDocId:
      docs.find((d) => d.id === WELCOME_ID)?.id ?? docs[0]?.id ?? null,
    syncStatus: "idle",
  });
}

/**
 * Session gate: shows a splash while the session is restored, then the
 * welcome flow until someone is signed in — CoTenk needs an account.
 * A first run walks through the whole flow (theme, account, agents)
 * before the app opens; later sign-ins go straight in.
 *
 * Signed in, the account's workspace is loaded from Supabase and
 * mirrored to the account's own folder. Pages from the device's older
 * local workspace only move into an account when the user says so
 * (merge dialog after the first pull).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  // Keyed by id: Supabase emits a fresh user object on every auth event
  // (tab refocus, token refresh). Re-running the sync then re-pulled the
  // workspace and dropped pages that were not uploaded yet.
  const userId = useAuth((s) => s.user?.id ?? null);
  const workspaceId = useAuth((s) => s.workspaceId);
  const accountStatus = useAuth((s) => s.accountStatus);
  const accountError = useAuth((s) => s.accountError);
  const init = useAuth((s) => s.init);
  const loadAccount = useAuth((s) => s.loadAccount);
  const wasSignedIn = useRef(false);
  const [offer, setOffer] = useState<MergeOffer | null>(null);
  // First run on this device: the flow stays up after signing in until
  // its last step (agents / all set) is through.
  const [fresh, setFresh] = useState(() => !welcomeFinished());

  useEffect(() => {
    init();
  }, [init]);

  // Which workspace is on screen: the device's or the account's.
  useEffect(() => {
    if (status === "loading") return;
    if (status === "signedIn" && userId) {
      const email = useAuth.getState().user?.email ?? "";
      wasSignedIn.current = true;
      setWorkspaceScope(userId, email.split("@")[0] ?? "");
      useWorkspace.setState({
        docs: [],
        folders: [],
        activeDocId: null,
        syncStatus: "syncing",
      });
      resetAgents();
      void loadAccount();
      // Chats and skills/MCP servers don't depend on the workspace —
      // they sync per user.
      const stopChats = initAgentSync(userId);
      const stopExtensions = initExtensionSync(userId);
      return () => {
        stopChats();
        stopExtensions();
      };
    }

    setWorkspaceScope("local");
    if (wasSignedIn.current) {
      wasSignedIn.current = false;
      showLocalWorkspace();
      resetAgents();
      setOffer(null);
    }
    const stopFiles = initFileSync();
    const save = () => {
      const { docs, folders } = useWorkspace.getState();
      saveLocalWorkspace({ docs, folders });
    };
    save();
    const unsub = useWorkspace.subscribe((s, prev) => {
      if (s.docs !== prev.docs || s.folders !== prev.folders) save();
    });
    return () => {
      unsub();
      stopFiles();
    };
  }, [status, userId, loadAccount]);

  // The account's workspace: Supabase sync plus the folder mirror, which
  // starts only after the first pull landed.
  useEffect(() => {
    if (status !== "signedIn" || !userId || !workspaceId) return;
    const stopWorkspace = initSync(workspaceId);
    const stopFiles = initFileSync({ afterPull: true });
    // After the first pull: offer the device's pages once.
    let offered = false;
    const unsub = useWorkspace.subscribe((s) => {
      if (offered || s.syncStatus !== "synced") return;
      offered = true;
      setOffer(mergeOffer(userId));
      void maybeAutoCleanup();
    });
    return () => {
      unsub();
      stopWorkspace();
      stopFiles();
    };
  }, [status, userId, workspaceId]);

  // Profile/workspace couldn't load (offline, migration missing).
  useEffect(() => {
    if (accountStatus !== "error") return;
    useWorkspace.setState({ syncStatus: "error" });
    if (accountError) {
      toast(accountError, {
        tone: "error",
        ttlMs: 10_000,
        action: { label: "Retry", run: () => void loadAccount() },
      });
    }
    const onOnline = () => void loadAccount();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [accountStatus, accountError, loadAccount]);

  if (status === "loading") return <Splash />;
  if (status === "signedOut" || fresh) {
    return (
      <WelcomeFlow
        fresh={fresh}
        onDone={() => {
          finishWelcome();
          setFresh(false);
        }}
      />
    );
  }
  return (
    <>
      {children}
      <SignInDialog />
      {offer && userId && (
        <MergeDialog
          offer={offer}
          userId={userId}
          onClose={() => setOffer(null)}
        />
      )}
    </>
  );
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
