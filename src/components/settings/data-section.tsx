import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";
import { toast } from "@/lib/toast";
import { useWorkspace } from "@/lib/store";
import { clearLocalData, exportWorkspace } from "@/lib/data-tools";
import { isDesktop } from "@/lib/workspace";
import { Card, Row, SectionTitle, SmallButton } from "./settings-ui";

export function DataSection() {
  const setHistoryDocId = useWorkspace((s) => s.setHistoryDocId);
  const [exporting, setExporting] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

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

  return (
    <section>
      <SectionTitle
        title="Data & backup"
        sub="Everything lives on this device. Take a copy any time, bring back deleted pages, or start over."
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
          desc="Pages deleted in the past 60 days can be restored. Every page also keeps its earlier versions (page menu → Version history)."
        >
          <SmallButton onClick={() => setHistoryDocId("trash")}>Open</SmallButton>
        </Row>
      </Card>

      <h3 className="mb-2 mt-8 text-[12.5px] font-medium text-danger">Danger zone</h3>
      <Card>
        <Row
          label="Clear local data"
          desc={`Removes the pages, chats, history and settings this app keeps in its storage and starts fresh.${
            isDesktop()
              ? " The files in your workspace folder stay — the app reads them back in on the next start."
              : ""
          }`}
        >
          <button
            type="button"
            onClick={() => setClearing(true)}
            className="h-7 shrink-0 rounded-[7px] border border-danger/40 px-2.5 text-[12px] text-danger transition-colors hover:bg-danger/10"
          >
            Clear…
          </button>
        </Row>
      </Card>

      {clearing && <ClearDataDialog onClose={() => setClearing(false)} />}
    </section>
  );
}

function ClearDataDialog({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportFirst = async () => {
    try {
      setSaved(await exportWorkspace());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal open onClose={onClose} title="Clear local data" width={460}>
      <div className="flex flex-col gap-4 p-4 text-[13px] text-ink-2">
        <p>
          This can't be undone. Pages, chats, version history and settings
          stored by the app are removed.
        </p>
        <div className="flex items-center justify-between gap-3 rounded-[8px] border border-line-soft bg-panel-2 px-3 py-2">
          <span className="text-[12.5px]">
            {saved ? "Export saved." : "Want a copy first?"}
          </span>
          <SmallButton onClick={() => void exportFirst()}>Export .zip</SmallButton>
        </div>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-line-soft pt-4">
          <button type="button" onClick={onClose} className={btn.secondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={clearLocalData}
            className="h-8 rounded-[8px] bg-danger px-3 text-[12.5px] font-medium text-white transition-opacity"
          >
            Clear everything
          </button>
        </div>
      </div>
    </Modal>
  );
}
