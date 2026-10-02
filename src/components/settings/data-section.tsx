import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";
import { toast } from "@/lib/toast";
import { useWorkspace } from "@/lib/store";
import { requestSignIn, useAuth } from "@/lib/auth-store";
import {
  deleteAccount,
  exportWorkspace,
  findUnusedFiles,
  formatBytes,
  removeUnusedFiles,
  type UnusedFiles,
} from "@/lib/data-tools";
import { Card, Row, SectionTitle, SmallButton } from "./settings-ui";

export function DataSection() {
  const user = useAuth((s) => s.user);
  const setHistoryDocId = useWorkspace((s) => s.setHistoryDocId);
  const [exporting, setExporting] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [unused, setUnused] = useState<UnusedFiles | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const runExport = async () => {
    setExporting("Preparing…");
    try {
      if (await exportWorkspace(setExporting)) toast("Export saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    } finally {
      setExporting(null);
    }
  };

  const scan = async () => {
    setScanning(true);
    try {
      setUnused(await findUnusedFiles());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    } finally {
      setScanning(false);
    }
  };

  const clean = async () => {
    if (!unused) return;
    setCleaning(true);
    try {
      await removeUnusedFiles(unused);
      toast(`Removed ${unused.paths.length} unused ${unused.paths.length === 1 ? "file" : "files"}`);
      setUnused(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <section>
      <SectionTitle
        title="Data & backup"
        sub="Your pages are yours: take a copy any time, bring back deleted pages, and remove everything when you leave."
      />

      <Card>
        <Row
          label="Export everything"
          desc="A .zip with all pages as markdown (folders and subpages as directories), your agent chats, and every image and file."
        >
          <SmallButton onClick={() => void runExport()}>
            {exporting ?? "Export .zip"}
          </SmallButton>
        </Row>
        <Row
          label="Recently deleted"
          desc="Pages deleted in the past 60 days can be restored — even after a sync problem. Every page also keeps its earlier versions (page menu → Version history)."
        >
          <SmallButton onClick={() => setHistoryDocId("trash")}>Open</SmallButton>
        </Row>
        {user && (
          <Row
            label="Unused files"
            desc={
              unused
                ? unused.paths.length === 0
                  ? "Nothing to clean up."
                  : `${unused.paths.length} ${unused.paths.length === 1 ? "file" : "files"} (${formatBytes(unused.bytes)}) that no page, version or chat uses any more. Cleaned automatically once a week.`
                : "Images and files from deleted pages or chats stay stored until cleaned up — automatically once a week."
            }
          >
            {unused && unused.paths.length > 0 ? (
              <SmallButton accent onClick={() => void clean()}>
                {cleaning ? "Removing…" : "Remove them"}
              </SmallButton>
            ) : (
              <SmallButton onClick={() => void scan()}>
                {scanning ? "Checking…" : "Check now"}
              </SmallButton>
            )}
          </Row>
        )}
      </Card>

      <h3 className="mb-2 mt-8 text-[12.5px] font-medium text-danger">Danger zone</h3>
      <Card>
        <Row
          label="Delete account"
          desc="Permanently deletes your account, pages, version history, chats, skills and uploaded files, and takes down your marketplace listings. Files already on this computer stay."
        >
          {user ? (
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="h-7 shrink-0 rounded-[7px] border border-danger/40 px-2.5 text-[12px] text-danger transition-colors hover:bg-danger/10"
            >
              Delete…
            </button>
          ) : (
            <SmallButton
              onClick={() => requestSignIn("Sign in to manage your account.")}
            >
              Sign in
            </SmallButton>
          )}
        </Row>
      </Card>

      {deleting && user && (
        <DeleteAccountDialog email={user.email} onClose={() => setDeleting(false)} />
      )}
    </section>
  );
}

function DeleteAccountDialog({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const ok = typed.trim().toLowerCase() === email.toLowerCase();

  const exportFirst = async () => {
    try {
      setSaved(await exportWorkspace());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const run = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    const err = await deleteAccount();
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
    toast("Your account was deleted");
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} title="Delete account" width={460}>
      <div className="flex flex-col gap-4 p-4 text-[13px] text-ink-2">
        <p>
          This can't be undone. Pages, version history, chats and uploaded
          files are removed from our servers right away.
        </p>
        <div className="flex items-center justify-between gap-3 rounded-[8px] border border-line-soft bg-panel-2 px-3 py-2">
          <span className="text-[12.5px]">
            {saved ? "Export saved." : "Want a copy first?"}
          </span>
          <SmallButton onClick={() => void exportFirst()}>Export .zip</SmallButton>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-2">
            Type <span className="font-mono text-ink">{email}</span> to confirm
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            spellCheck={false}
            autoFocus
            className="w-full rounded-[7px] border border-line bg-panel-2 px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-danger"
          />
        </label>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-line-soft pt-4">
          <button type="button" onClick={onClose} disabled={busy} className={btn.secondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={!ok || busy}
            className="h-8 rounded-[8px] bg-danger px-3 text-[12.5px] font-medium text-white transition-opacity disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
