import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Markdown } from "@/components/editor/markdown";
import { btn } from "@/components/ui/styles";
import { useWorkspace } from "@/lib/store";
import { toast } from "@/lib/toast";
import {
  listTrash,
  listVersions,
  purgeVersion,
  restoreDeleted,
  restoreVersion,
  type Version,
} from "@/lib/history";

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Version history of the open page, or — for `docId === "trash"` — the
 * pages deleted in the past 60 days. Both are kept on this device.
 */
export function HistoryDialog({
  docId,
  onClose,
}: {
  docId: string;
  onClose: () => void;
}) {
  const trash = docId === "trash";
  const doc = useWorkspace((s) => s.docs.find((d) => d.id === docId) ?? null);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (trash ? listTrash() : listVersions(docId))
      .then((v) => {
        if (!live) return;
        setVersions(v);
        setPicked(v[0]?.id ?? null);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [docId, trash]);

  const current = versions?.find((v) => v.id === picked) ?? null;

  const restore = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      if (trash) {
        restoreDeleted(current);
        toast(`Restored “${current.title.trim() || "Untitled"}”`);
        setVersions((vs) => (vs ?? []).filter((v) => v.id !== current.id));
        setPicked(null);
      } else if (doc) {
        await restoreVersion(doc, current);
        toast("Version restored — the previous state is in the history");
        onClose();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await purgeVersion(current.id);
      setVersions((vs) => (vs ?? []).filter((v) => v.id !== current.id));
      setPicked(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={820}
      title={
        trash
          ? "Recently deleted"
          : `Version history — ${doc?.title.trim() || "Untitled"}`
      }
    >
      {error ? (
        <p className="p-6 text-[13px] text-danger">{error}</p>
      ) : versions === null ? (
        <p className="p-6 text-[13px] text-ink-3">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="p-6 text-[13px] text-ink-3">
          {trash
            ? "Nothing deleted in the past 60 days."
            : "No earlier versions yet. A version is saved when you start editing after a pause of 10 minutes."}
        </p>
      ) : (
        <div className="flex h-[min(520px,70vh)]">
          <ul className="w-[230px] shrink-0 overflow-y-auto border-r border-line-soft p-2">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setPicked(v.id)}
                  className={`flex w-full flex-col rounded-[7px] px-2.5 py-1.5 text-left transition-colors duration-150 ${
                    picked === v.id ? "bg-elev" : "hover:bg-hover"
                  }`}
                >
                  <span className="truncate text-[12.5px] text-ink">
                    {trash ? v.title.trim() || "Untitled" : when(v.createdAt)}
                  </span>
                  <span className="truncate text-[11px] text-ink-3">
                    {trash
                      ? `Deleted ${when(v.createdAt)}`
                      : `${v.title.trim() || "Untitled"} · ${v.content.length} chars`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {current ? (
                <>
                  <h3 className="mb-3 text-[22px] font-semibold text-ink">
                    {current.title.trim() || "Untitled"}
                  </h3>
                  <Markdown>{current.content}</Markdown>
                </>
              ) : (
                <p className="text-[13px] text-ink-3">Pick a version.</p>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line-soft px-4 py-3">
              <div>
                {trash && current && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void purge()}
                    className={`${btn.ghost} hover:text-danger`}
                  >
                    Delete permanently
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={!current || busy}
                onClick={() => void restore()}
                className={btn.primary}
              >
                {trash ? "Restore page" : "Restore this version"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
