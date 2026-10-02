import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowsOutSimple,
  DownloadSimple,
  File as FileIcon,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  buildImageMd,
  fileDownloadUrl,
  parseFileMd,
  parseImageMd,
  useImageSrc,
} from "@/lib/images";
import { toast } from "@/lib/toast";
import { openExternal } from "@/lib/workspace";

const TOOL =
  "grid h-7 w-7 place-items-center rounded-[7px] border border-line bg-elev/90 text-ink-2 shadow-[0_2px_8px_var(--color-shadow)] transition-opacity duration-150 hover:text-ink";

/** Keeps the block selected: no focus change on mouse down. */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid cursor-zoom-out place-items-center bg-black/80 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
      >
        <X size={16} />
      </button>
      <img
        src={src}
        alt=""
        className="max-h-[92vh] max-w-[94vw] rounded-[8px] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

/**
 * A picture block: the image, an optional caption, and — while selected —
 * a resize handle, a caption field, "enlarge" and "delete". The markdown
 * (`![caption](ref#w=480)`) is never shown.
 */
export function ImageBody({
  md,
  selected,
  onChange,
  onDelete,
}: {
  md: string;
  selected: boolean;
  onChange: (md: string) => void;
  onDelete: () => void;
}) {
  const parsed = parseImageMd(md);
  const url = useImageSrc(parsed?.ref);
  const [zoom, setZoom] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);

  if (!parsed) return null;
  const width = dragWidth ?? parsed.width;

  const startResize = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const box = frame.current;
    if (!box) return;
    const startX = e.clientX;
    const startW = box.getBoundingClientRect().width;
    const max = box.parentElement?.getBoundingClientRect().width ?? startW;
    let last = startW;
    const move = (ev: PointerEvent) => {
      last = Math.max(120, Math.min(max, startW + ev.clientX - startX));
      setDragWidth(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragWidth(null);
      onChange(buildImageMd({ ...parsed, width: last >= max - 2 ? null : last }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <figure className="m-0 py-1">
      <div
        ref={frame}
        className="group/img relative max-w-full"
        style={{ width: width ? `min(100%, ${width}px)` : "fit-content" }}
      >
        {url ? (
          <img
            src={url}
            alt={parsed.alt}
            draggable={false}
            onDoubleClick={() => setZoom(true)}
            className="block w-full rounded-[8px] border border-line-soft"
          />
        ) : (
          <div className="grid h-32 w-64 place-items-center rounded-[8px] border border-line-soft bg-panel-2 text-[12px] text-ink-3">
            Image not available
          </div>
        )}
        <div
          className={`absolute right-2 top-2 flex gap-1.5 transition-opacity duration-150 ${
            selected ? "opacity-100" : "opacity-0 group-hover/img:opacity-100"
          }`}
        >
          {url && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Enlarge image"
              title="Enlarge (double-click)"
              onMouseDown={keepFocus}
              onClick={(e) => {
                e.stopPropagation();
                setZoom(true);
              }}
              className={TOOL}
            >
              <ArrowsOutSimple size={14} />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Delete image"
            title="Delete image"
            onMouseDown={keepFocus}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className={`${TOOL} hover:!text-danger`}
          >
            <Trash size={14} />
          </button>
        </div>
        {selected && url && (
          <span
            role="separator"
            aria-label="Resize image (double-click to reset)"
            title="Drag to resize · double-click to reset"
            onPointerDown={startResize}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onChange(buildImageMd({ ...parsed, width: null }));
            }}
            className="absolute -right-1.5 top-1/2 h-10 w-2.5 -translate-y-1/2 cursor-ew-resize rounded-full border border-line bg-elev shadow"
          />
        )}
      </div>
      {selected ? (
        <input
          value={parsed.alt}
          onChange={(e) => onChange(buildImageMd({ ...parsed, alt: e.currentTarget.value }))}
          onClick={(e) => e.stopPropagation()}
          placeholder="Add a caption"
          aria-label="Image caption"
          className="mt-1.5 w-full bg-transparent text-center text-[12.5px] text-ink-2 outline-none placeholder:text-ink-3"
        />
      ) : (
        parsed.alt && (
          <figcaption className="mt-1.5 text-center text-[12.5px] text-ink-3">
            {parsed.alt}
          </figcaption>
        )
      )}
      {zoom && url && <Lightbox src={url} onClose={() => setZoom(false)} />}
    </figure>
  );
}

const sizeLabel = (n: number | null) =>
  n === null
    ? ""
    : n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;

/** An attached file: name, size, download — and "delete" while selected. */
export function FileBody({
  md,
  selected,
  onDelete,
}: {
  md: string;
  selected: boolean;
  onDelete: () => void;
}) {
  const parsed = parseFileMd(md);
  const [busy, setBusy] = useState(false);
  if (!parsed) return null;

  const open = async () => {
    setBusy(true);
    try {
      openExternal(await fileDownloadUrl(parsed.path, parsed.name));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`group/file my-1 flex w-full max-w-[440px] items-center gap-3 rounded-[9px] border bg-panel-2 px-3 py-2 ${
        selected ? "border-transparent" : "border-line-soft"
      }`}
    >
      <FileIcon size={20} className="shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] text-ink">{parsed.name}</div>
        {parsed.size !== null && (
          <div className="text-[11.5px] text-ink-3">{sizeLabel(parsed.size)}</div>
        )}
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Download"
        title="Download"
        disabled={busy}
        onMouseDown={keepFocus}
        onClick={(e) => {
          e.stopPropagation();
          void open();
        }}
        className={TOOL}
      >
        <DownloadSimple size={14} />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Remove file"
        title="Remove from page"
        onMouseDown={keepFocus}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={`${TOOL} opacity-0 transition-opacity hover:!text-danger group-hover/file:opacity-100 ${
          selected ? "!opacity-100" : ""
        }`}
      >
        <Trash size={14} />
      </button>
    </div>
  );
}
