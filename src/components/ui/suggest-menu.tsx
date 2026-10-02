import { useRef, useState } from "react";
import type { RefObject } from "react";
import {
  CalendarBlank,
  FileText,
  FolderSimple,
  Lightning,
  User,
  type Icon,
} from "@phosphor-icons/react";
import type { SuggestItem } from "@/lib/suggest";
import { useIsomorphicLayoutEffect } from "@/components/editor/utils";

export type Field = HTMLTextAreaElement | HTMLInputElement;

const ICONS: Record<SuggestItem["kind"], Icon> = {
  page: FileText,
  folder: FolderSimple,
  agent: Lightning,
  person: User,
  date: CalendarBlank,
};

/** Floating list of suggestions anchored under (or above) the field. */
export function SuggestList({
  anchor,
  items,
  active,
  onHover,
  onPick,
}: {
  anchor: RefObject<Field | null>;
  items: SuggestItem[];
  active: number;
  onHover: (i: number) => void;
  onPick: (item: SuggestItem) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    const update = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const h = listRef.current?.offsetHeight ?? items.length * 40 + 30;
      const below = window.innerHeight - r.bottom - 6;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 328));
      setPos(
        h > below && r.top > below
          ? { left, bottom: window.innerHeight - r.top + 6 }
          : { left, top: r.bottom + 6 },
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, items]);

  useIsomorphicLayoutEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Suggestions"
      // Keep focus (and the caret) in the field while clicking.
      onMouseDown={(e) => e.preventDefault()}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top,
        bottom: pos?.bottom,
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed z-[90] max-h-[300px] w-[320px] overflow-y-auto rounded-[10px] border border-line bg-panel p-1 shadow-[0_16px_48px_var(--color-shadow)]"
    >
      {items.map((item, i) => {
        const ItemIcon = ICONS[item.kind];
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={i === active}
            data-active={i === active || undefined}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(item)}
            className={`flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 ${
              i === active ? "bg-hover" : ""
            }`}
          >
            <ItemIcon
              size={14}
              weight={item.kind === "agent" ? "fill" : "regular"}
              className={`shrink-0 ${item.kind === "agent" ? "text-accent" : "text-ink-3"}`}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
              {item.kind === "agent" || item.kind === "person" ? `@${item.label}` : item.label}
            </span>
            {item.hint && (
              <span className="max-w-[140px] shrink-0 truncate font-mono text-[10.5px] text-ink-3">
                {item.hint}
              </span>
            )}
          </div>
        );
      })}
      <div className="border-t border-line-soft px-2 pb-0.5 pt-1.5 font-mono text-[10px] text-ink-3">
        ↑↓ choose · ↵ or tab insert · esc close
      </div>
    </div>
  );
}
