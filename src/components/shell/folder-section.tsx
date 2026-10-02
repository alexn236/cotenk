import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  CaretRight,
  DotsThree,
  FolderSimple,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { dropDocInto, isDocDrag, trashFolder, useWorkspace } from "@/lib/store";
import { DocRow } from "./doc-row";
import type { Doc, Folder } from "@/lib/types";

const MENU_W = 172;
const MENU_H = 104;

const ITEM =
  "flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink";

export function FolderSection({
  folder,
  docs,
  index = 0,
  indicatorId = "doc-active",
}: {
  folder: Folder;
  docs: Doc[];
  index?: number;
  indicatorId?: string;
}) {
  const [open, setOpen] = useState(true);
  const renaming = useWorkspace((s) => s.renamingFolderId === folder.id);
  const setRenaming = useWorkspace((s) => s.setRenamingFolderId);
  const renameFolder = useWorkspace((s) => s.renameFolder);
  const createDoc = useWorkspace((s) => s.createDoc);
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(
    null,
  );
  const dotsRef = useRef<HTMLButtonElement>(null);
  const [dropOver, setDropOver] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const openMenu = () => {
    const r = dotsRef.current?.getBoundingClientRect();
    if (!r) return;
    const flip = r.bottom + 6 + MENU_H > window.innerHeight;
    setMenu({
      left: Math.max(8, Math.round(r.right) - MENU_W),
      top: flip ? Math.round(r.top) - MENU_H - 6 : Math.round(r.bottom) + 6,
    });
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: 0.28,
          delay: Math.min(index * 0.025, 0.25),
          ease: [0.16, 1, 0.3, 1],
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
          setDropOver(false);
          setOpen(true);
          dropDocInto(e, folder.id);
        }}
        className={`group flex h-7 w-full items-center gap-1.5 rounded-[6px] px-2 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-hover ${
          dropOver ? "bg-accent-dim text-ink ring-1 ring-accent-line" : ""
        }`}
      >
        {renaming ? (
          <>
            <CaretRight
              size={12}
              className={`shrink-0 text-ink-3 ${open ? "rotate-90" : ""}`}
            />
            <FolderSimple size={15} className="shrink-0 text-ink-3" />
            <RenameInput
              initial={folder.name}
              onDone={(name) => {
                if (name.trim()) renameFolder(folder.id, name.trim());
                setRenaming(null);
              }}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              onDoubleClick={() => setRenaming(folder.id)}
              aria-expanded={open}
              title="Double-click to rename"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <CaretRight
                size={12}
                className={`shrink-0 text-ink-3 transition-transform duration-150 ${
                  open ? "rotate-90" : ""
                }`}
              />
              <FolderSimple size={15} className="shrink-0 text-ink-3" />
              <span className="truncate">{folder.name}</span>
            </button>
            <button
              type="button"
              aria-label={`New page in ${folder.name}`}
              title="New page here"
              onClick={() => {
                setOpen(true);
                createDoc(folder.id);
              }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-ink-3 opacity-0 transition-[opacity,color,background-color] duration-150 hover:bg-line hover:text-ink group-hover:opacity-100"
            >
              <Plus size={13} />
            </button>
            <button
              ref={dotsRef}
              type="button"
              aria-label="Folder actions"
              aria-haspopup="menu"
              onClick={openMenu}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-ink-3 transition-[opacity,color,background-color] duration-150 hover:bg-line hover:text-ink ${
                menu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <DotsThree size={16} />
            </button>
          </>
        )}
      </motion.div>

      {typeof document !== "undefined" &&
        createPortal(
          // Portals bubble through the React tree — keep menu clicks
          // from reaching the row's own onClick.
          <div onClick={(e) => e.stopPropagation()}>
            <AnimatePresence>
              {menu && (
                <motion.div
                  key="folder-menu-backdrop"
                  className="fixed inset-0 z-40"
                  onClick={() => setMenu(null)}
                  onWheel={() => setMenu(null)}
                />
              )}
              {menu && (
                <motion.div
                  key="folder-menu"
                  role="menu"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                  style={{ left: menu.left, top: menu.top, width: MENU_W }}
                  className="fixed z-50 origin-top-right rounded-[8px] border border-line bg-elev p-1 shadow-[0_8px_24px_var(--color-shadow)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={ITEM}
                    onClick={() => {
                      setMenu(null);
                      setOpen(true);
                      createDoc(folder.id);
                    }}
                  >
                    <Plus size={14} />
                    New page here
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={ITEM}
                    onClick={() => {
                      setMenu(null);
                      setRenaming(folder.id);
                    }}
                  >
                    <PencilSimple size={14} />
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={`${ITEM} hover:!text-danger`}
                    onClick={() => {
                      setMenu(null);
                      trashFolder(folder.id);
                    }}
                  >
                    <Trash size={14} />
                    Delete folder
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>,
          document.body,
        )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="folder-docs"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pl-4">
              {docs.length === 0 ? (
                <p className="px-2 py-1 text-[11.5px] text-ink-3">
                  Empty folder
                </p>
              ) : (
                docs.map((doc, i) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    index={index + 1 + i}
                    indicatorId={indicatorId}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={name}
      onChange={(e) => setName(e.currentTarget.value)}
      onBlur={() => onDone(name)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(name);
        if (e.key === "Escape") onDone(initial);
      }}
      aria-label="Folder name"
      className="h-5 w-full min-w-0 rounded-[4px] border border-line bg-panel-2 px-1 text-[12.5px] text-ink outline-none focus:border-accent-line"
    />
  );
}
