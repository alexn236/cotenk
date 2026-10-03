import { create } from "zustand";
import { newId } from "./ids";
import { useAgent } from "./agent-store";
import { useWorkspace } from "./store";
import { toast } from "./toast";
import type { Doc } from "./types";

/**
 * Templates you made yourself — saved from any page ("Save as template")
 * or built with AI. Kept on this device next to the built-in ones.
 */

export type UserTemplate = {
  id: string;
  title: string;
  description: string;
  content: string;
  createdAt: number;
};

const KEY = "cotenk-user-templates";

function load(): UserTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v)
      ? v.filter(
          (t): t is UserTemplate =>
            !!t && typeof t.id === "string" && typeof t.content === "string",
        )
      : [];
  } catch {
    return [];
  }
}

/** First plain sentence of a page — the card's description. */
function describe(content: string): string {
  if (/^\s*(<!doctype|<html)/i.test(content)) {
    return /<title[^>]*>([^<]*)<\/title>/i.exec(content)?.[1]?.trim() || "HTML page";
  }
  const line = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^(#|<|-|\||>|```|\d+\.)/.test(l));
  return (line ?? "").replace(/[*_`[\]]/g, "").slice(0, 140);
}

type State = {
  items: UserTemplate[];
  saveFromDoc: (doc: Doc) => UserTemplate;
  remove: (id: string) => void;
};

export const useUserTemplates = create<State>((set, get) => ({
  items: typeof window !== "undefined" ? load() : [],
  saveFromDoc: (doc) => {
    const t: UserTemplate = {
      id: newId(),
      title: doc.title.trim() || "Untitled",
      description: describe(doc.content),
      content: doc.content,
      createdAt: Date.now(),
    };
    set({ items: [t, ...get().items] });
    return t;
  },
  remove: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

useUserTemplates.subscribe((s, prev) => {
  if (s.items === prev.items) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s.items));
  } catch {
    /* storage unavailable or full */
  }
});

const showTemplates = () => {
  const ws = useWorkspace.getState();
  ws.setMarketTab("discover");
  ws.setRailSection("market");
};

/** Saves a page as a template and says so (with a way to look). */
export function saveAsTemplate(doc: Doc) {
  useUserTemplates.getState().saveFromDoc(doc);
  toast(`Saved “${doc.title.trim() || "Untitled"}” as a template`, {
    action: { label: "View", run: showTemplates },
  });
}

/**
 * Build with AI: once the agent's turn is over, every page it created
 * becomes a template too. The file watcher adopts new pages a moment
 * after the turn ends, so the check waits a little.
 */
export function captureBuiltPages() {
  const before = new Set(useWorkspace.getState().docs.map((d) => d.id));
  let seenRunning = false;
  const unsub = useAgent.subscribe((s) => {
    if (s.status === "running" || s.status === "starting") {
      seenRunning = true;
      return;
    }
    if (!seenRunning) return;
    unsub();
    setTimeout(() => {
      const fresh = useWorkspace.getState().docs.filter((d) => !before.has(d.id));
      for (const d of fresh) useUserTemplates.getState().saveFromDoc(d);
      if (fresh.length > 0) {
        toast(
          fresh.length === 1
            ? `“${fresh[0].title.trim() || "Untitled"}” is now in your templates`
            : `${fresh.length} pages are now in your templates`,
          { action: { label: "View", run: showTemplates } },
        );
      }
    }, 2500);
  });
}
