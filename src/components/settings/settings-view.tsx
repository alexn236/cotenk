import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle,
  FolderOpen,
  Key,
  Lightning,
  type Icon,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
import { useAgent } from "@/lib/agent-store";
import { useAgentSetup } from "@/lib/agent-setup";
import { acpClient, killAllAgents } from "@/lib/agent/acp-client";
import { AGENT_KINDS, AGENTS, type AgentKind } from "@/lib/agents";
import {
  apiKeyOverride,
  DESKTOP_ONLY_MESSAGE,
  isDesktop,
  resolveWorkspaceDir,
  storeApiKeyOverride,
  storeWorkspaceDir,
} from "@/lib/workspace";

/* ---------- shared primitives ---------- */

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {sub && <p className="mt-1 text-[12.5px] text-ink-3">{sub}</p>}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-line-soft rounded-[10px] border border-line-soft bg-panel">
      {children}
    </div>
  );
}

function Row({
  icon: RowIcon,
  label,
  desc,
  children,
}: {
  icon?: Icon;
  label: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {RowIcon && <RowIcon size={16} className="shrink-0 text-ink-3" />}
        <div className="min-w-0">
          <div className="text-[13px] text-ink">{label}</div>
          {desc && <div className="mt-0.5 text-[12px] text-ink-3">{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-ink-3">
      {children}
    </span>
  );
}

/* ---------- appearance ---------- */

function ThemeCard({
  value,
  label,
  sub,
  canvas,
  panel,
  accent,
}: {
  value: "dark" | "light";
  label: string;
  sub: string;
  canvas: string;
  panel: string;
  accent: string;
}) {
  const active = useWorkspace((s) => s.theme === value);
  const setTheme = useWorkspace((s) => s.setTheme);

  return (
    <button
      type="button"
      onClick={() => setTheme(value)}
      aria-pressed={active}
      className={`relative cursor-pointer rounded-[10px] border p-3 text-left transition-colors duration-150 ${
        active
          ? "border-accent bg-accent-dim"
          : "border-line bg-panel hover:bg-panel-2"
      }`}
    >
      {active && (
        <CheckCircle
          size={15}
          className="absolute right-3 top-3 text-accent"
        />
      )}
      {/* mini theme swatch: real palette hexes, intentionally not tokens */}
      <div
        className="h-16 overflow-hidden rounded-[8px] border border-line"
        style={{ backgroundColor: canvas }}
      >
        <div className="flex h-full flex-col gap-1.5 p-2.5">
          <div
            className="h-2 w-1/2 rounded-full"
            style={{ backgroundColor: panel }}
          />
          <div
            className="h-2 w-2/3 rounded-full"
            style={{ backgroundColor: panel }}
          />
          <div
            className="mt-auto h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: accent }}
          />
        </div>
      </div>
      <div className="mt-2.5 text-[12.5px] text-ink-2">{label}</div>
      <div className="text-[11px] text-ink-3">{sub}</div>
    </button>
  );
}

function AppearanceSection() {
  return (
    <section>
      <SectionTitle title="Appearance" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ThemeCard
          value="dark"
          label="Dark"
          sub="Warm charcoal"
          canvas="#131211"
          panel="#1c1a18"
          accent="#e2a05c"
        />
        <ThemeCard
          value="light"
          label="Light"
          sub="Warm bone"
          canvas="#f4f2ea"
          panel="#ffffff"
          accent="#a8641c"
        />
      </div>
      <p className="mt-3 text-[11.5px] text-ink-3">Synced to this device</p>
    </section>
  );
}

/* ---------- account ---------- */

function AccountSection() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const email = user?.email ?? "";
  const initial = (email[0] ?? "?").toUpperCase();

  return (
    <section>
      <SectionTitle title="Account" />
      <Card>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-elev">
              <span className="text-[13px] font-medium leading-none text-ink-2">
                {initial}
              </span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] text-ink">{email}</div>
              <div className="text-[12px] text-ink-3">Supabase account</div>
            </div>
          </div>
          <Badge>Signed in</Badge>
        </div>
        <Row
          label="Sign out"
          desc="Ends the session on this device. Docs stay synced."
        >
          <button
            type="button"
            onClick={() => void signOut()}
            className="h-7 shrink-0 rounded-[6px] border border-line bg-panel-2 px-2.5 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink active:scale-[0.98]"
          >
            Sign out
          </button>
        </Row>
      </Card>
    </section>
  );
}

/* ---------- sync ---------- */

function SyncSection() {
  const docs = useWorkspace((s) => s.docs);
  const folders = useWorkspace((s) => s.folders);
  const syncStatus = useWorkspace((s) => s.syncStatus);

  const statusDot =
    syncStatus === "synced"
      ? "bg-emerald-500/70"
      : syncStatus === "syncing"
        ? "animate-pulse bg-accent"
        : syncStatus === "error"
          ? "bg-danger"
          : "bg-ink-3";
  const statusLabel =
    syncStatus === "synced"
      ? "Synced"
      : syncStatus === "syncing"
        ? "Syncing"
        : syncStatus === "error"
          ? "Sync error"
          : "Idle";

  return (
    <section>
      <SectionTitle title="Sync" />
      <Card>
        <Row label="Status">
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
            {statusLabel}
          </span>
        </Row>
        <Row label="Provider">
          <span className="text-[12px] text-ink-2">Supabase</span>
        </Row>
        <Row label="Documents">
          <span className="font-mono text-[12px] text-ink-2">
            {docs.length} docs · {folders.length} folders
          </span>
        </Row>
      </Card>
      <div className="mt-3 rounded-[10px] border border-dashed border-line bg-transparent px-4 py-3 text-[12px] text-ink-3">
        Every change debounces into Supabase and pulls back on any other
        device when you sign in.
      </div>
    </section>
  );
}

/* ---------- agents ---------- */

function SmallButton({
  children,
  onClick,
  accent,
}: {
  children: ReactNode;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
        accent
          ? "bg-accent text-on-accent hover:opacity-90"
          : "border border-line bg-panel-2 text-ink-2 hover:bg-line"
      }`}
    >
      {children}
    </button>
  );
}

function AgentCard({ kind }: { kind: AgentKind }) {
  const status = useAgent((s) => s.status);
  const runningChatId = useAgent((s) => s.runningChatId);
  const runningAgent = useAgent(
    (s) => s.chats.find((c) => c.id === s.runningChatId)?.agent ?? null,
  );
  const defaultAgent = useAgent((s) => s.defaultAgent);
  const setDefaultAgent = useAgent((s) => s.setDefaultAgent);
  const setup = useAgentSetup((s) => s.setup[kind]);
  const check = useAgentSetup((s) => s.check);
  const connect = useAgentSetup((s) => s.connect);
  const connecting = useAgentSetup((s) => s.connecting);
  const [keyDraft, setKeyDraft] = useState(apiKeyOverride() ?? "");

  useEffect(() => {
    void check(kind);
  }, [check, kind]);

  const info = AGENTS[kind];
  const ready = !!setup?.installed && !!setup.authed;
  const isRunning =
    (status === "running" || status === "starting") &&
    !!runningChatId &&
    runningAgent === kind;

  return (
    <Card>
      <Row
        icon={Lightning}
        label={
          <span className="flex items-center gap-2">
            {info.name}
            {defaultAgent === kind && <Badge>Default</Badge>}
          </span>
        }
        desc={setup ? setup.detail : "Checking…"}
      >
        <div className="flex items-center gap-2">
          {setup?.installed && !setup.authed ? (
            <SmallButton accent onClick={() => void connect(kind)}>
              {connecting === kind ? "Waiting for sign-in…" : "Connect"}
            </SmallButton>
          ) : (
            <Badge>
              {isRunning
                ? "Running"
                : ready
                  ? "Connected"
                  : setup
                    ? "Not installed"
                    : "…"}
            </Badge>
          )}
          {defaultAgent !== kind && (
            <SmallButton onClick={() => setDefaultAgent(kind)}>
              Make default
            </SmallButton>
          )}
        </div>
      </Row>
      {setup?.hint && (
        <div className="px-4 py-2.5 text-[12px] leading-relaxed text-ink-3">
          {setup.hint}{" "}
          <button
            type="button"
            onClick={() => void check(kind)}
            className="text-accent hover:underline"
          >
            Check again
          </button>
        </div>
      )}
      {kind === "devin" && (
        <Row
          icon={Key}
          label="API key"
          desc="Optional — overrides the CLI credentials file."
        >
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={apiKeyOverride() ? "key saved" : "paste key"}
              className="w-44 rounded-[7px] border border-line bg-panel-2 px-2 py-1 font-mono text-[11.5px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
            />
            <SmallButton
              onClick={() => {
                storeApiKeyOverride(keyDraft || null);
                void acpClient("devin").kill();
                void check("devin");
              }}
            >
              Save
            </SmallButton>
          </div>
        </Row>
      )}
    </Card>
  );
}

function AgentsSection() {
  const chats = useAgent((s) => s.chats);
  const [dir, setDir] = useState<string | null>(null);

  useEffect(() => {
    resolveWorkspaceDir().then(setDir).catch(() => {});
  }, []);

  const pickDir = async () => {
    const chosen = await openDialog({
      directory: true,
      defaultPath: dir ?? undefined,
      title: "Choose the CoTenk workspace folder",
    });
    if (typeof chosen === "string" && chosen) {
      storeWorkspaceDir(chosen);
      setDir(chosen);
      await killAllAgents(); // next turn spawns in the new folder
    }
  };

  return (
    <section>
      <SectionTitle
        title="Agents"
        sub="Agents run locally on your machine via ACP, inside your workspace folder. Each chat talks to one agent; the default is used for Ask agent, tasks and Build with AI."
      />
      <div className="flex flex-col gap-3">
        {AGENT_KINDS.map((k) => (
          <AgentCard key={k} kind={k} />
        ))}
      </div>

      <div className="mt-5">
        <Card>
          <Row
            icon={FolderOpen}
            label="Workspace folder"
            desc={
              dir
                ? `${dir} — agents read and write here`
                : "Resolving…"
            }
          >
            <div className="flex items-center gap-2">
              <SmallButton onClick={() => void pickDir()}>Change…</SmallButton>
              {dir && (
                <SmallButton
                  onClick={() => void invoke("open_folder", { path: dir })}
                >
                  Open
                </SmallButton>
              )}
            </div>
          </Row>
          <Row label="Chats">
            <span className="font-mono text-[12px] text-ink-2">
              {chats.length} chats
            </span>
          </Row>
        </Card>
      </div>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-3">
        docs sync into this folder as .md files · agents edit them on disk
        and changes flow back to supabase · edits are auto-approved · agents
        get a workspace guide in .claude/skills/cotenk-workspace
      </p>

      <div className="mt-8">
        <SectionTitle
          title="Open ecosystem"
          sub="CoTenk speaks ACP — any compatible agent can join the workspace."
        />
        <Card>
          {ECOSYSTEM.map((a) => (
            <Row key={a.name} label={a.name} desc={a.desc}>
              <Badge>{a.state}</Badge>
            </Row>
          ))}
        </Card>
      </div>
    </section>
  );
}

const ECOSYSTEM: { name: string; desc: string; state: string }[] = [
  { name: "Claude Code", desc: "Via the ACP adapter · local", state: "Available" },
  { name: "Devin CLI", desc: "Native ACP · local", state: "Available" },
  { name: "Gemini CLI", desc: "Native ACP", state: "Coming soon" },
  {
    name: "Custom ACP command",
    desc: "Bring any agent that speaks ACP over stdio",
    state: "Coming soon",
  },
];

function AgentsWebNotice() {
  return (
    <section>
      <SectionTitle
        title="Agents"
        sub="Claude Code and Devin CLI run locally via ACP, inside your workspace folder."
      />
      <div className="rounded-[10px] border border-dashed border-line px-4 py-4 text-[12.5px] leading-relaxed text-ink-3">
        {DESKTOP_ONLY_MESSAGE} Your pages and tasks stay in sync between the
        web and the desktop app.
      </div>
    </section>
  );
}

/* ---------- about ---------- */

function AboutSection() {
  return (
    <section className="flex flex-col items-center py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-dim">
        <span className="text-[15px] font-semibold leading-none text-accent">
          C
        </span>
      </div>
      <div className="mt-3 text-[15px] font-semibold text-ink">CoTenk</div>
      <div className="mt-1 text-[12.5px] text-ink-3">
        Think together. Work together.
      </div>
      <div className="mt-3 font-mono text-[11px] text-ink-3">v0.1.0</div>

      <div className="mt-10 w-full max-w-[420px] text-left">
        <SectionTitle title="Keyboard shortcuts" />
        <Card>
          {SHORTCUTS.map(([keys, label]) => (
            <Row key={label} label={label}>
              <kbd>{keys}</kbd>
            </Row>
          ))}
        </Card>
      </div>
    </section>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl K", "Search, actions, ask the agent"],
  ["Ctrl \\", "Toggle sidebar"],
  ["/", "Block menu inside a page"],
  ["Ctrl Z / Ctrl Shift Z", "Undo / redo (also agent edits)"],
  ["Ctrl Enter", "Finish editing a block"],
  ["Esc", "Leave the current block"],
];

/* ---------- view ---------- */

export function SettingsView() {
  const section = useWorkspace((s) => s.settingsSection);
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative flex h-dvh min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-11 shrink-0 items-center border-b border-line-soft px-4">
        <span className="text-[13px] font-semibold text-ink">Settings</span>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[640px] px-6 py-10 md:px-12">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
              transition={{
                duration: reduceMotion ? 0 : 0.15,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {section === "appearance" && <AppearanceSection />}
              {section === "account" && <AccountSection />}
              {section === "sync" && <SyncSection />}
              {section === "agents" &&
                (isDesktop() ? <AgentsSection /> : <AgentsWebNotice />)}
              {section === "about" && <AboutSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
