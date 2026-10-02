import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  DownloadSimple,
  FileArrowUp,
  FolderOpen,
  Notebook,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/lib/store";
import { toast } from "@/lib/toast";
import { isImageFile } from "@/lib/images";
import type { RawFile } from "@/lib/importer";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";

type ImportModule = typeof import("@/lib/import-actions");

/**
 * Snapshot of a drop's entries. Runs synchronously in the drop handler —
 * the DataTransfer is emptied once the event returns, before the
 * (code-split) importer has loaded.
 */
function snapshotDrop(dt: DataTransfer) {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== "file") continue;
    const e = item.webkitGetAsEntry?.();
    if (e) entries.push(e);
  }
  return { entries, files: Array.from(dt.files) };
}

const hasFiles = (e: DragEvent) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

/**
 * Import entry points: a window-wide drop zone (drop a Notion .zip, an
 * Obsidian vault folder or .md files anywhere) and the Import dialog
 * with file/folder pickers. The importer itself loads on first use.
 */
export function ImportLayer() {
  const open = useWorkspace((s) => s.importOpen);
  const setOpen = useWorkspace((s) => s.setImportOpen);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const depth = useRef(0);
  const reduceMotion = useReducedMotion();

  const importFrom = useCallback(
    async (collect: (m: ImportModule) => Promise<RawFile[]>) => {
      setBusy(true);
      try {
        const mod = await import("@/lib/import-actions");
        const files = await collect(mod);
        // Let the "Importing…" state paint before the synchronous parse.
        await new Promise((r) => setTimeout(r, 30));
        mod.runImport(files);
      } catch (e) {
        toast(
          `Import failed: ${e instanceof Error ? e.message : String(e)}`,
          { tone: "error" },
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      // Pictures dropped on a page or the agent composer are inserted there.
      const files = Array.from(e.dataTransfer.files);
      if (
        files.length > 0 &&
        files.every(isImageFile) &&
        (e.target as Element | null)?.closest?.("[data-image-drop]")
      ) {
        return;
      }
      const snap = snapshotDrop(e.dataTransfer);
      void importFrom((m) => m.filesFromDrop(snap));
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [importFrom]);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const dirInput = useRef<HTMLInputElement | null>(null);
  const setDirInput = useCallback((el: HTMLInputElement | null) => {
    dirInput.current = el;
    el?.setAttribute("webkitdirectory", "");
  }, []);

  const onPicked = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    void importFrom((m) => m.filesFromList(files));
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".md,.markdown,.txt,.csv,.zip"
        className="hidden"
        onChange={(e) => {
          onPicked(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={setDirInput}
        type="file"
        className="hidden"
        onChange={(e) => {
          onPicked(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />

      <AnimatePresence>
        {(dragging || busy) && (
          <motion.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-0 z-[80] grid place-items-center bg-canvas/70 p-6 backdrop-blur-[3px]"
          >
            <motion.div
              initial={reduceMotion ? false : { scale: 0.97, y: 6 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex w-full max-w-[520px] flex-col items-center rounded-[16px] border-2 border-dashed border-accent-line bg-panel px-8 py-10 text-center shadow-[0_24px_64px_var(--color-shadow)]"
            >
              <DownloadSimple size={26} className="text-accent" />
              <div className="mt-3 text-[16px] font-semibold text-ink">
                {busy ? "Importing…" : "Drop to import"}
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
                Notion export (.zip) · Obsidian vault · .md, .txt and .csv
                files — they become pages, links and databases included.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Import notes"
        width={520}
      >
        <div className="p-5">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center rounded-[12px] border-2 border-dashed border-line px-6 py-8 text-center transition-colors duration-150 hover:border-accent-line hover:bg-panel-2"
          >
            <FileArrowUp size={24} className="text-accent" />
            <span className="mt-2.5 text-[13.5px] font-medium text-ink">
              {busy ? "Importing…" : "Drop files here or choose them"}
            </span>
            <span className="mt-1 text-[12px] text-ink-3">
              You can also drop them anywhere on the window.
            </span>
          </button>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className={`${btn.secondary} flex-1`}
            >
              <FileArrowUp size={13} />
              Choose files…
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => dirInput.current?.click()}
              className={`${btn.secondary} flex-1`}
            >
              <FolderOpen size={13} />
              Choose a folder…
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-3 text-[12.5px] leading-relaxed text-ink-3">
            <Source title="Notion">
              Settings → Export all workspace content → <b>Markdown &amp; CSV</b>,
              include subpages. Drop the .zip as it is — id suffixes, links
              between pages and CSV databases are converted.
            </Source>
            <Source title="Obsidian">
              Choose your vault folder. Folders become folders, [[links]]
              keep working, tags from frontmatter are kept.
            </Source>
            <Source title="Markdown">
              Any .md or .txt files. A leading “# Title” becomes the page
              title. Images up to 512 KB come along.
            </Source>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Source({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <Notebook size={15} className="mt-0.5 shrink-0 text-ink-3" />
      <p>
        <span className="font-medium text-ink-2">{title}. </span>
        {children}
      </p>
    </div>
  );
}
