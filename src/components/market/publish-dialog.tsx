import { useState } from "react";
import { Globe } from "@phosphor-icons/react";
import type { Doc } from "@/lib/types";
import { useMarket } from "@/lib/marketplace";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "@/lib/templates";
import { toast } from "@/lib/toast";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";

const FIELD =
  "mt-1.5 w-full rounded-[8px] border border-line bg-panel-2 px-3 text-[13px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 focus:border-accent-line";
const LABEL = "block text-[11.5px] font-medium text-ink-3";

/** Publishes a snapshot of a page as a community marketplace listing. */
export function PublishDialog({
  doc,
  onClose,
}: {
  doc: Doc | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={doc !== null}
      onClose={onClose}
      title="Publish to marketplace"
      width={480}
    >
      {doc && <PublishForm key={doc.id} doc={doc} onClose={onClose} />}
    </Modal>
  );
}

function PublishForm({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const publish = useMarket((s) => s.publish);
  const [title, setTitle] = useState(doc.title.trim() || "Untitled");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("Planning");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    const err = await publish({
      title: title.trim(),
      description: description.trim(),
      category,
      content: doc.content,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    toast(`Published “${title.trim()}” to the marketplace`);
    onClose();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <label className={LABEL}>Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          className={`${FIELD} h-9`}
        />
      </div>
      <div>
        <label className={LABEL}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          rows={3}
          placeholder="What does this page help people do?"
          className={`${FIELD} resize-none py-2 leading-relaxed`}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Category</label>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.currentTarget.value as TemplateCategory)
            }
            className={`${FIELD} h-9`}
          >
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Price</label>
          <select className={`${FIELD} h-9`} defaultValue="free">
            <option value="free">Free</option>
            <option value="paid" disabled>
              Paid — coming soon
            </option>
          </select>
        </div>
      </div>
      <p className="flex gap-2 rounded-[8px] border border-dashed border-line px-3 py-2.5 text-[12px] leading-relaxed text-ink-3">
        <Globe size={14} className="mt-0.5 shrink-0" />
        Everyone signed in to CoTenk can preview and install a copy. This
        publishes a snapshot — later edits to your page do not change the
        listing.
      </p>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btn.secondary}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !title.trim()}
          className={btn.primary}
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
    </div>
  );
}
