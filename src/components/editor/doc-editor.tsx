import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretRight,
  DotsThree,
  Lightning,
  LinkSimple,
  List,
  Note,
  Sparkle,
  FileHtml,
  Storefront,
} from "@phosphor-icons/react";
import { useActiveDoc, useWorkspace } from "@/lib/store";
import { useAgent } from "@/lib/agent-store";
import { PageMenuItems } from "@/components/shell/page-menu";
import { relativeTime } from "@/lib/time";
import type { Doc } from "@/lib/types";
import {
  createBlock,
  parseBlocks,
  serializeBlocks,
  type BlockData,
  type BlockType,
} from "@/lib/blocks";
import { withEmbedState } from "@/lib/embed-state";
import { Block } from "./block";
import { autosizeTextarea, useIsomorphicLayoutEffect } from "./utils";
import { filterSlashItems } from "./slash-items";
import { SlashMenu } from "./slash-menu";
import { ContentsPanel } from "./contents-panel";
import { HtmlPageView } from "./html-page";
import { HTML_PAGE_TEMPLATE, isHtmlPage } from "@/lib/html-page";
import { AskAgentPopover } from "./ask-agent";
import { backlinksTo } from "@/lib/wikilinks";
import { toast } from "@/lib/toast";
import { isoDay, nextRepeatText } from "@/lib/tasks";
import {
  imageFiles,
  isImageFile,
  prepareImage,
  storeFile,
  storeImage,
} from "@/lib/images";
import type { SlashItem } from "./slash-items";

type Snap = {
  blocks: BlockData[];
  title: string;
  focusId: string | null;
  caret: number;
};

/** Event-time helper — kept at module level so the purity rule allows it. */
/**
 * Editor width (px) from which the contents card fits beside the text
 * column (720px, centered) without covering it.
 */
const CONTENTS_MIN_WIDTH = 1100;

/** Identity of a block's content, independent of its (regenerated) id. */
const blockKey = (b: BlockData) => serializeBlocks([b]);

function nowMs() {
  return Date.now();
}

/**
 * Document editor column: breadcrumb top bar, Notion-style typed block
 * editor and the floating contents panel on the right.
 */
export function DocEditor() {
  const doc = useActiveDoc();
  if (!doc) return <EmptyState />;
  // key remounts the editor on doc switch: block state re-initializes from
  // the new doc and the mount-stagger animation replays.
  return <EditorView key={doc.id} doc={doc} />;
}

function EditorView({ doc }: { doc: Doc }) {
  const folders = useWorkspace((s) => s.folders);
  const contentsOpen = useWorkspace((s) => s.contentsOpen);
  const toggleContents = useWorkspace((s) => s.toggleContents);
  const renameDoc = useWorkspace((s) => s.renameDoc);
  const updateDocContent = useWorkspace((s) => s.updateDocContent);

  const [blocks, setBlocks] = useState<BlockData[]>(() =>
    parseBlocks(doc.content),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  // Undo/redo history: snapshots capture blocks + title + caret so a
  // restore lands the user back where the edit happened. Consecutive
  // text edits on the same target coalesce inside an 800ms window.
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissedFor, setSlashDismissedFor] = useState<string | null>(
    null,
  );
  // `0` renders as "just now"; the first deferred tick sets the real time.
  const [now, setNow] = useState(0);
  type Menu = "ask" | "page" | null;
  const [menuState, setMenuState] = useState<Menu>(null);
  // Onboarding and the setup guide can ask for "Ask agent" to open here.
  const askRequested = useWorkspace((s) => s.askAgentDocId === doc.id);
  const requestAskAgent = useWorkspace((s) => s.requestAskAgent);
  const menuOpen: Menu = askRequested ? "ask" : menuState;
  const setMenuOpen = (next: Menu | ((m: Menu) => Menu)) => {
    if (askRequested) requestAskAgent(null);
    setMenuState(typeof next === "function" ? next(menuOpen) : next);
  };
  // Bumped whenever the page changes outside the editor (agent, disk,
  // another device); drives the short "Updated by …" notice.
  const [externalTick, setExternalTick] = useState(0);
  const [externalBy, setExternalBy] = useState<"agent" | "sync">("sync");
  /** Blocks that just changed outside the editor — they glow briefly. */
  const [flashed, setFlashed] = useState<{ ids: Set<string>; tick: number } | null>(
    null,
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Too narrow for the contents card beside the text: it stays hidden
  // and the toggle shows it over the page on demand instead.
  const [narrow, setNarrow] = useState(false);
  const [contentsPeek, setContentsPeek] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setNarrow(entry.contentRect.width < CONTENTS_MIN_WIDTH),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const showContents = narrow ? contentsPeek : contentsOpen;
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const areaRefs = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<{ id: string; offset: number } | null>(null);
  const lastCoalesce = useRef<{ key: string; time: number } | null>(null);
  /** Last markdown this editor wrote (or loaded) for the doc. */
  const lastWritten = useRef(doc.content);
  const blocksRef = useRef(blocks);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  const writeContent = (md: string) => {
    lastWritten.current = md;
    updateDocContent(doc.id, md);
  };

  // HTML pages are edited as source; blocks follow along so turning the
  // page back into markdown (emptying it) starts from its real content.
  const htmlPage = isHtmlPage(doc.content);
  const writeHtml = (md: string) => {
    writeContent(md);
    setBlocks(parseBlocks(md));
  };

  // Live-follow edits made outside the editor — an agent writing the
  // file, the folder watcher, a sync pull. The previous state is pushed
  // onto the undo stack, so Ctrl+Z reverts the external change.
  useEffect(
    () =>
      useWorkspace.subscribe((s, prev) => {
        if (s.docs === prev.docs) return;
        const next = s.docs.find((d) => d.id === doc.id);
        if (!next || next.content === lastWritten.current) return;
        const before = prev.docs.find((d) => d.id === doc.id);
        lastWritten.current = next.content;
        setPast((p) => [
          ...p.slice(-99),
          {
            blocks: blocksRef.current,
            title: before?.title ?? next.title,
            focusId: null,
            caret: 0,
          },
        ]);
        setFuture([]);
        const nextBlocks = parseBlocks(next.content);
        // New or rewritten blocks: their markdown isn't on the page yet.
        const seen = new Set(blocksRef.current.map(blockKey));
        const changed = new Set(
          nextBlocks.filter((b) => !seen.has(blockKey(b))).map((b) => b.id),
        );
        setBlocks(nextBlocks);
        setEditingId(null);
        const agentBusy = useAgent.getState().status === "running";
        setExternalBy(agentBusy ? "agent" : "sync");
        setExternalTick((t) => t + 1);
        if (changed.size > 0) {
          setFlashed((f) => ({ ids: changed, tick: (f?.tick ?? 0) + 1 }));
          // Bring the first change into view if it landed off-screen.
          const first = nextBlocks.find((b) => changed.has(b.id))?.id;
          requestAnimationFrame(() => {
            const root = scrollRef.current;
            const el = root?.querySelector(`[data-block-id="${first}"]`);
            if (!root || !el) return;
            const r = el.getBoundingClientRect();
            const v = root.getBoundingClientRect();
            if (r.top < v.top || r.bottom > v.bottom) {
              el.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          });
        }
      }),
    [doc.id],
  );

  useEffect(() => {
    if (externalTick === 0) return;
    const t = setTimeout(() => setExternalTick(0), 5000);
    return () => clearTimeout(t);
  }, [externalTick]);

  useEffect(() => {
    if (!flashed) return;
    const t = setTimeout(() => setFlashed(null), 2800);
    return () => clearTimeout(t);
  }, [flashed]);

  // Keeps the "Edited … ago" label fresh while the editor sits idle.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  // Auto-grow the title textarea.
  useIsomorphicLayoutEffect(() => {
    autosizeTextarea(titleRef.current);
  }, [doc.title]);

  // Fresh pages start with the caret in the title (decided once per
  // mount — the editor remounts per doc).
  const [autoFocusTitle] = useState(
    () => doc.title === "" && doc.content === "",
  );

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) areaRefs.current.set(id, el);
    else areaRefs.current.delete(id);
  }, []);

  const applyCaret = useCallback((el: HTMLElement, offset: number) => {
    el.focus();
    if (el instanceof HTMLTextAreaElement) {
      const o = Math.max(0, Math.min(offset, el.value.length));
      el.setSelectionRange(o, o);
    }
  }, []);

  const onFocusableReady = useCallback(
    (id: string, el: HTMLElement) => {
      const pf = pendingFocus.current;
      if (pf?.id !== id) return;
      pendingFocus.current = null;
      applyCaret(el, pf.offset);
    },
    [applyCaret],
  );

  // Applies the queued caret when the target element was already mounted;
  // fresh mounts consume it via their ref callback (onFocusableReady).
  useIsomorphicLayoutEffect(() => {
    const pf = pendingFocus.current;
    if (!pf) return;
    const el = areaRefs.current.get(pf.id);
    if (!el) return;
    pendingFocus.current = null;
    applyCaret(el, pf.offset);
  }, [blocks, editingId, applyCaret]);

  const folderName =
    folders.find((f) => f.id === doc.folderId)?.name ?? "Docs";
  const allDocs = useWorkspace((s) => s.docs);
  const relinkTitle = useWorkspace((s) => s.relinkTitle);
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const titleAtFocus = useRef(doc.title);
  /** Pages above this one, outermost first. */
  const ancestors = useMemo(() => {
    const out: Doc[] = [];
    let cur = allDocs.find((d) => d.id === doc.parentId);
    while (cur && out.length < 8 && !out.includes(cur)) {
      out.unshift(cur);
      const next: string | null | undefined = cur.parentId;
      cur = allDocs.find((d) => d.id === next);
    }
    return out;
  }, [allDocs, doc.parentId]);

  const editingBlock = blocks.find((b) => b.id === editingId) ?? null;
  const slashQuery =
    editingBlock !== null &&
    slashDismissedFor !== editingId &&
    editingBlock.type !== "code" &&
    editingBlock.type !== "embed" &&
    editingBlock.type !== "divider"
      ? /^\/(\S{0,24})$/.exec(editingBlock.text)?.[1] ?? null
      : null;
  const slashItems = useMemo(
    () => (slashQuery === null ? [] : filterSlashItems(slashQuery)),
    [slashQuery],
  );
  const slashActiveIndex = Math.min(
    slashIndex,
    Math.max(slashItems.length - 1, 0),
  );

  const getSlashAnchor = useCallback(
    () => areaRefs.current.get(editingId ?? "") ?? null,
    [editingId],
  );

  const snapshot = (): Snap => {
    const el = editingId ? areaRefs.current.get(editingId) : null;
    return {
      blocks,
      title: doc.title,
      focusId: editingId,
      caret:
        el instanceof HTMLTextAreaElement ? el.selectionStart : 0,
    };
  };

  const push = (coalesceKey?: string) => {
    const nowT = nowMs();
    const lc = lastCoalesce.current;
    if (
      coalesceKey &&
      lc &&
      lc.key === coalesceKey &&
      nowT - lc.time < 800
    ) {
      lastCoalesce.current = { key: coalesceKey, time: nowT };
      return;
    }
    lastCoalesce.current = coalesceKey
      ? { key: coalesceKey, time: nowT }
      : null;
    const snap = snapshot();
    setPast((p) => [...p.slice(-99), snap]);
    setFuture([]);
  };

  const restoreSnap = (snap: Snap) => {
    setBlocks(snap.blocks);
    if (snap.title !== doc.title) renameDoc(doc.id, snap.title);
    writeContent(serializeBlocks(snap.blocks));
    lastCoalesce.current = null;
    const target =
      snap.focusId && snap.blocks.some((b) => b.id === snap.focusId)
        ? snap.focusId
        : null;
    if (target) {
      pendingFocus.current = { id: target, offset: snap.caret };
      setEditingId(target);
    } else {
      setEditingId(null);
    }
    setSlashIndex(0);
    setSlashDismissedFor(null);
  };

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setFuture((f) => [...f, snapshot()]);
    setPast((p) => p.slice(0, -1));
    restoreSnap(prev);
  };

  const redo = () => {
    const next = future[future.length - 1];
    if (!next) return;
    setPast((p) => [...p, snapshot()]);
    setFuture((f) => f.slice(0, -1));
    restoreSnap(next);
  };

  // Ctrl+Z also works when nothing is focused — typical right after an
  // agent edit landed and the editor dropped out of edit mode.
  const historyRef = useRef({ undo, redo });
  useEffect(() => {
    historyRef.current = { undo, redo };
  });
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) historyRef.current.redo();
        else historyRef.current.undo();
      } else if (k === "y") {
        e.preventDefault();
        historyRef.current.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onEditorKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (k === "y") {
      e.preventDefault();
      redo();
    }
  };

  const sync = (next: BlockData[], coalesceKey?: string) => {
    push(coalesceKey);
    setBlocks(next);
    writeContent(serializeBlocks(next));
  };

  const patchBlock = (
    id: string,
    patch: Partial<BlockData>,
    coalesceKey?: string,
  ) =>
    sync(
      blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      coalesceKey,
    );

  const updateBlockText = (id: string, text: string) => {
    if (!text.startsWith("/")) setSlashDismissedFor(null);
    setSlashIndex(0);
    patchBlock(id, { text }, `text:${id}`);
  };

  const setTitle = (title: string) => {
    push("title");
    renameDoc(doc.id, title);
  };

  const focusBlock = (id: string, offset: number) => {
    pendingFocus.current = { id, offset };
    setEditingId(id);
    setSlashIndex(0);
    setSlashDismissedFor(null);
  };

  const insertBlockAt = (index: number) => {
    const nb = createBlock();
    const next = [...blocks];
    next.splice(index, 0, nb);
    sync(next);
    focusBlock(nb.id, 0);
  };

  const insertAfter = (id: string) =>
    insertBlockAt(blocks.findIndex((b) => b.id === id) + 1);

  const deleteBlock = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    const next = blocks.filter((b) => b.id !== id);
    sync(next);
    const prev = next[i - 1];
    if (prev) {
      focusBlock(prev.id, prev.text.length);
    } else {
      // First block removed: fall back to the title.
      setEditingId(null);
      titleRef.current?.focus();
    }
  };

  const applyBlockType = (id: string, type: BlockType, text: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const b = blocks[i];
    const next = [...blocks];
    setSlashDismissedFor(null);
    if (type === "divider") {
      const para = createBlock("paragraph", text);
      next[i] = { id: b.id, type: "divider", text: "" };
      next.splice(i + 1, 0, para);
      sync(next);
      focusBlock(para.id, 0);
      return;
    }
    next[i] = {
      ...b,
      type,
      text,
      checked: type === "todo" ? false : undefined,
      lang: type === "code" ? b.lang : undefined,
    };
    sync(next);
    focusBlock(id, 0);
  };

  const splitBlock = (id: string, start: number, end: number) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const b = blocks[i];
    const next = [...blocks];
    if (
      b.text === "" &&
      (b.type === "todo" || b.type === "bullet" || b.type === "numbered")
    ) {
      next[i] = { ...b, type: "paragraph", checked: undefined };
      sync(next);
      pendingFocus.current = { id, offset: 0 };
      return;
    }
    const continues =
      b.type === "todo" || b.type === "bullet" || b.type === "numbered";
    const nb = createBlock(continues ? b.type : "paragraph", b.text.slice(end));
    next[i] = { ...b, text: b.text.slice(0, start) };
    next.splice(i + 1, 0, nb);
    sync(next);
    focusBlock(nb.id, 0);
  };

  const backspaceStart = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const b = blocks[i];
    const prev = blocks[i - 1];
    if (b.type !== "paragraph") {
      if (b.text === "") {
        deleteBlock(id);
        return;
      }
      const next = [...blocks];
      next[i] = { id: b.id, type: "paragraph", text: b.text };
      sync(next);
      pendingFocus.current = { id, offset: 0 };
      return;
    }
    if (!prev) {
      if (b.text === "") deleteBlock(id);
      return;
    }
    if (prev.type === "divider") {
      sync(blocks.filter((x) => x.id !== prev.id));
      pendingFocus.current = { id, offset: 0 };
      return;
    }
    if (
      prev.type === "code" ||
      prev.type === "embed" ||
      prev.type === "image" ||
      prev.type === "file"
    ) {
      // Merging prose into a code/embed block would corrupt it; just move in.
      focusBlock(prev.id, prev.text.length);
      return;
    }
    const join = prev.text.length;
    const next = blocks.filter((x) => x.id !== id);
    next[i - 1] = { ...prev, text: prev.text + b.text };
    sync(next);
    focusBlock(prev.id, join);
  };

  const focusSibling = (id: string, dir: -1 | 1, offset: number) => {
    const i = blocks.findIndex((b) => b.id === id);
    const target = blocks[i + dir];
    if (target) {
      focusBlock(target.id, offset);
    } else if (dir === -1) {
      setEditingId(null);
      titleRef.current?.focus();
    }
  };

  const focusFirstBlock = () => {
    if (blocks[0]) focusBlock(blocks[0].id, 0);
    else insertBlockAt(0);
  };

  // Clicking the empty space below the document continues writing:
  // reuses a trailing empty block, otherwise appends a fresh one.
  const onClickBelow = () => {
    const last = blocks[blocks.length - 1];
    if (!last || last.text !== "" || last.type === "divider") {
      insertBlockAt(blocks.length);
    } else {
      focusBlock(last.id, last.text.length);
    }
  };

  /** Puts image paragraphs after `afterId` (or at the end). */
  const placeImages = (mds: string[], afterId: string | null) => {
    const i = afterId ? blocks.findIndex((b) => b.id === afterId) : -1;
    const made = mds.map((md) =>
      createBlock(md.startsWith("![") ? "image" : "file", md),
    );
    const next = [...blocks];
    const target = i >= 0 ? blocks[i] : null;
    const replace =
      target?.type === "paragraph" && target.text.trim() === "";
    const at = replace ? i : i >= 0 ? i + 1 : next.length;
    next.splice(at, replace ? 1 : 0, ...made);
    const tail = at + made.length >= next.length ? createBlock() : null;
    if (tail) next.push(tail);
    sync(next);
    if (tail) focusBlock(tail.id, 0);
  };
  const placeImagesRef = useRef(placeImages);
  useEffect(() => {
    placeImagesRef.current = placeImages;
  });

  const addImages = async (
    files: File[],
    afterId: string | null,
    asFiles = false,
  ) => {
    const mds: string[] = [];
    for (const f of files) {
      try {
        if (asFiles && !isImageFile(f)) {
          mds.push(await storeFile(f));
        } else {
          const ref = await storeImage(await prepareImage(f), "note");
          mds.push(`![](${ref})`);
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { tone: "error" });
      }
    }
    if (mds.length > 0) placeImagesRef.current(mds, afterId);
  };

  const imageInput = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const imageAfter = useRef<string | null>(null);

  const pickSlash = (item: SlashItem) => {
    if (!editingId) return;
    if (item.action === "image" || item.action === "file") {
      imageAfter.current = editingId;
      patchBlock(editingId, { text: "" });
      setEditingId(null);
      (item.action === "image" ? imageInput : fileInput).current?.click();
      return;
    }
    if (item.action === "ask-agent") {
      // Clear the "/query" text, then open the agent prompt.
      patchBlock(editingId, { text: "" });
      setEditingId(null);
      setMenuOpen("ask");
      return;
    }
    applyBlockType(editingId, item.type, item.preset ?? "");
  };

  const onSlashKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (slashQuery === null) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashIndex((i) =>
        slashItems.length ? (i + 1) % slashItems.length : 0,
      );
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashIndex((i) =>
        slashItems.length
          ? (i - 1 + slashItems.length) % slashItems.length
          : 0,
      );
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = slashItems[slashActiveIndex];
      if (item) pickSlash(item);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSlashDismissedFor(editingId);
      return true;
    }
    return false;
  };

  const onTitleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusFirstBlock();
    } else if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  };

  const ordinals = new Map<string, number>();
  let numberedRun = 0;
  for (const b of blocks) {
    numberedRun = b.type === "numbered" ? numberedRun + 1 : 0;
    ordinals.set(b.id, numberedRun);
  }

  return (
    <div
      className="relative flex h-dvh min-w-0 flex-1 flex-col bg-canvas"
      onKeyDown={onEditorKeyDown}
    >
      {/* top bar */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line-soft px-4">
        <nav className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
          <span className="truncate text-ink-3">{folderName}</span>
          <CaretRight size={10} className="shrink-0 text-ink-3" />
          {ancestors.map((a) => (
            <span key={a.id} className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveDoc(a.id)}
                className="truncate text-ink-3 hover:text-ink-2"
              >
                {a.title.trim() || "Untitled"}
              </button>
              <CaretRight size={10} className="shrink-0 text-ink-3" />
            </span>
          ))}
          <span className="truncate text-ink-2">
            {doc.title.trim() || "Untitled"}
          </span>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={undo}
              disabled={past.length === 0}
              aria-label="Undo (Ctrl+Z)"
              title="Undo (Ctrl+Z)"
              className="grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 ease-out-expo enabled:hover:bg-hover enabled:hover:text-ink-2 disabled:opacity-35"
            >
              <ArrowCounterClockwise size={15} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={future.length === 0}
              aria-label="Redo (Ctrl+Shift+Z)"
              title="Redo (Ctrl+Shift+Z)"
              className="grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 ease-out-expo enabled:hover:bg-hover enabled:hover:text-ink-2 disabled:opacity-35"
            >
              <ArrowClockwise size={15} />
            </button>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {externalTick > 0 ? (
              <motion.span
                key="external"
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-dim px-2 py-0.5 text-[11px] text-accent"
              >
                <Sparkle size={11} weight="fill" />
                {externalBy === "agent" ? "Updated by agent" : "Page updated"}
                <button
                  type="button"
                  onClick={() => {
                    undo();
                    setExternalTick(0);
                  }}
                  title="Undo (Ctrl+Z)"
                  className="-mr-1 rounded-full px-1.5 font-medium underline decoration-accent-line underline-offset-2 hover:bg-accent-dim"
                >
                  Undo
                </button>
              </motion.span>
            ) : (
              <motion.span
                key="edited"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="hidden font-mono text-[11.5px] text-ink-3 lg:inline"
              >
                Edited {relativeTime(doc.updatedAt, now)}
              </motion.span>
            )}
          </AnimatePresence>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((m) => (m === "ask" ? null : "ask"))}
              aria-expanded={menuOpen === "ask"}
              title="Ask the agent to work on this page"
              className={`flex h-7 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12px] transition-colors duration-150 ${
                menuOpen === "ask"
                  ? "border-accent-line bg-accent-dim text-accent"
                  : "border-line bg-panel text-ink-2 hover:bg-hover hover:text-ink"
              }`}
            >
              <Lightning size={13} weight="fill" className="text-accent" />
              Ask agent
            </button>
            <AskAgentPopover
              doc={doc}
              open={menuOpen === "ask"}
              onClose={() => setMenuOpen(null)}
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setMenuOpen((m) => (m === "page" ? null : "page"))
              }
              aria-label="Page actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen === "page"}
              className="grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 ease-out-expo hover:bg-hover hover:text-ink-2"
            >
              <DotsThree size={18} />
            </button>
            <AnimatePresence>
              {menuOpen === "page" && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setMenuOpen(null)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 top-full z-40 mt-1.5 w-[208px] origin-top-right rounded-[8px] border border-line bg-elev p-1 shadow-[0_8px_24px_var(--color-shadow)]"
                  >
                    <PageMenuItems
                      doc={doc}
                      onClose={() => setMenuOpen(null)}
                      onAskAgent={() => setMenuOpen("ask")}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          {!htmlPage && (
            <button
              type="button"
              onClick={() =>
                narrow ? setContentsPeek((p) => !p) : toggleContents()
              }
              aria-label="Toggle contents"
              aria-pressed={showContents}
              className={`grid h-6 w-6 place-items-center rounded-[6px] transition-colors duration-150 ease-out-expo ${
                showContents
                  ? "text-accent"
                  : "text-ink-3 hover:bg-hover hover:text-ink-2"
              }`}
            >
              <List size={16} />
            </button>
          )}
        </div>
      </header>

      {/* document column */}
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = imageFiles(e.currentTarget.files);
          e.currentTarget.value = "";
          if (files.length > 0) void addImages(files, imageAfter.current);
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          if (files.length > 0) void addImages(files, imageAfter.current, true);
        }}
      />
      {htmlPage ? (
        <HtmlPageView doc={doc} onChange={writeHtml} />
      ) : (
        <div
          ref={scrollRef}
          data-image-drop=""
          className="flex-1 overflow-y-auto"
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length === 0) return;
            e.preventDefault();
            void addImages(files, editingId, true);
          }}
          onDragOver={(e) => {
            if (imageFiles(e.dataTransfer.files).length > 0 || e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            const files = imageFiles(e.dataTransfer.files);
            if (files.length === 0) return;
            e.preventDefault();
            void addImages(files, editingId);
          }}
        >
          <div className="mx-auto w-full max-w-[720px] px-6 py-12 md:px-16">
            <textarea
              ref={titleRef}
              rows={1}
              value={doc.title}
              autoFocus={autoFocusTitle}
              placeholder="Untitled"
              aria-label="Document title"
              spellCheck={false}
              onChange={(e) => setTitle(e.currentTarget.value)}
              onKeyDown={onTitleKeyDown}
              onFocus={() => {
                titleAtFocus.current = doc.title;
              }}
              onBlur={() => relinkTitle(doc.id, titleAtFocus.current, doc.title)}
              className="mb-8 block w-full resize-none bg-transparent text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink outline-none placeholder:text-ink-3"
            />

            <div className="flex flex-col">
              {blocks.map((block, i) => (
                <Block
                  key={block.id}
                  block={block}
                  index={i}
                  ordinal={ordinals.get(block.id) ?? 1}
                  editing={editingId === block.id}
                  registerRef={registerRef}
                  onFocusableReady={onFocusableReady}
                  onStartEdit={() => focusBlock(block.id, block.text.length)}
                  onTextChange={(text) => updateBlockText(block.id, text)}
                  onAutoFormat={(type, rest) =>
                    applyBlockType(block.id, type, rest)
                  }
                  onSlashKey={onSlashKey}
                  onSplit={(start, end) => splitBlock(block.id, start, end)}
                  onBackspaceStart={() => backspaceStart(block.id)}
                  onDelete={() => deleteBlock(block.id)}
                  onFocusPrev={(offset) => focusSibling(block.id, -1, offset)}
                  onFocusNext={(offset) => focusSibling(block.id, 1, offset)}
                  onCommit={() =>
                    // Functional update: a blur arriving after focus already
                    // moved to another block must not clear editingId.
                    setEditingId((cur) => (cur === block.id ? null : cur))
                  }
                  onInsertBelow={() => insertAfter(block.id)}
                  onToggleChecked={(checked) => {
                    // Completing a repeating task adds the next one below.
                    const next =
                      checked && !block.checked
                        ? nextRepeatText(block.text, isoDay(new Date()))
                        : null;
                    if (!next) {
                      patchBlock(block.id, { checked });
                      return;
                    }
                    const i = blocks.findIndex((b) => b.id === block.id);
                    const copy = createBlock("todo", next);
                    const list = blocks.map((b) =>
                      b.id === block.id ? { ...b, checked } : b,
                    );
                    list.splice(i + 1, 0, { ...copy, checked: false });
                    sync(list);
                  }}
                  onLangChange={(lang) =>
                    patchBlock(block.id, { lang: lang.trim() || undefined })
                  }
                  flash={
                    flashed?.ids.has(block.id)
                      ? {
                          tick: flashed.tick,
                          // One tag per run of changed blocks.
                          by:
                            i > 0 && flashed.ids.has(blocks[i - 1].id)
                              ? "sync"
                              : externalBy,
                        }
                      : null
                  }
                  onEmbedState={(json) =>
                    patchBlock(
                      block.id,
                      { text: withEmbedState(block.text, json) },
                      `state:${block.id}`,
                    )
                  }
                />
              ))}

              {blocks.length === 0 && (
                <EmptyPageHints
                  onWrite={() => insertBlockAt(0)}
                  onAskAgent={() => setMenuOpen("ask")}
                  onHtml={() => writeHtml(HTML_PAGE_TEMPLATE)}
                />
              )}

              {/* click target for continuing at the end of the document */}
              <div
                className="min-h-[18vh] cursor-text"
                onClick={onClickBelow}
              />
              <Backlinks doc={doc} />
              <div className="min-h-[12vh] cursor-text" onClick={onClickBelow} />
            </div>
          </div>
        </div>
      )}

      <ContentsPanel
        open={showContents && !htmlPage}
        scrollRoot={scrollRef}
        docContent={doc.content}
      />

      <AnimatePresence>
        {slashQuery !== null && (
          <SlashMenu
            key="slash-menu"
            getAnchor={getSlashAnchor}
            items={slashItems}
            activeIndex={slashActiveIndex}
            onHover={setSlashIndex}
            onPick={pickSlash}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Pages that link here with [[this title]]. */
function Backlinks({ doc }: { doc: Doc }) {
  const docs = useWorkspace((s) => s.docs);
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const links = useMemo(() => backlinksTo(docs, doc), [docs, doc]);
  if (links.length === 0) return null;
  return (
    <section className="border-t border-line-soft pt-5">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
        <LinkSimple size={12} />
        Linked from
        <span className="font-mono normal-case tracking-normal">
          {links.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {links.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setActiveDoc(d.id)}
            className="rounded-full border border-line bg-panel px-2.5 py-1 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
          >
            {d.title.trim() || "Untitled"}
          </button>
        ))}
      </div>
    </section>
  );
}

function EmptyPageHints({
  onWrite,
  onAskAgent,
  onHtml,
}: {
  onWrite: () => void;
  onAskAgent: () => void;
  onHtml: () => void;
}) {
  const setRailSection = useWorkspace((s) => s.setRailSection);
  const setMarketTab = useWorkspace((s) => s.setMarketTab);
  const hint =
    "flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2";
  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={onWrite}
        className="cursor-text py-1 text-left text-[15.5px] text-ink-3"
      >
        Start writing, or type / for blocks.
      </button>
      <div className="-ml-2 mt-3 flex flex-col">
        <button type="button" onClick={onAskAgent} className={hint}>
          <Lightning size={14} className="text-accent" />
          Let the agent draft this page
        </button>
        <button
          type="button"
          onClick={() => {
            setMarketTab("discover");
            setRailSection("market");
          }}
          className={hint}
        >
          <Storefront size={14} />
          Start from a template
        </button>
        <button type="button" onClick={onHtml} className={hint}>
          <FileHtml size={14} />
          Make it an HTML page
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  const createDoc = useWorkspace((s) => s.createDoc);
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex h-dvh min-w-0 flex-1 items-center justify-center bg-canvas">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-4"
      >
        <Note size={28} className="text-ink-3" />
        <p className="text-sm text-ink-2">No document selected</p>
        <button
          type="button"
          onClick={() => createDoc()}
          className="h-8 rounded-[8px] border border-line bg-elev px-3 text-[12.5px] text-ink transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.98]"
        >
          New page
        </button>
      </motion.div>
    </div>
  );
}
