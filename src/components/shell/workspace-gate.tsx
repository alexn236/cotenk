import { useEffect, useState, type ReactNode } from "react";
import { useWorkspace } from "@/lib/store";
import { initFileSync } from "@/lib/file-sync";
import { initHistory } from "@/lib/history";
import { saveLocalWorkspace } from "@/lib/local-workspace";
import { finishWelcome, welcomeFinished } from "@/lib/onboarding";
import { WelcomeFlow } from "@/components/onboarding/welcome-flow";

/**
 * Keeps the workspace on this device: every change is cached in the
 * browser, mirrored to the workspace folder on desktop and recorded in
 * the local version history. A first run shows the welcome flow
 * (theme, agents) before the app opens.
 */
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const [fresh, setFresh] = useState(() => !welcomeFinished());

  useEffect(() => {
    const stopFiles = initFileSync();
    const stopHistory = initHistory();
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
      stopHistory();
    };
  }, []);

  if (fresh) {
    return (
      <WelcomeFlow
        onDone={() => {
          finishWelcome();
          setFresh(false);
        }}
      />
    );
  }
  return <>{children}</>;
}
