import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { CheckCircle, FolderOpen, Key, Lightning } from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { useProfile } from "@/lib/profile";
import { toast } from "@/lib/toast";
import { notificationsEnabled, setNotificationsEnabled } from "@/lib/notifications";
import { useAgent } from "@/lib/agent-store";
import { useAgentSetup } from "@/lib/agent-setup";
import { usePermissions } from "@/lib/agent-permissions";
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
import { ThemePicker } from "@/components/ui/theme-picker";
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

function AppearanceSection() {
  return (
    <section>
      <SectionTitle title="Appearance" />
      <ThemePicker />
      <p className="mt-3 text-[11.5px] text-ink-3">Saved on this device</p>
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
          desc="A daily summary of your tasks due today or overdue, and a note when a task with your @name appears — for example from an agent."
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
        <NameRow />
      </Card>
    </div>
  );
}

/** Who "me" is for reminders, and the greeting on Home. */
function NameRow() {
  const name = useProfile((s) => s.name);
  const setName = useProfile((s) => s.setName);
  const [draft, setDraft] = useState(name);
  const dirty = draft.trim() !== name;

  return (
    <Row
      label="Your name"
      desc="Tasks with this @name count as yours. Also used for the greeting on Home."
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty) return;
          setName(draft);
          toast("Name saved");
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
            className="shrink-0 rounded-[7px] bg-accent px-2.5 py-1 text-[12px] font-medium text-on-accent transition-colors hover:opacity-90"
          >
            Save
          </button>
        )}
      </form>
    </Row>
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
          {setup?.installed && !setup.authed ? (
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
        sub="Agents run locally on your machine via ACP and start in your workspace folder. Anything that reaches outside it — reading, changing files, a command with an outside path — waits for your approval, also with auto-approve. That covers what the agent asks about; it is not a sandbox. Each chat talks to one agent; the default is used for Ask agent, tasks and Build with AI."
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
                ? `${dir} — your pages live here as .md files; agents read and write them.`
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
        pages are mirrored into this folder as .md files · agents edit them
        on disk and changes flow straight back into the app · reads never
        need approval · skills and MCP servers come from settings → agent
        customisation
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
            className={`h-6 whitespace-nowrap rounded-[5px] px-2.5 text-[11.5px] transition-colors duration-150 ${
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
        {DESKTOP_ONLY_MESSAGE}
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

      <p className="mt-4 max-w-[420px] text-[12px] leading-relaxed text-ink-3">
        Open source. Everything — pages, chats, settings — stays on this
        device. Agents talk only to their own model provider.
      </p>

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
