import { useEffect } from "react";
import { useWorkspace } from "@/lib/store";
import { AuthGate } from "@/components/auth/auth-gate";
import { IconRail } from "@/components/shell/icon-rail";
import { Sidebar } from "@/components/shell/sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { DocEditor } from "@/components/editor/doc-editor";
import { HomeView } from "@/components/home/home-view";
import { TasksView } from "@/components/tasks/tasks-view";
import { SettingsView } from "@/components/settings/settings-view";
import { AgentsView } from "@/components/agents/agents-view";
import { AgentActivity } from "@/components/agents/agent-activity";
import { MarketView } from "@/components/market/market-view";
import { PublishDialog } from "@/components/market/publish-dialog";
import { Toaster } from "@/components/ui/toaster";

/** App-wide shortcuts: Ctrl/⌘+K search, Ctrl/⌘+\ sidebar. */
function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const ws = useWorkspace.getState();
      if (k === "k") {
        e.preventDefault();
        ws.setPaletteOpen(!ws.paletteOpen);
      } else if (k === "\\") {
        e.preventDefault();
        ws.toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export default function App() {
  const railSection = useWorkspace((s) => s.railSection);
  const publishDoc = useWorkspace(
    (s) => s.docs.find((d) => d.id === s.publishDocId) ?? null,
  );
  const setPublishDocId = useWorkspace((s) => s.setPublishDocId);
  useGlobalShortcuts();

  return (
    <AuthGate>
      <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
        <IconRail />
        <Sidebar />
        {railSection === "home" ? (
          <HomeView />
        ) : railSection === "tasks" ? (
          <TasksView />
        ) : railSection === "settings" ? (
          <SettingsView />
        ) : railSection === "agents" ? (
          <AgentsView />
        ) : railSection === "market" ? (
          <MarketView />
        ) : (
          <DocEditor />
        )}
      </div>
      <CommandPalette />
      <PublishDialog doc={publishDoc} onClose={() => setPublishDocId(null)} />
      <AgentActivity />
      <Toaster />
    </AuthGate>
  );
}
