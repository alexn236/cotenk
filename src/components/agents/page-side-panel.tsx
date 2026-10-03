import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowSquareOut,
  CaretDown,
  Crosshair,
  FileText,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { followAgentEnabled, setFollowAgent } from "@/lib/agent-panel";
import { PageEditor } from "@/components/editor/doc-editor";

/**
 * A page next to the agent chat, so you can read along while the agent
 * works. With "Follow agent" on, the chat opens it on whichever page the
 * agent is changing (see AgentsView); the editor's own highlight shows
 * the blocks it wrote. Any page can be picked by hand — picking one turns
 * following off.
 */

const WIDTH_KEY = "cotenk-agents-panel-width";

const MIN_W = 340;
const MAX_W = 900;

function readNumber(key: string, fallback: number) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeLs(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function PageSidePanel({
  docId,
  flashFrom,
  onPick,
  onClose,
}: {
  docId: string | null;
  /** Content before the agent change that opened this page (for the glow). */
  flashFrom: { id: string; content: string } | null;
  /** A page picked by hand. */
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const doc = useWorkspace((s) => s.docs.find((d) => d.id === docId) ?? null);
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const [width, setWidth] = useState(() =>
    Math.min(MAX_W, Math.max(MIN_W, readNumber(WIDTH_KEY, 520))),
  );
  const [follow, setFollow] = useState(followAgentEnabled);
  const [picking, setPicking] = useState(false);
  const toggleFollow = () => {
    setFollow((f) => {
      setFollowAgent(!f);
      return !f;
    });
  };

  // Drag the left edge to resize.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let next = startW;
    const move = (ev: PointerEvent) => {
      next = Math.min(MAX_W, Math.max(MIN_W, startW + (startX - ev.clientX)));
      setWidth(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      writeLs(WIDTH_KEY, String(Math.round(next)));
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <aside
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col border-l border-line-soft bg-canvas"
      aria-label="Page next to the chat"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize page panel"
        onPointerDown={startResize}
        className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize transition-colors duration-150 hover:bg-accent-line"
      />
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line-soft px-3">
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            aria-haspopup="listbox"
            aria-expanded={picking}
            className="flex h-7 min-w-0 max-w-[260px] items-center gap-1.5 rounded-[7px] px-2 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
          >
            <FileText size={14} className="shrink-0 text-ink-3" />
            <span className="truncate">
              {doc ? doc.title.trim() || "Untitled" : "Pick a page"}
            </span>
            <CaretDown size={11} className="shrink-0 text-ink-3" />
          </button>
          <PagePicker
            open={picking}
            current={docId}
            onPick={(id) => {
              setPicking(false);
              if (follow) toggleFollow();
              onPick(id);
            }}
            onClose={() => setPicking(false)}
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleFollow}
            aria-pressed={follow}
            title={
              follow
                ? "Following the agent — the page it changes opens here"
                : "Follow the agent"
            }
            className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] transition-colors duration-150 ${
              follow
                ? "border-accent-line bg-accent-dim text-accent"
                : "border-line text-ink-3 hover:text-ink-2"
            }`}
          >
            <Crosshair size={12} weight={follow ? "bold" : "regular"} />
            Follow agent
          </button>
          {doc && (
            <button
              type="button"
              onClick={() => setActiveDoc(doc.id)}
              aria-label="Open in Documents"
              title="Open in Documents"
              className="grid h-7 w-7 place-items-center rounded-[7px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
            >
              <ArrowSquareOut size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close page panel"
            title="Close"
            className="grid h-7 w-7 place-items-center rounded-[7px] text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink-2"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {doc ? (
          <PageEditor
            key={doc.id}
            doc={doc}
            flashFrom={flashFrom?.id === doc.id ? flashFrom.content : undefined}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <FileText size={22} className="text-ink-3" />
            <p className="text-[13px] text-ink-2">No page open</p>
            <p className="max-w-[260px] text-[12px] leading-relaxed text-ink-3">
              Pick a page above, or let the agent work — the page it changes
              opens here.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function PagePicker({
  open,
  current,
  onPick,
  onClose,
}: {
  open: boolean;
  current: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const docs = useWorkspace((s) => s.docs);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...docs]
      .filter((d) => !q || (d.title || "Untitled").toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
  }, [docs, query]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 top-full z-40 mt-1.5 w-[300px] origin-top-left rounded-[10px] border border-line bg-elev p-1.5 shadow-[0_12px_32px_var(--color-shadow)]"
          >
            <div className="flex items-center gap-2 rounded-[7px] border border-line-soft bg-panel-2 px-2 py-1.5">
              <MagnifyingGlass size={13} className="shrink-0 text-ink-3" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onClose();
                  if (e.key === "Enter" && list[0]) onPick(list[0].id);
                }}
                placeholder="Search pages"
                aria-label="Search pages"
                className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
              />
            </div>
            <ul role="listbox" className="mt-1 max-h-[320px] overflow-y-auto">
              {list.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={d.id === current}
                    onClick={() => onPick(d.id)}
                    className={`flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] transition-colors duration-100 ${
                      d.id === current
                        ? "bg-accent-dim text-ink"
                        : "text-ink-2 hover:bg-hover hover:text-ink"
                    }`}
                  >
                    <FileText size={14} className="shrink-0 text-ink-3" />
                    <span className="truncate">{d.title.trim() || "Untitled"}</span>
                  </button>
                </li>
              ))}
              {list.length === 0 && (
                <li className="px-2 py-3 text-[12px] text-ink-3">No pages match.</li>
              )}
            </ul>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
