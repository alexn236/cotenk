import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  CheckSquare,
  DownloadSimple,
  FileText,
  FileHtml,
  FolderPlus,
  GearSix,
  Hand,
  House,
  Lightning,
  MagnifyingGlass,
  MoonStars,
  Plus,
  SignIn,
  Sparkle,
  Storefront,
  type Icon,
} from "@phosphor-icons/react";
import { openWelcomePage, useWorkspace } from "@/lib/store";
import { HTML_PAGE_TEMPLATE } from "@/lib/html-page";
import { requestSignIn, useAuth } from "@/lib/auth-store";
import type { Doc, Folder } from "@/lib/types";
import { askAgent } from "@/lib/agent-actions";
import { useIsomorphicLayoutEffect } from "@/components/editor/utils";
import { Modal } from "@/components/ui/modal";
import { ModelSelect } from "@/components/agents/model-select";

type Item = {
  id: string;
  group: "Pages" | "Actions" | "Agent";
  label: string;
  hint?: string;
  icon: Icon;
  run: () => void;
};

/** Plain-text snippet around the first match of `q` in `content`. */
function snippet(content: string, q: string): string | undefined {
  const flat = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`~[\]()|-]+/g, " ")
    .replace(/\s+/g, " ");
  const i = flat.toLowerCase().indexOf(q);
  if (i < 0) return undefined;
  const start = Math.max(0, i - 30);
  return `${start > 0 ? "…" : ""}${flat.slice(start, i + q.length + 50).trim()}…`;
}

/** Builds the palette rows; plain function so it may read store state. */
function buildItems(
  docs: Doc[],
  folders: Folder[],
  query: string,
  onClose: () => void,
): Item[] {
  const ws = useWorkspace.getState();
  const q = query.trim().toLowerCase();
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const folderName = (id: string | null) =>
    folders.find((f) => f.id === id)?.name;

  const pages: Item[] = [];
  const sorted = [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const d of sorted) {
    const title = d.title.trim() || "Untitled";
    if (!q) {
      if (pages.length < 6) {
        pages.push({
          id: `doc:${d.id}`,
          group: "Pages",
          label: title,
          hint: folderName(d.folderId) ?? "Recent",
          icon: FileText,
          run: go(() => ws.setActiveDoc(d.id)),
        });
      }
      continue;
    }
    const inTitle = title.toLowerCase().includes(q);
    const snip = inTitle ? undefined : snippet(d.content, q);
    if (inTitle || snip) {
      pages.push({
        id: `doc:${d.id}`,
        group: "Pages",
        label: title,
        hint: snip ?? folderName(d.folderId),
        icon: FileText,
        run: go(() => ws.setActiveDoc(d.id)),
      });
    }
  }
  // Title hits first, then content hits.
  pages.sort(
    (a, b) =>
      Number(!a.label.toLowerCase().includes(q)) -
      Number(!b.label.toLowerCase().includes(q)),
  );

  const allActions: Item[] = [
    {
      id: "new-page",
      group: "Actions",
      label: "New page",
      icon: Plus,
      run: go(() => {
        ws.createDoc();
        ws.setRailSection("docs");
      }),
    },
    {
      id: "new-html-page",
      group: "Actions",
      label: "New HTML page",
      hint: "Your own HTML, CSS and JavaScript",
      icon: FileHtml,
      run: go(() => {
        ws.createDocWith({ title: "", content: HTML_PAGE_TEMPLATE });
      }),
    },
    {
      id: "new-folder",
      group: "Actions",
      label: "New folder",
      icon: FolderPlus,
      run: go(() => {
        ws.createFolder("New folder");
        ws.setRailSection("docs");
      }),
    },
    {
      id: "import",
      group: "Actions",
      label: "Import notes",
      hint: "Notion export, Obsidian vault, .md files",
      icon: DownloadSimple,
      run: go(() => ws.setImportOpen(true)),
    },
    {
      id: "templates",
      group: "Actions",
      label: "Browse templates",
      icon: Storefront,
      run: go(() => {
        ws.setMarketTab("discover");
        ws.setRailSection("market");
      }),
    },
    {
      id: "build",
      group: "Actions",
      label: "Build a page with AI",
      icon: Sparkle,
      run: go(() => {
        ws.setMarketTab("build");
        ws.setRailSection("market");
      }),
    },
    {
      id: "home",
      group: "Actions",
      label: "Go to Home",
      icon: House,
      run: go(() => ws.setRailSection("home")),
    },
    {
      id: "tasks",
      group: "Actions",
      label: "Go to Tasks",
      icon: CheckSquare,
      run: go(() => ws.setRailSection("tasks")),
    },
    {
      id: "agents",
      group: "Actions",
      label: "Go to Agents",
      icon: Lightning,
      run: go(() => ws.setRailSection("agents")),
    },
    {
      id: "settings",
      group: "Actions",
      label: "Open settings",
      icon: GearSix,
      run: go(() => ws.setRailSection("settings")),
    },
    {
      id: "theme",
      group: "Actions",
      label: `Switch to ${ws.theme === "dark" ? "light" : "dark"} theme`,
      icon: MoonStars,
      run: go(() => ws.toggleTheme()),
    },
    {
      id: "welcome",
      group: "Actions",
      label: "Open the welcome page",
      hint: "Live chart, agent example, 60-second tour",
      icon: Hand,
      run: go(openWelcomePage),
    },
    ...(useAuth.getState().status === "signedOut"
      ? [
          {
            id: "sign-in",
            group: "Actions" as const,
            label: "Sign in",
            hint: "Sync across devices, publish to the marketplace",
            icon: SignIn,
            run: go(() =>
              requestSignIn(
                "Sign in to open this workspace on your other devices.",
              ),
            ),
          },
        ]
      : []),
  ];
  const actions = allActions.filter(
    (a) => !q || a.label.toLowerCase().includes(q),
  );

  const agent: Item[] = q
    ? [
        {
          id: "ask",
          group: "Agent",
          label: `Ask the agent: “${query.trim()}”`,
          hint: "Opens a new chat",
          icon: Lightning,
          run: go(() =>
            askAgent({ prompt: query.trim(), title: query.trim() }),
          ),
        },
      ]
    : [];

  return [...pages.slice(0, 8), ...actions, ...agent];
}

export function CommandPalette() {
  const open = useWorkspace((s) => s.paletteOpen);
  const setOpen = useWorkspace((s) => s.setPaletteOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} width={600} align="top">
      {/* Remounting per open resets query + selection. */}
      {open && <PaletteBody onClose={() => setOpen(false)} />}
    </Modal>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const docs = useWorkspace((s) => s.docs);
  const folders = useWorkspace((s) => s.folders);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(
    () => buildItems(docs, folders, query, onClose),
    [docs, folders, query, onClose],
  );

  const active = Math.min(index, Math.max(items.length - 1, 0));

  useIsomorphicLayoutEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) =>
        items.length ? (i - 1 + items.length) % items.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line-soft px-4">
        <MagnifyingGlass size={16} className="shrink-0 text-ink-3" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search pages, run an action or ask the agent…"
          aria-label="Search"
          spellCheck={false}
          className="h-12 w-full min-w-0 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
        />
        {/* Shown once "Ask the agent" is offered — picks its model. */}
        {query.trim() && <ModelSelect />}
        <kbd>Esc</kbd>
      </div>
      <div ref={listRef} role="listbox" className="overflow-y-auto p-1.5">
        {items.length === 0 && (
          <p className="px-3 py-6 text-center text-[12.5px] text-ink-3">
            Nothing found.
          </p>
        )}
        {items.map((item, i) => {
          const header =
            i === 0 || items[i - 1].group !== item.group ? item.group : null;
          const ItemIcon = item.icon;
          return (
            <div key={item.id}>
              {header && (
                <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                  {header}
                </div>
              )}
              <div
                role="option"
                aria-selected={i === active}
                data-active={i === active || undefined}
                onMouseMove={() => setIndex(i)}
                onClick={item.run}
                className={`flex h-9 cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 transition-colors duration-100 ${
                  i === active ? "bg-hover" : ""
                }`}
              >
                <ItemIcon
                  size={15}
                  className={
                    item.group === "Agent" ? "text-accent" : "text-ink-3"
                  }
                />
                <span className="min-w-0 max-w-[65%] shrink-0 truncate text-[13px] text-ink">
                  {item.label}
                </span>
                {item.hint && (
                  <span className="ml-auto min-w-0 truncate pl-3 text-[11.5px] text-ink-3">
                    {item.hint}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
