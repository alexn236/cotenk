import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowsOut,
  Check,
  FileHtml,
  PencilSimple,
  Plus,
  Sparkle,
  Trash,
} from "@phosphor-icons/react";
import { looksLikeEmbed, serializeBlocks } from "@/lib/blocks";
import type { BlockData, BlockType } from "@/lib/blocks";
import { useWorkspace } from "@/lib/store";
import { decorateTaskText } from "@/lib/tasks";
import {
  embedApiScript,
  embedThemeCss,
  MAX_EMBED_STATE,
  splitEmbedState,
} from "@/lib/embed-state";
import { Markdown } from "./markdown";
import { Modal } from "@/components/ui/modal";
import { embedAsHtmlPage } from "@/lib/html-page";
import { FileBody, ImageBody } from "./attachment-blocks";
import { useSuggest } from "@/components/ui/use-suggest";
import { autosizeTextarea, useIsomorphicLayoutEffect } from "./utils";
import { celebrate } from "@/lib/celebrate";
import { handleFrameNavigation } from "@/lib/frame-links";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

const MULTILINE_TYPES: ReadonlySet<BlockType> = new Set([
  "paragraph",
  "quote",
  "code",
  "embed",
]);

/** Types where plain Enter inserts a newline instead of splitting —
 *  code and embed are authored like an editor, committed via Done/Esc. */
const ENTER_INSERTS_NEWLINE: ReadonlySet<BlockType> = new Set([
  "code",
  "embed",
]);

const AUTOFORMAT_RE = /^(#{1,3}|[-*+]|\d+\.|\[\s?\]|>) $/;

function typeForMarker(marker: string): BlockType {
  if (marker.startsWith("#")) return `h${marker.length}` as BlockType;
  if (marker === ">") return "quote";
  if (marker.startsWith("[")) return "todo";
  if (/^\d+\.$/.test(marker)) return "numbered";
  return "bullet";
}

const PLACEHOLDERS: Partial<Record<BlockType, string>> = {
  paragraph: "Write, or type / for blocks",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  bullet: "List item",
  numbered: "List item",
  todo: "To-do",
  quote: "Quote",
  code: "Code",
  embed: "<div>...</div>",
};

const CARET_STYLE_PROPS = [
  "box-sizing",
  "width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-indent",
  "text-transform",
  "tab-size",
  "word-break",
] as const;

/**
 * True when the textarea caret sits on its first/last visual line.
 * A hidden mirror div copies the box + font metrics so soft-wrapped
 * lines count, not just explicit newlines.
 */
function caretOnVisualEdge(
  el: HTMLTextAreaElement,
  edge: "first" | "last",
): boolean {
  const cs = getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const p of CARET_STYLE_PROPS) {
    mirror.style.setProperty(p, cs.getPropertyValue(p));
  }
  mirror.style.position = "absolute";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.height = "auto";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.textContent = el.value.slice(0, el.selectionStart);
  const marker = document.createElement("span");
  marker.textContent = String.fromCharCode(0x200b);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const caretTop =
    marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
  const mirrorHeight = mirror.getBoundingClientRect().height;
  mirror.remove();
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const lineHeight =
    parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2 || 16;
  const rel = caretTop - padTop;
  const contentHeight = mirrorHeight - padTop - padBottom;
  return edge === "first"
    ? rel <= lineHeight * 0.5
    : rel + lineHeight >= contentHeight - 1;
}

const EMBED_HEIGHT_SCRIPT = `<script>(function(){var s=function(){var b=document.body;var h=Math.max(b?b.scrollHeight:0,document.documentElement.scrollHeight);parent.postMessage({cotenkEmbedHeight:h},"*")};window.addEventListener("load",s);try{new ResizeObserver(s).observe(document.body)}catch(e){}s()})();</script>`;

/**
 * Wraps embed HTML in a full document. The current theme is injected as
 * --ck-* variables (e.g. var(--ck-accent)) so agent-built widgets match
 * light and dark mode without knowing either.
 */
function embedDoc(html: string, scheme: string, state: string | null): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${embedThemeCss(scheme)}html,body{margin:0;padding:0;background:transparent}body{color:var(--ck-ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}</style>${embedApiScript(state)}</head><body>${html}${EMBED_HEIGHT_SCRIPT}</body></html>`;
}

export type BlockProps = {
  block: BlockData;
  index: number;
  /** 1-based position among consecutive numbered blocks. */
  ordinal: number;
  editing: boolean;
  registerRef: (id: string, el: HTMLElement | null) => void;
  /** Fires when the block's focusable element mounts. */
  onFocusableReady: (id: string, el: HTMLElement) => void;
  onStartEdit: () => void;
  onTextChange: (text: string) => void;
  /** Marker autoformat: switch type, keep `rest` as the new text. */
  onAutoFormat: (type: BlockType, rest: string) => void;
  /** Returns true when the slash menu consumed the key. */
  onSlashKey: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Enter: split text at the caret range into a new block below. */
  onSplit: (start: number, end: number) => void;
  /** Backspace with the caret at offset 0. */
  onBackspaceStart: () => void;
  /** Delete a selected (non-text) block. */
  onDelete: () => void;
  onFocusPrev: (offset: number) => void;
  onFocusNext: (offset: number) => void;
  /** Blur / Escape: leave edit mode. */
  onCommit: () => void;
  /** Gutter plus button: insert an empty paragraph below this one. */
  onInsertBelow: () => void;
  onToggleChecked: (checked: boolean) => void;
  onLangChange: (lang: string) => void;
  /** An embed called cotenk.save(data) — `json` is the new state. */
  onEmbedState: (json: string) => void;
  /**
   * Set when this block just changed outside the editor (an agent wrote
   * it): plays the highlight sweep; "agent" also shows the tag.
   */
  flash?: { tick: number; by: "agent" | "sync" } | null;
};

/**
 * One typed document block. Renders its serialized markdown when idle
 * and a marker-less textarea while editing (Notion style). Dividers
 * select instead of editing; embeds render a sandboxed iframe.
 */
export function Block({
  block,
  index,
  ordinal,
  editing,
  registerRef,
  onFocusableReady,
  onStartEdit,
  onTextChange,
  onAutoFormat,
  onSlashKey,
  onSplit,
  onBackspaceStart,
  onDelete,
  onFocusPrev,
  onFocusNext,
  onCommit,
  onInsertBelow,
  onToggleChecked,
  onLangChange,
  onEmbedState,
  flash,
}: BlockProps) {
  const reduceMotion = useReducedMotion();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editWrapRef = useRef<HTMLDivElement | null>(null);
  const getEditAnchor = useCallback(() => editWrapRef.current, []);
  // "@" people and agents, "[[" pages, "due:" dates — in prose blocks.
  const suggest = useSuggest({
    ref: textareaRef,
    value: block.text,
    onChange: onTextChange,
    mode: "page",
    enabled:
      editing &&
      block.type !== "code" &&
      block.type !== "embed" &&
      block.type !== "divider" &&
      block.type !== "image" &&
      block.type !== "file",
  });

  // Callback refs: the edit element mounts deferred (AnimatePresence
  // mode="wait"), so registration + queued caret apply on attach.
  const setTextareaRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      registerRef(block.id, el);
      if (el) {
        autosizeTextarea(el);
        onFocusableReady(block.id, el);
      }
    },
    [block.id, registerRef, onFocusableReady],
  );
  const setDividerRef = useCallback(
    (el: HTMLDivElement | null) => {
      registerRef(block.id, el);
      if (el) onFocusableReady(block.id, el);
    },
    [block.id, registerRef, onFocusableReady],
  );

  // Keep the textarea height in sync with the source while editing.
  useIsomorphicLayoutEffect(() => {
    if (editing) autosizeTextarea(textareaRef.current);
  }, [editing, block.text, block.type]);

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const value = el.value;
    const ie = e.nativeEvent as InputEvent;
    // Pasted (or typed) raw HTML becomes a real embed block immediately.
    if (block.type === "paragraph" && looksLikeEmbed(value)) {
      onAutoFormat("embed", value);
      return;
    }
    if (block.type === "paragraph" && ie.inputType === "insertText") {
      const caret = el.selectionStart;
      const head = value.slice(0, caret);
      if (ie.data === " ") {
        const m = AUTOFORMAT_RE.exec(head);
        if (m) {
          onAutoFormat(typeForMarker(m[1]), value.slice(caret));
          return;
        }
      } else if (ie.data === "-" && head === "---") {
        onAutoFormat("divider", value.slice(caret));
        return;
      } else if (ie.data === "`" && head === "```") {
        onAutoFormat("code", value.slice(caret));
        return;
      }
    }
    onTextChange(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggest.onKeyDown(e)) return;
    if (onSlashKey(e)) return;
    const el = e.currentTarget;
    switch (e.key) {
      case "Enter":
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          onCommit();
          break;
        }
        if (ENTER_INSERTS_NEWLINE.has(block.type)) break;
        if (e.shiftKey && MULTILINE_TYPES.has(block.type)) break;
        e.preventDefault();
        onSplit(el.selectionStart, el.selectionEnd);
        break;
      case "Backspace":
        if (el.selectionStart === 0 && el.selectionEnd === 0) {
          e.preventDefault();
          onBackspaceStart();
        }
        break;
      case "ArrowUp":
        if (caretOnVisualEdge(el, "first")) {
          e.preventDefault();
          onFocusPrev(el.selectionStart);
        }
        break;
      case "ArrowDown":
        if (caretOnVisualEdge(el, "last")) {
          e.preventDefault();
          onFocusNext(el.selectionStart);
        }
        break;
      case "Escape":
        e.preventDefault();
        onCommit();
        break;
    }
  };

  const onDividerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "Backspace":
      case "Delete":
        e.preventDefault();
        onDelete();
        break;
      case "Enter":
        e.preventDefault();
        onInsertBelow();
        break;
      case "ArrowUp":
        e.preventDefault();
        onFocusPrev(Number.MAX_SAFE_INTEGER);
        break;
      case "ArrowDown":
        e.preventDefault();
        onFocusNext(0);
        break;
      case "Escape":
        e.preventDefault();
        onCommit();
        break;
    }
  };

  /** Selected image / file: Backspace removes it, unless a caption is being typed. */
  const onAttachmentKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        e.currentTarget.focus();
      }
      return;
    }
    onDividerKeyDown(e);
  };

  const onEditBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      onCommit();
    }
  };

  const onViewClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Let links and task checkboxes keep their own behavior.
    if (target.closest("a, input, button")) return;
    onStartEdit();
  };

  const renderedMd =
    block.type === "numbered"
      ? `${Math.max(1, ordinal)}. ${block.text}`
      : block.type === "todo"
        ? serializeBlocks([{ ...block, text: decorateTaskText(block.text) }])
        : serializeBlocks([block]);

  const typo =
    block.type === "h1"
      ? "text-[29px] [font-weight:650] leading-[1.25] tracking-[-0.02em] text-ink"
      : block.type === "h2"
        ? "text-[22px] [font-weight:620] leading-[1.3] tracking-[-0.02em] text-ink"
        : block.type === "h3"
          ? "text-[17.5px] font-semibold leading-[1.4] text-ink"
          : block.type === "code" || block.type === "embed"
            ? "font-mono text-[13px] leading-[1.65] text-ink"
            : block.type === "quote"
              ? "text-[15.5px] leading-[1.72] text-ink-2"
              : "text-[15.5px] leading-[1.72] text-ink";

  const marker =
    block.type === "bullet" ? (
      <span aria-hidden className="flex w-[22px] shrink-0 items-start">
        <span className="ml-[4px] mt-[15px] h-[5px] w-[5px] rounded-full bg-ink-3" />
      </span>
    ) : block.type === "numbered" ? (
      <span
        aria-hidden
        className="w-[22px] shrink-0 pr-[5px] pt-[8px] text-right font-mono text-[13px] leading-none text-ink-3"
      >
        {Math.max(1, ordinal)}.
      </span>
    ) : block.type === "todo" ? (
      <span className="flex w-[22px] shrink-0 items-start">
        <button
          type="button"
          tabIndex={-1}
          aria-label={block.checked ? "Mark task open" : "Mark task done"}
          aria-pressed={block.checked}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if (!block.checked) celebrate(e.currentTarget);
            onToggleChecked(!block.checked);
          }}
          className={`mt-[10px] grid h-[14px] w-[14px] place-items-center rounded-[4px] border-[1.5px] transition-colors duration-150 ease-out-expo ${
            block.checked
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-panel-2 hover:border-ink-3"
          }`}
        >
          {block.checked ? <Check size={10} weight="bold" /> : null}
        </button>
      </span>
    ) : null;

  const swapTransition = { duration: 0.12, ease: "easeOut" } as const;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: Math.min(index, 12) * 0.03,
        ease: [0.16, 1, 0.3, 1],
      }}
      data-block-id={block.id}
      className={`group relative rounded-[6px] ${
        index === 0
          ? ""
          : block.type === "h1"
            ? "mt-8"
            : block.type === "h2"
              ? "mt-6"
              : block.type === "h3"
                ? "mt-4"
                : ""
      }`}
    >
      {flash && !reduceMotion && (
        <span
          key={flash.tick}
          aria-hidden
          className="agent-flash pointer-events-none absolute -inset-x-3 -inset-y-1 rounded-[8px]"
        >
          {flash.by === "agent" && (
            <span className="agent-flash-tag absolute -top-2.5 right-2 inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-px text-[10px] font-medium text-on-accent shadow-[0_2px_8px_var(--color-shadow)]">
              <Sparkle size={9} weight="fill" />
              agent
            </span>
          )}
        </span>
      )}
      <button
        type="button"
        aria-label="Add block below"
        tabIndex={-1}
        onClick={onInsertBelow}
        className="absolute -left-8 top-1.5 hidden h-5 w-5 place-items-center rounded-[6px] text-ink-3 opacity-0 transition-opacity duration-150 ease-out-expo hover:bg-hover hover:text-ink-2 group-hover:opacity-100 md:grid"
      >
        <Plus size={14} />
      </button>

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div
            key="edit"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.995 }}
            transition={swapTransition}
          >
            {block.type === "image" || block.type === "file" ? (
              <div
                ref={setDividerRef}
                role="button"
                tabIndex={-1}
                aria-label={block.type === "image" ? "Image, selected" : "File, selected"}
                onKeyDown={onAttachmentKeyDown}
                onBlur={onEditBlur}
                className="rounded-[8px] outline-2 outline-offset-2 outline-accent"
              >
                {block.type === "image" ? (
                  <ImageBody
                    md={block.text}
                    selected
                    onChange={onTextChange}
                    onDelete={onDelete}
                  />
                ) : (
                  <FileBody md={block.text} selected onDelete={onDelete} />
                )}
              </div>
            ) : block.type === "divider" ? (
              <div
                ref={setDividerRef}
                role="button"
                tabIndex={-1}
                aria-label="Divider, selected"
                onKeyDown={onDividerKeyDown}
                onBlur={onCommit}
                className="cursor-pointer rounded-[4px] py-2 outline-2 outline-offset-2 outline-accent"
              >
                <hr className="border-t border-line" />
              </div>
            ) : (
              <div
                ref={editWrapRef}
                className="-mx-2 rounded-[8px] bg-panel-2 px-2"
                onBlur={onEditBlur}
              >
                {block.type === "code" && (
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <input
                      value={block.lang ?? ""}
                      onChange={(e) => onLangChange(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          onCommit();
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          textareaRef.current?.focus();
                        }
                      }}
                      placeholder="lang"
                      aria-label="Code language"
                      spellCheck={false}
                      className="w-20 border-b border-transparent bg-transparent pb-0.5 text-right font-mono text-[11px] text-ink-3 outline-none transition-colors duration-150 ease-out-expo placeholder:text-ink-3 focus:border-line focus:text-ink-2"
                    />
                    <button
                      type="button"
                      onClick={onCommit}
                      className="rounded-[6px] bg-accent px-2 py-0.5 text-[11px] font-medium text-on-accent transition-[background-color,transform] duration-150 ease-out-expo hover:bg-accent-2 active:scale-[0.97]"
                    >
                      Done
                    </button>
                  </div>
                )}
                <div
                  className={
                    block.type === "quote"
                      ? "flex border-l-2 border-accent-line pl-[17px]"
                      : "flex"
                  }
                >
                  {marker}
                  <textarea
                    ref={setTextareaRef}
                    rows={1}
                    value={block.text}
                    spellCheck={false}
                    wrap={block.type === "code" ? "off" : "soft"}
                    placeholder={PLACEHOLDERS[block.type] ?? "Empty block"}
                    aria-label="Block text"
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                    {...suggest.fieldProps}
                    className={`block w-full resize-none bg-transparent py-1 outline-none placeholder:text-ink-3 ${typo}`}
                  />
                  {suggest.menu}
                </div>
                {block.type === "embed" && (
                  <EmbedPreview
                    html={block.text}
                    getAnchor={getEditAnchor}
                    onDone={onCommit}
                    onDelete={onDelete}
                  />
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="view"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.995 }}
            transition={swapTransition}
          >
            {block.type === "image" || block.type === "file" ? (
              <div className="cursor-pointer" onClick={onStartEdit}>
                {block.type === "image" ? (
                  <ImageBody
                    md={block.text}
                    selected={false}
                    onChange={onTextChange}
                    onDelete={onDelete}
                  />
                ) : (
                  <FileBody md={block.text} selected={false} onDelete={onDelete} />
                )}
              </div>
            ) : block.type === "divider" ? (
              <div
                role="button"
                tabIndex={-1}
                aria-label="Divider"
                className="cursor-pointer py-2"
                onClick={onStartEdit}
              >
                <hr className="border-t border-line" />
              </div>
            ) : block.type === "embed" ? (
              <EmbedView
                html={block.text}
                onStartEdit={onStartEdit}
                onSave={onEmbedState}
              />
            ) : (
              <div
                className="min-h-[1.72em] cursor-text"
                onClick={onViewClick}
              >
                <Markdown
                  onToggleTask={
                    block.type === "todo"
                      ? (_ordinal, checked) => onToggleChecked(checked)
                      : undefined
                  }
                >
                  {renderedMd}
                </Markdown>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Sandboxed embed iframe whose height follows the injected
 * ResizeObserver's postMessage reports.
 */
export function EmbedFrame({
  html,
  title,
  maxHeight = 1200,
  framed = true,
  onSave,
}: {
  html: string;
  title: string;
  maxHeight?: number;
  /** Border + surface; off for embeds sitting in the page. */
  framed?: boolean;
  /** Receives cotenk.save() payloads (JSON). Omit for read-only frames. */
  onSave?: (json: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(80);
  // Re-render the frame when the app theme flips so --ck-* stay in sync.
  const theme = useWorkspace((s) => s.theme);
  const { body, state } = splitEmbedState(html);
  // The frame only reloads when the embed's code or the theme changes —
  // a saved-state update (the widget's own cotenk.save) must not reset
  // the widget mid-interaction. Latched on change, React's derive-state
  // pattern.
  const [frame, setFrame] = useState({ body, theme, state });
  if (frame.body !== body || frame.theme !== theme) {
    setFrame({ body, theme, state });
  }
  const srcDoc = useMemo(
    () => embedDoc(frame.body, frame.theme, frame.state),
    [frame],
  );
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (handleFrameNavigation(e.data)) return;
      const data = e.data as { cotenkEmbedHeight?: unknown; cotenkSave?: unknown };
      const h = data?.cotenkEmbedHeight;
      if (typeof h === "number" && Number.isFinite(h)) {
        setHeight(Math.min(maxHeight, Math.max(80, Math.ceil(h))));
      }
      const json = data?.cotenkSave;
      if (typeof json === "string" && json.length <= MAX_EMBED_STATE) {
        // Sliders fire saves per pixel — write the last one.
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => onSaveRef.current?.(json), 250);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [maxHeight]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      title={title}
      style={{ height }}
      className={`block w-full rounded-[8px] ${
        framed ? "border border-line bg-elev" : "bg-transparent"
      }`}
    />
  );
}

/**
 * Live preview shown while editing an embed block. Floats to the right
 * of the block on wide screens, stacks below the textarea on narrow
 * ones. Done/Delete live on the card header. The html is deferred so
 * fast typing doesn't reload the iframe every keystroke.
 */
function EmbedPreview({
  html,
  getAnchor,
  onDone,
  onDelete,
}: {
  html: string;
  getAnchor: () => HTMLElement | null;
  onDone: () => void;
  onDelete: () => void;
}) {
  const deferred = useDeferredValue(html);
  const reduceMotion = useReducedMotion();
  const floating = useMediaQuery("(min-width: 1280px)");
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!floating) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = getAnchor();
      if (!el) return;
      const r = el.getBoundingClientRect();
      // As wide as the space beside the text allows (340–560px).
      const w = Math.max(340, Math.min(560, window.innerWidth - r.right - 36));
      setPos({
        left: Math.min(r.right + 20, window.innerWidth - w - 16),
        top: Math.max(64, Math.min(r.top - 4, window.innerHeight - 220)),
        width: w,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [floating, getAnchor]);

  const card = (
    <div className="overflow-hidden rounded-[10px] border border-line bg-panel shadow-[0_16px_48px_var(--color-shadow)]">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-2.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
          Preview
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete embed block"
            title="Delete block"
            className="grid h-6 w-6 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 ease-out-expo hover:bg-hover hover:text-danger"
          >
            <Trash size={13} />
          </button>
          <button
            type="button"
            onClick={onDone}
            className="h-6 rounded-[6px] bg-accent px-2 text-[11px] font-medium text-on-accent transition-[background-color,transform] duration-150 ease-out-expo hover:bg-accent-2 active:scale-[0.97]"
          >
            Done
          </button>
        </div>
      </div>
      <div className="p-2">
        <EmbedFrame html={deferred} title="HTML preview" />
      </div>
    </div>
  );

  if (!floating) {
    return <div className="pb-2 pt-1">{card}</div>;
  }
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        width: pos?.width ?? 340,
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed z-40"
    >
      {card}
    </motion.div>
  );
}

const EMBED_TOOL =
  "grid h-7 w-7 place-items-center rounded-[6px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink";

/**
 * Idle embed block: the raw HTML runs inside a sandboxed iframe that sits
 * in the page without chrome. Hovering shows edit, full-screen and
 * "open as HTML page".
 */
function EmbedView({
  html,
  onStartEdit,
  onSave,
}: {
  html: string;
  onStartEdit: () => void;
  onSave: (json: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const createDocWith = useWorkspace((s) => s.createDocWith);
  return (
    <div className="group/embed relative rounded-[10px] ring-1 ring-transparent transition-[box-shadow] duration-150 hover:ring-line">
      <EmbedFrame
        html={html}
        title="Embedded HTML"
        framed={false}
        onSave={onSave}
      />
      <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-[8px] border border-line bg-panel/95 p-0.5 opacity-0 shadow-[0_6px_20px_var(--color-shadow)] backdrop-blur transition-opacity duration-150 group-focus-within/embed:pointer-events-auto group-focus-within/embed:opacity-100 group-hover/embed:pointer-events-auto group-hover/embed:opacity-100">
        <button
          type="button"
          onClick={onStartEdit}
          title="Edit HTML"
          aria-label="Edit HTML"
          className={EMBED_TOOL}
        >
          <PencilSimple size={14} />
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Full screen"
          aria-label="Show full screen"
          className={EMBED_TOOL}
        >
          <ArrowsOut size={14} />
        </button>
        <button
          type="button"
          onClick={() =>
            createDocWith({ title: "Embed", content: embedAsHtmlPage(html) })
          }
          title="Open as HTML page"
          aria-label="Open as HTML page"
          className={EMBED_TOOL}
        >
          <FileHtml size={14} />
        </button>
      </div>
      <Modal
        open={expanded}
        onClose={() => setExpanded(false)}
        title="Embed"
        width={1200}
      >
        {expanded && (
          <div className="p-4">
            <EmbedFrame
              html={html}
              title="Embedded HTML, full screen"
              maxHeight={Math.max(400, window.innerHeight - 180)}
              framed={false}
              onSave={onSave}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
