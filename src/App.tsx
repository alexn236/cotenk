import { lazy, Suspense, useEffect } from "react";
import { useWorkspace } from "@/lib/store";
import { startNotifications } from "@/lib/notifications";
import { AuthGate } from "@/components/auth/auth-gate";
import { IconRail } from "@/components/shell/icon-rail";
import { Sidebar } from "@/components/shell/sidebar";
import { CommandPalette } from "@/components/shell/command-palette";
import { DocEditor } from "@/components/editor/doc-editor";
import { AgentActivity } from "@/components/agents/agent-activity";
import { Toaster } from "@/components/ui/toaster";
import { lazyView, ViewBoundary } from "@/components/ui/view-boundary";
import { ImportLayer } from "@/components/import/import-layer";
import { PermissionDialog } from "@/components/agents/permission-dialog";
import { AgentSetupGuide } from "@/components/agents/agent-setup-guide";
import { AgentOnboarding } from "@/components/agents/agent-onboarding";

// Views other than the editor load on first visit (code-split). A chunk
// that fails to load is retried and the view is fenced by an error
// boundary, so a failure never blanks the whole window.
const HomeView = lazyView(() =>
  import("@/components/home/home-view").then((m) => m.HomeView),
);
const TasksView = lazyView(() =>
  import("@/components/tasks/tasks-view").then((m) => m.TasksView),
);
const SettingsView = lazyView(() =>
  import("@/components/settings/settings-view").then((m) => m.SettingsView),
);
const AgentsView = lazyView(() =>
  import("@/components/agents/agents-view").then((m) => m.AgentsView),
);
const MarketView = lazyView(() =>
  import("@/components/market/market-view").then((m) => m.MarketView),
);
const HistoryDialog = lazy(() =>
  import("@/components/shell/history-dialog").then((m) => ({
    default: m.HistoryDialog,
  })),
);
const PublishDialog = lazy(() =>
  import("@/components/market/publish-dialog").then((m) => ({
    default: m.PublishDialog,
  })),
);

/** Blank canvas while a view's chunk loads (usually a few ms). */
function ViewFallback() {
  return <div className="h-dvh min-w-0 flex-1 bg-canvas" />;
}

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
  const setRailSection = useWorkspace((s) => s.setRailSection);
  const historyDocId = useWorkspace((s) => s.historyDocId);
  const setHistoryDocId = useWorkspace((s) => s.setHistoryDocId);
  const goHome = () => setRailSection("docs");
  useGlobalShortcuts();
  useEffect(() => startNotifications(), []);

  return (
    <AuthGate>
      <ViewBoundary onHome={goHome}>
        <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
          <IconRail />
          <Sidebar />
          {/* keyed per view: switching views resets a crashed one */}
          <ViewBoundary key={railSection} onHome={goHome}>
            <Suspense fallback={<ViewFallback />}>
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
            </Suspense>
          </ViewBoundary>
        </div>
      </ViewBoundary>
      <CommandPalette />
      {publishDoc && (
        <Suspense fallback={null}>
          <PublishDialog doc={publishDoc} onClose={() => setPublishDocId(null)} />
        </Suspense>
      )}
      {historyDocId && (
        <Suspense fallback={null}>
          <HistoryDialog
            key={historyDocId}
            docId={historyDocId}
            onClose={() => setHistoryDocId(null)}
          />
        </Suspense>
      )}
      <AgentActivity />
      <ImportLayer />
      <PermissionDialog />
      <AgentSetupGuide />
      <AgentOnboarding />
      <Toaster />
    </AuthGate>
  );
}
