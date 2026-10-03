import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ChatCircle,
  Check,
  CheckSquare,
  FileText,
  Lightning,
  Plus,
  PushPin,
  Sparkle,
  Storefront,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { openWelcomePage, useWorkspace } from "@/lib/store";
import { isHtmlPage } from "@/lib/html-page";
import { useProfile } from "@/lib/profile";
import { useAgent } from "@/lib/agent-store";
import { useAgentSetup } from "@/lib/agent-setup";
import { AGENT_KINDS } from "@/lib/agents";
import { TEMPLATES } from "@/lib/templates";
import { seedDocs } from "@/lib/mock-docs";
import { WELCOME_ID } from "@/lib/welcome";
import { hasAgentChangedPage } from "@/lib/activity";
import {
  completeOnboarding,
  dismissOnboarding,
  onboardingComplete,
  onboardingDismissed,
} from "@/lib/onboarding";
import { DESKTOP_DOWNLOAD_URL, isDesktop, openExternal } from "@/lib/workspace";
import { dueBucket, extractTasks, isoDay } from "@/lib/tasks";
import { relativeTime } from "@/lib/time";
import type { Doc } from "@/lib/types";
import { TaskRow } from "@/components/tasks/task-row";

const EASE = [0.16, 1, 0.3, 1] as const;
const stagger = (i: number) => Math.min(i * 0.04, 0.3);

/** First non-heading text line of a doc, stripped of markdown marks. */
function docPreview(content: string): string {
  if (isHtmlPage(content)) {
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(content)?.[1]?.trim();
    return title ? `HTML page · ${title}` : "HTML page";
  }
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (
      line === "" ||
      line.startsWith("#") ||
      line.startsWith("<") ||
      /^(`{3}|~{3})/.test(line)
    ) {
      continue;
    }
    const text = line
      .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, "")
      .replace(/^>\s?/, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~|]/g, "")
      .trim();
    if (text) return text.length > 110 ? `${text.slice(0, 110)}…` : text;
  }
  return "Empty page";
}

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 11) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** "Anna Kowalski" → "Anna" — the display name, never the email. */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}

const SECTION_LABEL =
  "flex items-center gap-1.5 pb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3";

/**
 * Landing view for the "home" rail section: greeting, quick actions,
 * a getting-started checklist, pinned pages, recent pages, open tasks and
 * recent agent chats.
 */
export function HomeView() {
  const docs = useWorkspace((s) => s.docs);
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const setRailSection = useWorkspace((s) => s.setRailSection);
  const setMarketTab = useWorkspace((s) => s.setMarketTab);
  const setPaletteOpen = useWorkspace((s) => s.setPaletteOpen);
  const createDoc = useWorkspace((s) => s.createDoc);
  const name = firstName(useProfile((s) => s.name));
  const chats = useAgent((s) => s.chats);
  const selectChat = useAgent((s) => s.selectChat);
  const reduceMotion = useReducedMotion();

  const now = new Date();
  const today = isoDay(now);
  const dateLine = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const pinned = docs.filter((d) => d.pinned);
  const recent = [...docs]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
  const allTasks = extractTasks(docs);
  const openTasks = allTasks
    .filter((t) => !t.done)
    // Overdue and due-soon first, undated last.
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const shownTasks = openTasks.slice(0, 5);
  const overdue = openTasks.filter(
    (t) => dueBucket(t.due, today) === "overdue",
  ).length;
  const recentChats = [...chats]
    .filter((c) => c.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);

  const rise = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay: stagger(i), ease: EASE },
  });

  const openMarket = (tab: "discover" | "build") => {
    setMarketTab(tab);
    setRailSection("market");
  };

  return (
    <div className="relative flex h-dvh min-w-0 flex-1 flex-col bg-canvas">
      {/* top bar */}
      <header className="flex h-11 shrink-0 items-center border-b border-line-soft px-4">
        <span className="text-[13px] font-semibold text-ink">Home</span>
        <span className="ml-3 font-mono text-[11.5px] text-ink-3">
          {dateLine}
        </span>
        <button
          type="button"
          onClick={() => createDoc()}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-[6px] border border-line bg-panel px-2.5 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink active:scale-[0.98]"
        >
          <Plus size={13} />
          New page
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="@container mx-auto w-full max-w-[860px] px-6 py-10 md:px-12">
          {/* greeting */}
          <motion.div {...rise(0)}>
            <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">
              {name ? `${greeting(now)}, ${name}` : greeting(now)}
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-3">
              {openTasks.length === 0
                ? "No open tasks. A good moment to start something new."
                : `${openTasks.length} open ${openTasks.length === 1 ? "task" : "tasks"} across ${docs.length} pages${overdue > 0 ? ` · ${overdue} overdue` : ""}.`}
            </p>
          </motion.div>

          {/* quick actions */}
          <motion.div
            {...rise(1)}
            className="mt-7 grid grid-cols-2 gap-2 @2xl:grid-cols-4"
          >
            <QuickAction
              icon={Plus}
              label="New page"
              sub="Blank markdown"
              onClick={() => createDoc()}
            />
            <QuickAction
              icon={Lightning}
              label="Ask agent"
              sub="Search or instruct"
              accent
              onClick={() => setPaletteOpen(true)}
            />
            <QuickAction
              icon={Storefront}
              label="Templates"
              sub={`${TEMPLATES.length}+ ready pages`}
              onClick={() => openMarket("discover")}
            />
            <QuickAction
              icon={Sparkle}
              label="Build with AI"
              sub="Describe a page"
              onClick={() => openMarket("build")}
            />
          </motion.div>

          <GettingStarted />

          {/* pinned docs */}
          {pinned.length > 0 && (
            <section className="mt-9">
              <motion.div {...rise(2)} className={SECTION_LABEL}>
                <PushPin size={12} />
                Pinned
              </motion.div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {pinned.map((doc, i) => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    seq={i + 3}
                    rise={rise}
                    now={now}
                    onOpen={() => setActiveDoc(doc.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* recent + tasks split */}
          <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 @xl:grid-cols-2">
            <section>
              <motion.div {...rise(3)} className={SECTION_LABEL}>
                <FileText size={12} />
                Recent
              </motion.div>
              <div>
                {recent.map((doc, i) => (
                  <motion.button
                    key={doc.id}
                    type="button"
                    {...rise(i + 4)}
                    onClick={() => setActiveDoc(doc.id)}
                    className="group flex w-full items-center gap-2.5 border-b border-line-soft py-2.5 text-left transition-colors duration-150 last:border-0"
                  >
                    <FileText
                      size={15}
                      className="shrink-0 text-ink-3 transition-colors duration-150 group-hover:text-ink-2"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 transition-colors duration-150 group-hover:text-ink">
                      {doc.title.trim() === "" ? "Untitled" : doc.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">
                      {relativeTime(doc.updatedAt, now.getTime())}
                    </span>
                  </motion.button>
                ))}
              </div>

              {recentChats.length > 0 && (
                <>
                  <motion.div
                    {...rise(6)}
                    className={`${SECTION_LABEL} mt-8`}
                  >
                    <Lightning size={12} />
                    Agent chats
                  </motion.div>
                  {recentChats.map((c, i) => (
                    <motion.button
                      key={c.id}
                      type="button"
                      {...rise(i + 7)}
                      onClick={() => {
                        selectChat(c.id);
                        setRailSection("agents");
                      }}
                      className="group flex w-full items-center gap-2.5 border-b border-line-soft py-2.5 text-left last:border-0"
                    >
                      <ChatCircle
                        size={15}
                        className="shrink-0 text-ink-3 group-hover:text-accent"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 group-hover:text-ink">
                        {c.title}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-3">
                        {relativeTime(c.updatedAt, now.getTime())}
                      </span>
                    </motion.button>
                  ))}
                </>
              )}
            </section>

            <section>
              <motion.div
                {...rise(3)}
                className={`${SECTION_LABEL} justify-between`}
              >
                <span className="flex items-center gap-1.5">
                  <CheckSquare size={12} />
                  Open tasks
                </span>
                {openTasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRailSection("tasks")}
                    className="flex items-center gap-1 text-[11px] normal-case tracking-normal text-ink-3 transition-colors duration-150 hover:text-ink-2"
                  >
                    View all
                    <ArrowRight size={11} />
                  </button>
                )}
              </motion.div>
              {shownTasks.length === 0 ? (
                <motion.p
                  {...rise(4)}
                  className="py-2.5 text-[12.5px] text-ink-3"
                >
                  All clear. Nothing waiting on you.
                </motion.p>
              ) : (
                <div className="-mx-2">
                  {shownTasks.map((task, i) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      today={today}
                      seq={i + 4}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon: QIcon,
  label,
  sub,
  onClick,
  accent,
}: {
  icon: Icon;
  label: string;
  sub: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-[10px] border border-line-soft bg-panel px-3 py-2.5 text-left transition-[background-color,border-color] duration-150 hover:border-line hover:bg-panel-2"
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border ${
          accent
            ? "border-accent-line bg-accent-dim text-accent"
            : "border-line-soft bg-elev text-ink-2"
        }`}
      >
        <QIcon size={15} weight={accent ? "fill" : "regular"} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-ink">{label}</span>
        <span className="block truncate text-[11.5px] text-ink-3">{sub}</span>
      </span>
    </button>
  );
}

/**
 * The one getting-started checklist — three steps that lead to the
 * moment CoTenk clicks (an agent editing your page), ticked off from
 * real state. The app opens on Home until it's done or dismissed.
 * In the browser, where agents can't run, it points to the desktop app.
 */
function GettingStarted() {
  const docs = useWorkspace((s) => s.docs);
  const createDoc = useWorkspace((s) => s.createDoc);
  const setup = useAgentSetup((s) => s.setup);
  const checkSetup = useAgentSetup((s) => s.check);
  const openGuide = useAgentSetup((s) => s.openGuide);
  const desktop = isDesktop();
  const [dismissed, setDismissed] = useState(
    () => onboardingDismissed() || onboardingComplete(),
  );
  const [gotApp, setGotApp] = useState(() => desktopAppClicked());
  useEffect(() => {
    if (!desktop) return;
    for (const k of AGENT_KINDS) void checkSetup(k);
  }, [desktop, checkSetup]);

  const seedIds = new Set(seedDocs.map((d) => d.id));
  const ownPage = docs.some((d) => !seedIds.has(d.id));
  const agentReady = Object.values(setup).some(
    (s) => !!s && s.installed && s.authed,
  );
  const notesStep: Step = {
    label: "Bring your notes — Notion, Obsidian or .md files",
    hint: "or start a blank page",
    done: ownPage,
    cta: "Import",
    run: () => useWorkspace.getState().setImportOpen(true),
    alt: () => createDoc(),
  };
  const steps: Step[] = desktop
    ? [
        {
          label: "Connect an agent — Claude Code or Devin CLI",
          done: agentReady,
          cta: "Set up",
          run: () => openGuide(),
        },
        {
          label: "Watch it edit a page — ask it on the welcome page",
          done: hasAgentChangedPage(),
          cta: "Try it",
          blocked: !agentReady,
          run: () => {
            openWelcomePage();
            useWorkspace.getState().requestAskAgent(WELCOME_ID);
          },
        },
        notesStep,
      ]
    : [
        notesStep,
        {
          label: "Get the desktop app — agents run there",
          done: gotApp,
          cta: "Download",
          run: () => {
            markDesktopAppClicked();
            setGotApp(true);
            openExternal(DESKTOP_DOWNLOAD_URL);
          },
        },
      ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  useEffect(() => {
    if (allDone) completeOnboarding();
  }, [allDone]);

  if (dismissed || allDone) return null;
  const current = steps.findIndex((s) => !s.done);

  const dismiss = () => {
    setDismissed(true);
    dismissOnboarding();
  };

  return (
    <section className="mt-7 rounded-[12px] border border-line-soft bg-panel p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-ink">
            Get started with CoTenk
          </div>
          <div className="mt-0.5 text-[12px] text-ink-3">
            {doneCount} of {steps.length} done
          </div>
        </div>
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-panel-2">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting started"
          className="grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors hover:bg-hover hover:text-ink-2"
        >
          <X size={12} />
        </button>
      </div>
      <ol className="mt-3 flex flex-col gap-1">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className={`flex items-center gap-2.5 rounded-[8px] px-2 py-2 ${
              i === current ? "bg-panel-2" : ""
            }`}
          >
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                s.done
                  ? "border-accent bg-accent text-on-accent"
                  : i === current
                    ? "border-accent text-accent"
                    : "border-line text-ink-3"
              }`}
            >
              {s.done ? <Check size={10} weight="bold" /> : i + 1}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-[13px] ${
                s.done ? "text-ink-3 line-through" : "text-ink-2"
              }`}
            >
              {s.label}
            </span>
            {!s.done && s.alt && s.hint && (
              <button
                type="button"
                onClick={s.alt}
                className="hidden shrink-0 text-[11.5px] text-ink-3 transition-colors hover:text-ink-2 sm:inline"
              >
                {s.hint}
              </button>
            )}
            {!s.done && (
              <button
                type="button"
                onClick={s.run}
                disabled={s.blocked}
                title={s.blocked ? "Connect an agent first" : undefined}
                className={`shrink-0 rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  i === current
                    ? "bg-accent text-on-accent hover:bg-accent-2"
                    : "text-accent hover:bg-hover"
                }`}
              >
                {s.cta}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

type Step = {
  label: string;
  done: boolean;
  cta: string;
  run: () => void;
  /** Secondary action shown as a quiet link, e.g. "or start a blank page". */
  hint?: string;
  alt?: () => void;
  /** Can't be done yet (an earlier step is missing). */
  blocked?: boolean;
};

const APP_CLICKED_KEY = "cotenk-onboarding-got-app";

function desktopAppClicked(): boolean {
  try {
    return localStorage.getItem(APP_CLICKED_KEY) === "1";
  } catch {
    return false;
  }
}

function markDesktopAppClicked() {
  try {
    localStorage.setItem(APP_CLICKED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

function DocCard({
  doc,
  seq,
  rise,
  now,
  onOpen,
}: {
  doc: Doc;
  seq: number;
  rise: (i: number) => object;
  now: Date;
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      {...rise(seq)}
      onClick={onOpen}
      className="group flex flex-col rounded-[10px] border border-line-soft bg-panel p-4 text-left transition-[background-color,transform] duration-150 hover:-translate-y-[1px] hover:bg-panel-2 active:translate-y-0"
    >
      <div className="flex items-center gap-2">
        <FileText size={15} className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
          {doc.title.trim() === "" ? "Untitled" : doc.title}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 min-h-[2.6em] text-[12px] leading-[1.3] text-ink-3 [overflow-wrap:anywhere]">
        {docPreview(doc.content)}
      </p>
      <span className="mt-2.5 font-mono text-[11px] text-ink-3">
        Edited {relativeTime(doc.updatedAt, now.getTime())}
      </span>
    </motion.button>
  );
}
