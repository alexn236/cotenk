import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CheckCircle,
  DownloadSimple,
  FileText,
  Lightning,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Storefront,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { requestSignIn, useAuth } from "@/lib/auth-store";
import { useAgent } from "@/lib/agent-store";
import { useMarket } from "@/lib/marketplace";
import { askAgent } from "@/lib/agent-actions";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics";
import { DESKTOP_ONLY_MESSAGE, isDesktop } from "@/lib/workspace";
import type { Doc } from "@/lib/types";
import { DocPreview } from "@/components/editor/doc-preview";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";
import { PublishDialog } from "./publish-dialog";
import { ModelSelect } from "@/components/agents/model-select";
import { useMarketCards, type MarketCard } from "./use-market-cards";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Creates a page from a card and opens it. */
function install(card: MarketCard) {
  useWorkspace
    .getState()
    .createDocWith({ title: card.title, content: card.content });
  if (card.listingId) useMarket.getState().countInstall(card.listingId);
  track("template_installed", { official: card.official, interactive: card.interactive });
  toast(`Added “${card.title}” to your workspace`);
}

export function MarketView() {
  const tab = useWorkspace((s) => s.marketTab);
  const fetchListings = useMarket((s) => s.fetch);
  const resetListings = useMarket((s) => s.reset);
  const loaded = useMarket((s) => s.loaded);
  const userId = useAuth((s) => s.user?.id ?? null);

  // Listings are per-session (RLS) — reload after sign-in or sign-out.
  useEffect(() => {
    resetListings();
  }, [userId, resetListings]);
  useEffect(() => {
    if (!loaded) void fetchListings();
  }, [loaded, fetchListings]);

  const title =
    tab === "discover"
      ? "Discover"
      : tab === "mine"
        ? "My listings"
        : "Build with AI";

  return (
    <div className="relative flex h-dvh min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line-soft px-4">
        <Storefront size={15} className="text-ink-3" />
        <span className="text-[13px] font-semibold text-ink">Marketplace</span>
        <span className="text-[12.5px] text-ink-3">/ {title}</span>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[920px] px-6 py-10 md:px-12">
          {tab === "discover" && <Discover />}
          {tab === "mine" && <MyListings />}
          {tab === "build" && <BuildWithAi />}
        </div>
      </div>
    </div>
  );
}

/* ---------- discover ---------- */

function Discover() {
  const cards = useMarketCards();
  const category = useMarket((s) => s.category);
  const error = useMarket((s) => s.error);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<MarketCard | null>(null);

  const q = query.trim().toLowerCase();
  const visible = cards.filter(
    (c) =>
      (category === "All" || c.category === category) &&
      (!q ||
        `${c.title} ${c.description} ${c.author}`.toLowerCase().includes(q)),
  );
  const official = visible.filter((c) => c.official);
  const community = visible.filter((c) => !c.official);
  const signedOut = useAuth((s) => s.status === "signedOut");

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">
            Pages that work out of the box
          </h1>
          <p className="mt-1.5 max-w-[520px] text-[13px] leading-relaxed text-ink-3">
            Templates, dashboards and interactive tools built by the CoTenk
            community and their agents. Install a copy, then make it yours.
          </p>
        </div>
        <div className="flex h-8 w-full items-center gap-2 rounded-[8px] border border-line-soft bg-panel px-2.5 sm:w-[240px]">
          <MagnifyingGlass size={13} className="shrink-0 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search templates"
            aria-label="Search templates"
            className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </div>
      </div>

      <Shelf
        label="Official"
        cards={official}
        onOpen={setPreview}
        empty="No official templates match."
      />
      <Shelf
        label="Community"
        cards={community}
        onOpen={setPreview}
        empty={
          error
            ? error
            : q || category !== "All"
              ? "No community pages match."
              : "No community pages yet — publish the first one from any page's menu."
        }
        action={
          signedOut
            ? {
                label: "Sign in",
                run: () =>
                  requestSignIn(
                    "Community pages and publishing need an account. Your pages stay.",
                  ),
              }
            : undefined
        }
      />

      <PreviewModal card={preview} onClose={() => setPreview(null)} />
    </>
  );
}

function Shelf({
  label,
  cards,
  onOpen,
  empty,
  action,
}: {
  label: string;
  cards: MarketCard[];
  onOpen: (c: MarketCard) => void;
  empty: string;
  action?: { label: string; run: () => void };
}) {
  return (
    <section className="mt-9">
      <div className="flex items-center gap-2 pb-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
        {label}
        <span className="font-mono normal-case tracking-normal">
          {cards.length}
        </span>
      </div>
      {cards.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[10px] border border-dashed border-line px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-ink-3">{empty}</p>
          {action && (
            <button
              type="button"
              onClick={action.run}
              className={btn.primary}
            >
              {action.label}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => (
            <Card key={c.key} card={c} index={i} onOpen={() => onOpen(c)} />
          ))}
        </div>
      )}
    </section>
  );
}

function Card({
  card,
  index,
  onOpen,
}: {
  card: MarketCard;
  index: number;
  onOpen: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.035, 0.3), ease: EASE }}
      className="group flex flex-col rounded-[10px] border border-line-soft bg-panel p-4 transition-[background-color,border-color] duration-150 hover:border-line hover:bg-panel-2"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col items-start text-left"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] text-ink-3">
            {card.category}
          </span>
          {card.interactive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-dim px-2 py-0.5 text-[10.5px] text-accent">
              <Lightning size={10} weight="fill" />
              Interactive
            </span>
          )}
        </div>
        <div className="mt-3 text-[14px] font-medium text-ink">
          {card.title}
        </div>
        <p className="mt-1 line-clamp-3 text-[12px] leading-[1.5] text-ink-3">
          {card.description || "No description."}
        </p>
      </button>
      <div className="mt-4 flex items-center gap-2 text-[11.5px] text-ink-3">
        <span className="flex min-w-0 items-center gap-1 truncate">
          {card.official && (
            <CheckCircle size={12} weight="fill" className="shrink-0 text-accent" />
          )}
          {card.author}
        </span>
        {card.installs !== null && (
          <span className="font-mono">· {card.installs} installs</span>
        )}
        <span className="ml-auto font-mono">
          {card.priceCents > 0 ? `€${(card.priceCents / 100).toFixed(2)}` : "Free"}
        </span>
        <button
          type="button"
          onClick={() => install(card)}
          aria-label={`Use ${card.title}`}
          title="Use template"
          className="grid h-7 w-7 place-items-center rounded-[6px] border border-line bg-panel-2 text-ink-2 transition-colors duration-150 hover:bg-accent hover:text-on-accent"
        >
          <DownloadSimple size={13} />
        </button>
      </div>
    </motion.div>
  );
}

function PreviewModal({
  card,
  onClose,
}: {
  card: MarketCard | null;
  onClose: () => void;
}) {
  const unpublish = useMarket((s) => s.unpublish);
  return (
    <Modal
      open={card !== null}
      onClose={onClose}
      width={760}
      title={
        card && (
          <span className="flex items-center gap-2">
            {card.title}
            <span className="font-normal text-ink-3">
              · {card.category} · by {card.author}
            </span>
          </span>
        )
      }
      footer={
        card && (
          <>
            {card.mine && card.listingId && (
              <button
                type="button"
                className={`${btn.secondary} mr-auto hover:text-danger`}
                onClick={async () => {
                  const err = await unpublish(card.listingId!);
                  if (err) toast(err, { tone: "error" });
                  else toast("Listing removed");
                  onClose();
                }}
              >
                <Trash size={13} />
                Unpublish
              </button>
            )}
            <button type="button" onClick={onClose} className={btn.secondary}>
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                install(card);
                onClose();
              }}
              className={btn.primary}
            >
              <DownloadSimple size={13} />
              Use template
            </button>
          </>
        )
      }
    >
      {card && (
        <div className="px-8 py-6">
          {card.description && (
            <p className="mb-6 text-[13px] leading-relaxed text-ink-2">
              {card.description}
            </p>
          )}
          <div className="rounded-[10px] border border-line-soft bg-canvas px-6 py-5">
            <h1 className="mb-4 text-[26px] font-semibold tracking-[-0.02em] text-ink">
              {card.title}
            </h1>
            <DocPreview content={card.content} />
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------- my listings ---------- */

function MyListings() {
  const cards = useMarketCards().filter((c) => c.mine);
  const error = useMarket((s) => s.error);
  const docs = useWorkspace((s) => s.docs);
  const [picking, setPicking] = useState(false);
  const [publishing, setPublishing] = useState<Doc | null>(null);
  const [preview, setPreview] = useState<MarketCard | null>(null);
  const installs = cards.reduce((n, c) => n + (c.installs ?? 0), 0);
  const signedOut = useAuth((s) => s.status === "signedOut");

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-ink">
            My listings
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {signedOut
              ? "Sign in to publish pages and track installs."
              : `${cards.length} published · ${installs} installs`}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            signedOut
              ? requestSignIn("Publishing to the marketplace needs an account.")
              : setPicking(true)
          }
          className={btn.primary}
        >
          <UploadSimple size={13} />
          {signedOut ? "Sign in to publish" : "Publish a page"}
        </button>
      </div>

      {error && !signedOut && (
        <p className="mt-6 rounded-[10px] border border-dashed border-line px-4 py-3 text-[12.5px] text-ink-3">
          {error}
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c, i) => (
          <Card key={c.key} card={c} index={i} onOpen={() => setPreview(c)} />
        ))}
      </div>
      {cards.length === 0 && (!error || signedOut) && (
        <div className="mt-2 rounded-[10px] border border-dashed border-line px-6 py-10 text-center">
          <Storefront size={22} className="mx-auto text-ink-3" />
          <p className="mt-3 text-[13px] text-ink-2">
            Share what works for you
          </p>
          <p className="mx-auto mt-1 max-w-[380px] text-[12.5px] leading-relaxed text-ink-3">
            Publish any page — a planning ritual, a dashboard your agent
            built — and others can install a copy in one click.
          </p>
        </div>
      )}

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title="Choose a page to publish"
        width={440}
      >
        <div className="p-1.5">
          {docs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setPicking(false);
                setPublishing(d);
              }}
              className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink"
            >
              <FileText size={15} className="shrink-0 text-ink-3" />
              <span className="truncate">{d.title.trim() || "Untitled"}</span>
            </button>
          ))}
        </div>
      </Modal>
      <PublishDialog doc={publishing} onClose={() => setPublishing(null)} />
      <PreviewModal card={preview} onClose={() => setPreview(null)} />
    </>
  );
}

/* ---------- build with AI ---------- */

const BUILD_EXAMPLES = [
  "A habit tracker for this month with a streak counter",
  "Onboarding checklist for a new developer on our team",
  "Budget calculator for a small event with live totals",
  "Competitor comparison table for note-taking apps",
];

function buildPrompt(desc: string, interactive: boolean): string {
  return [
    `Create a new CoTenk page for this request: "${desc}".`,
    `Write it as a new .md file in the workspace root. The first line must be "# <a short, fitting title>". Structure it with headings, tasks and tables where they help.`,
    interactive
      ? "Include at least one interactive HTML embed that makes the page genuinely useful (for example a calculator, tracker, chart or checklist widget), following the embed conventions."
      : "Do not add HTML embeds — plain markdown only.",
    "When you are done, reply with the page title and a one-sentence summary.",
  ].join("\n\n");
}

function BuildWithAi() {
  const status = useAgent((s) => s.status);
  const [desc, setDesc] = useState("");
  const [interactive, setInteractive] = useState(true);
  const running = status === "running" || status === "starting";

  const submit = () => {
    const d = desc.trim();
    if (!d) return;
    askAgent({
      prompt: buildPrompt(d, interactive),
      title: `Build: ${d}`,
    });
  };

  return (
    <div className="mx-auto max-w-[640px]">
      <div className="flex flex-col items-center text-center">
        <div className="grid h-11 w-11 place-items-center rounded-[12px] border border-line bg-panel">
          <Sparkle size={20} className="text-accent" />
        </div>
        <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.01em] text-ink">
          Describe it, get a page
        </h1>
        <p className="mt-1.5 max-w-[460px] text-[13px] leading-relaxed text-ink-3">
          Your agent builds the page right inside your workspace — markdown,
          tasks and interactive widgets. It shows up in Documents when done,
          ready to edit, share or publish.
        </p>
      </div>

      <div className="mt-8 rounded-[12px] border border-line bg-panel p-3 shadow-[0_2px_12px_var(--color-shadow)] focus-within:border-accent-line">
        <textarea
          autoFocus
          value={desc}
          onChange={(e) => setDesc(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={4}
          placeholder="e.g. A sprint board for our team with a burndown chart"
          aria-label="Describe the page"
          className="block w-full resize-none bg-transparent px-1 text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
        />
        <div className="mt-2 flex items-center gap-3">
          <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={interactive}
              onChange={(e) => setInteractive(e.currentTarget.checked)}
              className="accent-[var(--color-accent)]"
            />
            Include interactive widgets
          </label>
          <span className="ml-auto hidden font-mono text-[10.5px] text-ink-3 sm:inline">
            Ctrl ↵
          </span>
          <ModelSelect />
          <button
            type="button"
            onClick={submit}
            disabled={!desc.trim() || running}
            className={btn.primary}
          >
            <Plus size={13} />
            {running ? "Agent busy…" : "Build page"}
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-1.5">
        {BUILD_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setDesc(ex)}
            className="rounded-full border border-line bg-panel px-3 py-1.5 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
          >
            {ex}
          </button>
        ))}
      </div>

      {!isDesktop() && (
        <p className="mt-8 rounded-[10px] border border-dashed border-line px-4 py-3 text-center text-[12.5px] leading-relaxed text-ink-3">
          {DESKTOP_ONLY_MESSAGE}
        </p>
      )}

      <p className="mt-10 text-center font-mono text-[11px] text-ink-3">
        runs on your connected agent · nothing leaves your machine except
        what the agent sends to its model
      </p>
    </div>
  );
}
