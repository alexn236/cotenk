import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { SlashItem } from "./slash-items";
import { useIsomorphicLayoutEffect } from "./utils";

export type SlashMenuProps = {
  /** Resolves the editing block's textarea (position anchor). */
  getAnchor: () => HTMLElement | null;
  items: SlashItem[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (item: SlashItem) => void;
};

/** Fixed-position block-type picker anchored under the editing textarea. */
export function SlashMenu({
  getAnchor,
  items,
  activeIndex,
  onHover,
  onPick,
}: SlashMenuProps) {
  const reduceMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  useIsomorphicLayoutEffect(() => {
    const anchor = getAnchor();
    if (!anchor) return;
    const update = () => {
      const r = anchor.getBoundingClientRect();
      const height =
        menuRef.current?.offsetHeight ??
        Math.min(320, items.length * 45 + 8);
      const below = window.innerHeight - r.bottom - 6;
      const flip = height > below && r.top - 6 > below;
      const left =
        r.left + (parseFloat(getComputedStyle(anchor).paddingLeft) || 0);
      setPos(
        flip
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
  }, [getAnchor, items]);

  useIsomorphicLayoutEffect(() => {
    menuRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <motion.div
      ref={menuRef}
      role="listbox"
      aria-label="Block type"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
      transition={
        reduceMotion
          ? { duration: 0.12 }
          : { type: "spring", duration: 0.18, bounce: 0 }
      }
      onMouseDown={(e) => e.preventDefault()}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top,
        bottom: pos?.bottom,
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed z-50 max-h-[320px] w-[264px] origin-top overflow-y-auto rounded-[10px] border border-line bg-panel p-1 shadow-[0_16px_48px_var(--color-shadow)]"
    >
      {items.length === 0 ? (
        <div className="px-3 py-2 text-[12.5px] text-ink-3">
          No block found
        </div>
      ) : (
        items.map((item, i) => {
          const ItemIcon = item.icon;
          return (
            <div
              key={item.id}
              role="option"
              aria-selected={i === activeIndex}
              data-active={i === activeIndex || undefined}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(item)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 transition-colors duration-100 ease-out-expo ${
                i === activeIndex ? "bg-hover" : ""
              }`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border border-line-soft bg-elev text-ink-2">
                <ItemIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-[1.4] text-ink">
                  {item.label}
                </span>
                <span className="block truncate text-[11.5px] leading-[1.35] text-ink-3">
                  {item.desc}
                </span>
              </span>
            </div>
          );
        })
      )}
    </motion.div>
  );
}
