import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Code, Columns, Eye } from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import type { Doc } from "@/lib/types";
import {
  MAX_EMBED_STATE,
  splitEmbedState,
  withEmbedState,
} from "@/lib/embed-state";
import { HTML_PAGE_TEMPLATE, htmlPageDoc } from "@/lib/html-page";

type Mode = "preview" | "split" | "code";

const MODES: { id: Mode; label: string; Icon: typeof Eye }[] = [
  { id: "preview", label: "Preview", Icon: Eye },
  { id: "split", label: "Split", Icon: Columns },
  { id: "code", label: "Code", Icon: Code },
];

/**
 * Body of an HTML page: the document running full-size in a sandboxed
 * frame, its source in a code pane, or both side by side. `onChange`
 * writes the page content (the editor treats it as its own edit).
 */
export function HtmlPageView({
  doc,
  onChange,
}: {
  doc: Doc;
  onChange: (content: string) => void;
}) {
  const renameDoc = useWorkspace((s) => s.renameDoc);
  const relinkTitle = useWorkspace((s) => s.relinkTitle);
  const titleAtFocus = useRef(doc.title);
  // A fresh page opens next to its code; an existing one shows the page.
  const [mode, setMode] = useState<Mode>(() =>
    doc.content === HTML_PAGE_TEMPLATE ? "split" : "preview",
  );

  // The frame reloads ~300ms after typing stops, not per keystroke.
  const [shown, setShown] = useState(doc.content);
  useEffect(() => {
    if (shown === doc.content) return;
    const t = setTimeout(() => setShown(doc.content), 300);
    return () => clearTimeout(t);
  }, [doc.content, shown]);

  const latest = useRef(doc.content);
  useEffect(() => {
    latest.current = doc.content;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line-soft px-4">
        <input
          value={doc.title}
          placeholder="Untitled"
          aria-label="Page title"
          spellCheck={false}
          onChange={(e) => renameDoc(doc.id, e.currentTarget.value)}
          onFocus={() => {
            titleAtFocus.current = doc.title;
          }}
          onBlur={() => relinkTitle(doc.id, titleAtFocus.current, doc.title)}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-[-0.01em] text-ink outline-none placeholder:text-ink-3"
        />
        <span className="hidden shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3 sm:inline">
          HTML page
        </span>
        <div
          role="radiogroup"
          aria-label="View"
          className="flex shrink-0 items-center rounded-[7px] border border-line bg-panel-2 p-0.5"
        >
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => setMode(id)}
              className={`flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 text-[11.5px] transition-colors duration-150 ${
                mode === id ? "bg-elev text-ink" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {mode !== "preview" && (
          <CodePane
            value={doc.content}
            onChange={onChange}
            className={mode === "split" ? "w-1/2 border-r border-line-soft" : "flex-1"}
          />
        )}
        {mode !== "code" && (
          <HtmlPageFrame
            content={shown}
            title={doc.title.trim() || "HTML page"}
            onSave={(json) => onChange(withEmbedState(latest.current, json))}
          />
        )}
      </div>
    </div>
  );
}

function CodePane({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab indents instead of leaving the editor.
    if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = el;
    onChange(`${value.slice(0, a)}  ${value.slice(b)}`);
    requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
  };
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      onKeyDown={onKeyDown}
      spellCheck={false}
      wrap="off"
      aria-label="HTML source"
      className={`${className} min-w-0 resize-none bg-panel px-5 py-4 font-mono text-[12.5px] leading-[1.65] text-ink outline-none`}
    />
  );
}

/**
 * The page itself, filling the pane. Reloads when its code or the theme
 * changes — not when it saves state, so a widget isn't reset mid-use.
 */
export function HtmlPageFrame({
  content,
  title,
  onSave,
}: {
  content: string;
  title: string;
  /** Receives cotenk.save() payloads. Omit for read-only previews. */
  onSave?: (json: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const theme = useWorkspace((s) => s.theme);
  const { body } = splitEmbedState(content);
  const [frame, setFrame] = useState({ body, theme, content });
  if (frame.body !== body || frame.theme !== theme) {
    setFrame({ body, theme, content });
  }
  const srcDoc = useMemo(
    () => htmlPageDoc(frame.content, frame.theme),
    [frame],
  );
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const json = (e.data as { cotenkSave?: unknown })?.cotenkSave;
      if (typeof json !== "string" || json.length > MAX_EMBED_STATE) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onSaveRef.current?.(json), 250);
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-forms"
      srcDoc={srcDoc}
      title={title}
      className="block min-w-0 flex-1 border-0 bg-canvas"
    />
  );
}
