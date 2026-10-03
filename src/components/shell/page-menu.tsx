import { useState } from "react";
import {
  CaretLeft,
  CaretRight,
  ArrowLineUp,
  Check,
  ClockCounterClockwise,
  Copy,
  CopySimple,
  FilePlus,
  FolderSimple,
  Globe,
  Lightning,
  PushPin,
  PushPinSlash,
  Stack,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import { trashDoc, useWorkspace } from "@/lib/store";
import { toast } from "@/lib/toast";
import { isHtmlPage } from "@/lib/html-page";
import { exportSite } from "@/lib/site-export";
import { saveAsTemplate } from "@/lib/user-templates";
import type { Doc } from "@/lib/types";

/** Approximate height, used by callers to flip menus near the bottom. */
export const PAGE_MENU_HEIGHT = 370;

const ITEM =
  "flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink";

function MenuButton({
  icon: ItemIcon,
  label,
  onClick,
  danger,
  trailing,
}: {
  icon: Icon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`${ITEM} ${danger ? "hover:!text-danger" : ""}`}
    >
      <ItemIcon size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

/**
 * Page actions shared by the sidebar row menu and the editor header:
 * pin, move, duplicate, copy, ask agent, history, delete.
 */
export function PageMenuItems({
  doc,
  onClose,
  onAskAgent,
}: {
  doc: Doc;
  onClose: () => void;
  /** Shown only where an agent entry point makes sense. */
  onAskAgent?: () => void;
}) {
  const folders = useWorkspace((s) => s.folders);
  const togglePin = useWorkspace((s) => s.togglePin);
  const moveDoc = useWorkspace((s) => s.moveDoc);
  const duplicateDoc = useWorkspace((s) => s.duplicateDoc);
  const createSubpage = useWorkspace((s) => s.createSubpage);
  const setParent = useWorkspace((s) => s.setParent);
  const setHistoryDocId = useWorkspace((s) => s.setHistoryDocId);
  const [moving, setMoving] = useState(false);

  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };

  if (moving) {
    const targets: { id: string | null; name: string }[] = [
      { id: null, name: "No folder" },
      ...folders,
    ];
    return (
      <div role="menu">
        <button
          type="button"
          onClick={() => setMoving(false)}
          className={`${ITEM} text-ink-3`}
        >
          <CaretLeft size={12} />
          Move to…
        </button>
        <div className="my-1 h-px bg-line-soft" />
        <div className="max-h-[180px] overflow-y-auto">
          {targets.map((t) => (
            <MenuButton
              key={t.id ?? "root"}
              icon={FolderSimple}
              label={t.name}
              onClick={done(() => {
                moveDoc(doc.id, t.id);
                toast(`Moved to ${t.id ? t.name : "workspace root"}`);
              })}
              trailing={
                doc.folderId === t.id ? (
                  <Check size={12} className="text-accent" />
                ) : null
              }
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div role="menu">
      {onAskAgent && (
        <>
          <MenuButton
            icon={Lightning}
            label="Ask agent…"
            onClick={done(onAskAgent)}
          />
          <div className="my-1 h-px bg-line-soft" />
        </>
      )}
      <MenuButton
        icon={doc.pinned ? PushPinSlash : PushPin}
        label={doc.pinned ? "Unpin" : "Pin"}
        onClick={done(() => togglePin(doc.id))}
      />
      <MenuButton
        icon={FilePlus}
        label="Add subpage"
        onClick={done(() => createSubpage(doc.id))}
      />
      {doc.parentId && (
        <MenuButton
          icon={ArrowLineUp}
          label="Move out of parent"
          onClick={done(() => setParent(doc.id, null))}
        />
      )}
      <MenuButton
        icon={FolderSimple}
        label="Move to…"
        onClick={() => setMoving(true)}
        trailing={<CaretRight size={11} className="text-ink-3" />}
      />
      <MenuButton
        icon={CopySimple}
        label="Duplicate"
        onClick={done(() => duplicateDoc(doc.id))}
      />
      <MenuButton
        icon={Copy}
        label="Copy as markdown"
        onClick={done(() => {
          const md = `# ${doc.title.trim() || "Untitled"}\n\n${doc.content}`;
          navigator.clipboard?.writeText(md).then(
            () => toast("Copied as markdown"),
            () => toast("Clipboard unavailable", { tone: "error" }),
          );
        })}
      />
      <MenuButton
        icon={ClockCounterClockwise}
        label="Version history"
        onClick={done(() => setHistoryDocId(doc.id))}
      />
      <MenuButton
        icon={Stack}
        label="Save as template"
        onClick={done(() => saveAsTemplate(doc))}
      />
      {isHtmlPage(doc.content) && (
        <MenuButton
          icon={Globe}
          label="Export as website"
          onClick={done(() => {
            exportSite(doc.id).then(
              (saved) => saved && toast("Website exported — unzip it and upload the folder to any static host"),
              (e) => toast(e instanceof Error ? e.message : String(e), { tone: "error" }),
            );
          })}
        />
      )}
      <div className="my-1 h-px bg-line-soft" />
      <MenuButton
        icon={Trash}
        label="Delete"
        danger
        onClick={done(() => trashDoc(doc.id))}
      />
    </div>
  );
}
