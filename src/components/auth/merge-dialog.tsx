import { FileText } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";
import {
  acceptMerge,
  declineMerge,
  type MergeOffer,
} from "@/lib/local-merge";
import { isDesktop } from "@/lib/workspace";
import { toast } from "@/lib/toast";

const SHOWN = 6;

/**
 * Asked once after signing in when this device has pages of its own:
 * move them into the account, or leave them on the device.
 */
export function MergeDialog({
  offer,
  userId,
  onClose,
}: {
  offer: MergeOffer;
  userId: string;
  onClose: () => void;
}) {
  const n = offer.docs.length;
  const pages = `${n} ${n === 1 ? "page" : "pages"}`;

  const keep = () => {
    declineMerge(userId, offer);
    onClose();
  };
  const move = () => {
    acceptMerge(offer);
    toast(`Moved ${pages} into your account`);
    onClose();
  };

  return (
    <Modal open onClose={keep} title="Pages on this device" width={460}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          You made {pages} here before signing in. Your account has its own
          workspace — bring them along?
        </p>
        <ul className="flex flex-col gap-1 rounded-[8px] border border-line-soft bg-panel-2/60 p-2">
          {offer.docs.slice(0, SHOWN).map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 px-1.5 py-1 text-[12.5px] text-ink-2"
            >
              <FileText size={13} className="shrink-0 text-ink-3" />
              <span className="truncate">{d.title.trim() || "Untitled"}</span>
            </li>
          ))}
          {n > SHOWN && (
            <li className="px-1.5 py-1 text-[12px] text-ink-3">
              and {n - SHOWN} more
            </li>
          )}
        </ul>
        <p className="text-[12px] leading-relaxed text-ink-3">
          Moved pages leave this device's local workspace
          {isDesktop() ? " (and its folder)" : ""}. Kept pages stay here
          and show up again whenever you are signed out.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={keep} className={btn.secondary}>
            Keep on this device
          </button>
          <button type="button" onClick={move} className={btn.primary}>
            Move {pages} to my account
          </button>
        </div>
      </div>
    </Modal>
  );
}
