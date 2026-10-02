import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CaretRight, DotsThree, FileText, PushPin } from "@phosphor-icons/react";
import {
  DOC_DRAG_TYPE,
  descendantIds,
  isDocDrag,
  useWorkspace,
} from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Doc } from "@/lib/types";
import { PAGE_MENU_HEIGHT, PageMenuItems } from "./page-menu";

const MENU_WIDTH = 196;
const MENU_HEIGHT = PAGE_MENU_HEIGHT;

type MenuPos = {
  left: number;
  top: number;
  flip: boolean;
};

const MAX_DEPTH = 8;

/** Dropping a page on another page nests it there. */
function nestDropped(e: { dataTransfer: DataTransfer }, target: Doc) {
  const id = e.dataTransfer.getData(DOC_DRAG_TYPE);
  const st = useWorkspace.getState();
  const dragged = st.docs.find((d) => d.id === id);
  if (!dragged || dragged.id === target.id || dragged.parentId === target.id) {
    return;
  }
  if (descendantIds(st.docs, id).has(target.id)) {
    toast("A page can't go inside its own subpage", { tone: "error" });
    return;
  }
  st.setParent(id, target.id);
  toast(
    `Moved “${dragged.title.trim() || "Untitled"}” under “${target.title.trim() || "Untitled"}”`,
  );
}

export function DocRow({
  doc,
  index = 0,
  indicatorId = "doc-active",
  depth = 0,
  flat = false,
}: {
  doc: Doc;
  index?: number;
  indicatorId?: string;
  depth?: number;
  /** Don't list subpages under this row (pinned section). */
  flat?: boolean;
}) {
  const active = useWorkspace((s) => s.activeDocId === doc.id);
  const setActiveDoc = useWorkspace((s) => s.setActiveDoc);
  const allDocs = useWorkspace((s) => s.docs);
  const children = useMemo(
    () =>
      flat || depth >= MAX_DEPTH
        ? []
        : allDocs.filter((d) => d.parentId === doc.id),
    [allDocs, doc.id, flat, depth],
  );
  const [expanded, setExpanded] = useState(true);

  const dotsRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<MenuPos | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const openMenu = () => {
    const rect = dotsRef.current?.getBoundingClientRect();
    if (!rect) return;
    const flip = rect.bottom + 6 + MENU_HEIGHT > window.innerHeight;
    setMenu({
      left: Math.max(8, Math.round(rect.right) - MENU_WIDTH),
      top: flip
        ? Math.round(rect.top) - MENU_HEIGHT - 6
        : Math.round(rect.bottom) + 6,
      flip,
    });
  };

  const DocIcon = doc.pinned ? PushPin : FileText;
  const [dropOver, setDropOver] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.28,
        delay: Math.min(index * 0.025, 0.25),
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DOC_DRAG_TYPE, doc.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!isDocDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropOver(true);
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={(e) => {
          if (!isDocDrag(e)) return;
          e.preventDefault();
          e.stopPropagation();
          setDropOver(false);
          nestDropped(e, doc);
        }}
        onClick={() => setActiveDoc(doc.id)}
        style={depth > 0 ? { marginLeft: depth * 12 } : undefined}
        className={`group relative flex h-7 items-center gap-2 rounded-[6px] px-2 text-[13px] transition-colors duration-150 ${
          active ? "bg-elev text-ink" : "text-ink-2 hover:bg-hover"
        } ${dropOver ? "ring-1 ring-accent-line" : ""}`}
      >
        {active && (
          <motion.span
            layoutId={indicatorId}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
            className="absolute inset-y-0 left-0 my-auto h-3.5 w-[2px] rounded-full bg-accent"
          />
        )}
        {children.length > 0 ? (
          <button
            type="button"
            aria-label={expanded ? "Collapse subpages" : "Expand subpages"}
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="-ml-1 grid h-4 w-4 shrink-0 place-items-center rounded-[4px] text-ink-3 hover:bg-line hover:text-ink"
          >
            <CaretRight
              size={11}
              className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : null}
        <DocIcon size={15} className="shrink-0 text-ink-3" />
        <span className="flex-1 truncate">
          {doc.title.trim() === "" ? "Untitled" : doc.title}
        </span>
        <button
          ref={dotsRef}
          type="button"
          aria-label="Page actions"
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          onClick={(e) => {
            e.stopPropagation();
            openMenu();
          }}
          className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-ink-3 transition-[opacity,color,background-color] duration-150 hover:bg-line hover:text-ink ${
            menu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <DotsThree size={16} />
        </button>

        {typeof document !== "undefined" &&
          createPortal(
            // Portals bubble through the React tree — keep menu clicks
            // from reaching the row's own onClick.
            <div onClick={(e) => e.stopPropagation()}>
              <AnimatePresence>
                {menu && (
                  <motion.div
                    key="doc-menu-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="fixed inset-0 z-40"
                    onClick={() => setMenu(null)}
                    onWheel={() => setMenu(null)}
                    onContextMenu={() => setMenu(null)}
                  />
                )}
                {menu && (
                  <motion.div
                    key="doc-menu"
                    role="menu"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                    style={{ left: menu.left, top: menu.top }}
                    className={`fixed z-50 w-[196px] rounded-[8px] border border-line bg-elev p-1 shadow-[0_8px_24px_var(--color-shadow)] ${
                      menu.flip ? "origin-bottom-right" : "origin-top-right"
                    }`}
                  >
                    <PageMenuItems doc={doc} onClose={() => setMenu(null)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>,
            document.body,
          )}
      </div>
      {expanded &&
        children.map((child, i) => (
          <DocRow
            key={child.id}
            doc={child}
            index={index + 1 + i}
            indicatorId={indicatorId}
            depth={depth + 1}
          />
        ))}
    </motion.div>
  );
}
