import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { CheckCircle, FolderOpen, Key, Lightning } from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { requestSignIn, useAuth } from "@/lib/auth-store";
import { toast } from "@/lib/toast";
import { notificationsEnabled, setNotificationsEnabled } from "@/lib/notifications";
import { useAgent } from "@/lib/agent-store";
import { useAgentSetup } from "@/lib/agent-setup";
import { usePermissions } from "@/lib/agent-permissions";
import {
  analyticsAvailable,
  analyticsEnabled,
  setAnalyticsEnabled,
} from "@/lib/analytics";
import { acpClient, killAllAgents } from "@/lib/agent/acp-client";
import { AGENT_KINDS, AGENTS, type AgentKind } from "@/lib/agents";
import { CotenkKeyForm } from "@/components/agents/cotenk-key-form";
import {
  apiKeyOverride,
  DESKTOP_ONLY_MESSAGE,
  isDesktop,
  resolveWorkspaceDir,
  storeApiKeyOverride,
  storeWorkspaceDir,
} from "@/lib/workspace";
import { ExtensionsSection } from "./extensions-section";
import { DataSection } from "./data-section";
import {
  Badge,
  Card,
  Row,
  SectionTitle,
  SmallButton,
  Switch,
} from "./settings-ui";

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
      <NotificationsCard />
    </section>
  );
}

function NotificationsCard() {
  const [on, setOn] = useState(notificationsEnabled);
  return (
    <div className="mt-8">
      <SectionTitle title="Notifications" />
      <Card>
        <Row
          label="Task reminders and mentions"
          desc="A daily summary of your tasks due today or overdue, and a note when a task with your @name appears — from an agent, another device or a teammate."
        >
          <Switch
            on={on}
            label="Task reminders and mentions"
            onChange={(next) => {
              setNotificationsEnabled(next);
              setOn(next);
            }}
          />
        </Row>
      </Card>
    </div>
  );
}

/* ---------- account ---------- */

function AccountSection() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const displayName = useAuth((s) => s.displayName);
  const accountStatus = useAuth((s) => s.accountStatus);
  const openAuthDialog = useAuth((s) => s.openDialog);
  const docs = useWorkspace((s) => s.docs.length);
  const email = user?.email ?? "";
  const initial = ((displayName || email)[0] ?? "?").toUpperCase();

  if (!user) {
    return (
      <section>
        <SectionTitle
          title="Account"
          sub="You're working locally. Everything works — pages, tasks, agents — the account only adds sync and the marketplace."
        />
        <Card>
          <Row
            label="Local workspace"
            desc={`${docs} ${docs === 1 ? "page" : "pages"} on this device${
              isDesktop() ? " and in its workspace folder" : ""
            }.`}
          >
            <Badge>Not signed in</Badge>
          </Row>
          <Row
            label="Sign in or create an account"
            desc="The account has its own workspace. After signing in you choose which of these pages come along."
          >
            <button
              type="button"
              onClick={() =>
                requestSignIn(
                  "Sign in to open this workspace on your other devices.",
                )
              }
              className="h-7 shrink-0 rounded-[6px] bg-accent px-2.5 text-[12px] font-medium text-on-accent transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98]"
            >
              Sign in
            </button>
          </Row>
        </Card>
      </section>
    );
  }

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
              <div className="truncate text-[13px] text-ink">
                {displayName || email}
              </div>
              <div className="truncate text-[12px] text-ink-3">{email}</div>
            </div>
          </div>
          <Badge>Signed in</Badge>
        </div>
        {accountStatus === "ready" && <DisplayNameRow />}
        <Row label="Password" desc="Set a new password for this account.">
          <SmallButton onClick={() => openAuthDialog(undefined, "recovery")}>
            Change…
          </SmallButton>
        </Row>
        <Row
          label="Sign out"
          desc={
            isDesktop()
              ? "Stops syncing and switches back to this device's local workspace. The account's folder stays on disk."
              : "Switches back to this device's local workspace. Your pages stay in your account."
          }
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

/** Name other people see — marketplace listings, shared workspaces. */
function DisplayNameRow() {
  const displayName = useAuth((s) => s.displayName);
  const setDisplayName = useAuth((s) => s.setDisplayName);
  const [draft, setDraft] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const dirty = draft.trim() !== displayName;

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    const err = await setDisplayName(draft);
    setBusy(false);
    toast(err ?? "Name saved", err ? { tone: "error" } : undefined);
  };

  return (
    <Row
      label="Display name"
      desc={
        displayName
          ? "Shown on your marketplace listings and to people you share a workspace with."
          : "Not set yet — needed before you publish to the marketplace."
      }
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          value={draft}
          maxLength={60}
          onChange={(e) => setDraft(e.currentTarget.value)}
          placeholder="Your name"
          className="w-44 rounded-[7px] border border-line bg-panel-2 px-2 py-1 text-[12px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
        {dirty && (
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-[7px] bg-accent px-2.5 py-1 text-[12px] font-medium text-on-accent transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        )}
      </form>
    </Row>
  );
}

/* ---------- sync ---------- */

function SyncSection() {
  const docs = useWorkspace((s) => s.docs);
  const folders = useWorkspace((s) => s.folders);
  const syncStatus = useWorkspace((s) => s.syncStatus);
  const signedIn = useAuth((s) => s.status === "signedIn");
  const accountError = useAuth((s) => s.accountError);
  const loadAccount = useAuth((s) => s.loadAccount);

  const statusDot = !signedIn
    ? "bg-ink-3"
    : syncStatus === "synced"
      ? "bg-emerald-500/70"
      : syncStatus === "syncing"
        ? "animate-pulse bg-accent"
        : syncStatus === "error"
          ? "bg-danger"
          : "bg-ink-3";
  const statusLabel = !signedIn
    ? "Local only"
    : syncStatus === "synced"
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
          <span className="text-[12px] text-ink-2">
            {signedIn ? "Supabase" : "This device"}
          </span>
        </Row>
        <Row label="Documents">
          <span className="font-mono text-[12px] text-ink-2">
            {docs.length} docs · {folders.length} folders
          </span>
        </Row>
      </Card>
      {signedIn && accountError ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-line bg-panel px-4 py-3 text-[12px] text-danger">
          <span className="min-w-0">{accountError}</span>
          <SmallButton onClick={() => void loadAccount()}>Retry</SmallButton>
        </div>
      ) : signedIn ? (
        <div className="mt-3 rounded-[10px] border border-dashed border-line bg-transparent px-4 py-3 text-[12px] text-ink-3">
          Every change debounces into Supabase and shows up live on your
          other signed-in devices.
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-start gap-3 rounded-[10px] border border-dashed border-line bg-transparent px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-ink-3">
            Pages are kept on this device
            {isDesktop() ? " and mirrored to its workspace folder" : ""}.
            Sign in to reach them from other devices.
          </p>
          <button
            type="button"
            onClick={() =>
              requestSignIn(
                "Sign in to open this workspace on your other devices.",
              )
            }
            className="h-7 shrink-0 rounded-[6px] border border-line bg-panel-2 px-2.5 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink active:scale-[0.98]"
          >
            Sign in
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------- agents ---------- */

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
  const openGuide = useAgentSetup((s) => s.openGuide);
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
          {kind === "cotenk" && setup?.installed && !setup.authed ? (
            <Badge>Needs API key</Badge>
          ) : setup?.installed && !setup.authed ? (
            <SmallButton accent onClick={() => void connect(kind)}>
              {connecting === kind ? "Waiting for sign-in…" : "Connect"}
            </SmallButton>
          ) : setup && !setup.installed ? (
            <SmallButton accent onClick={() => openGuide(kind)}>
              Set up
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
      {kind === "cotenk" && setup?.installed && (
        <div className="px-4 py-3">
          <CotenkKeyForm />
        </div>
      )}
      {setup?.hint && !(kind === "cotenk" && setup.installed) && (
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
  const signedIn = useAuth((s) => s.status === "signedIn");
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
        sub="Agents run locally on your machine via ACP and start in your workspace folder. CoTenk refuses file changes outside it, but an agent can still read other files and a command can reach further — it is not a sandbox. Each chat talks to one agent; the default is used for Ask agent, tasks and Build with AI."
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
                ? `${dir} — agents read and write here. ${
                    signedIn
                      ? "Each account has its own folder on this device."
                      : "Used while signed out; accounts get their own folder."
                  }`
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
          <ApprovalRow />
          <ConfirmCommandsRow />
          <Row label="Chats">
            <span className="font-mono text-[12px] text-ink-2">
              {chats.length} chats
            </span>
          </Row>
        </Card>
      </div>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-3">
        docs sync into this folder as .md files · agents edit them on disk
        and changes flow back to supabase · reads never need approval ·
        skills and MCP servers come from settings → skills & mcp
      </p>
    </section>
  );
}

function ApprovalRow() {
  const mode = usePermissions((s) => s.mode);
  const setMode = usePermissions((s) => s.setMode);
  return (
    <Row
      icon={CheckCircle}
      label="Agent changes"
      desc={
        mode === "review"
          ? "You review every edit and command as a diff before it lands."
          : "Edits and commands are approved automatically."
      }
    >
      <div
        role="radiogroup"
        aria-label="Agent changes"
        className="flex items-center rounded-[7px] border border-line bg-panel-2 p-0.5"
      >
        {(["review", "auto"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`h-6 rounded-[5px] px-2.5 text-[11.5px] transition-colors duration-150 ${
              mode === m ? "bg-elev text-ink" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {m === "review" ? "Review" : "Auto-approve"}
          </button>
        ))}
      </div>
    </Row>
  );
}

function ConfirmCommandsRow() {
  const mode = usePermissions((s) => s.mode);
  const on = usePermissions((s) => s.confirmCommands);
  const set = usePermissions((s) => s.setConfirmCommands);
  return (
    <Row
      icon={CheckCircle}
      label="Always ask before commands"
      desc={
        mode === "auto"
          ? "Even with auto-approve, shell commands wait for you — they can touch more than the page they're about."
          : "Applies when auto-approve is on."
      }
    >
      <Switch on={on} label="Always ask before commands" onChange={set} />
    </Row>
  );
}

function AgentsWebNotice() {
  return (
    <section>
      <SectionTitle
        title="Agents"
        sub="Claude Code and Devin CLI run locally and start in your workspace folder."
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

      {analyticsAvailable() && <PrivacyCard />}

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

function PrivacyCard() {
  const [on, setOn] = useState(analyticsEnabled);
  return (
    <div className="mt-10 w-full max-w-[420px] text-left">
      <SectionTitle title="Privacy" />
      <Card>
        <Row
          label="Share anonymous usage data"
          desc="Counts like “an agent changed a page in the first session” — never page content, titles or emails. Helps us see whether onboarding works."
        >
          <Switch
            on={on}
            onChange={(next) => {
              setAnalyticsEnabled(next);
              setOn(next);
            }}
          />
        </Row>
      </Card>
    </div>
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
              {section === "extensions" && <ExtensionsSection />}
              {section === "data" && <DataSection />}
              {section === "about" && <AboutSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
