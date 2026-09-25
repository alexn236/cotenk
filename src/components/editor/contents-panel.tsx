import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp } from "@phosphor-icons/react";
import { extractHeadings } from "@/lib/headings";
import { useActiveDoc, useWorkspace } from "@/lib/store";

export type ContentsPanelProps = {
  /** Scroll container that hosts the rendered document (observer root). */
  scrollRoot: RefObject<HTMLElement | null>;
  /** Raw markdown of the current document. */
  docContent: string;
};

const paddingFor = (level: number) =>
  level === 1 ? "pl-2" : level === 2 ? "pl-5" : "pl-8";

const dotOffsetFor = (level: number) =>
  level === 1 ? "left-0" : level === 2 ? "left-3" : "left-6";

/**
 * Floating table-of-contents card for the document editor. Lists h1-h3
 * headings, scroll-spies the document and jumps to a heading on click.
 */
export function ContentsPanel({ scrollRoot, docContent }: ContentsPanelProps) {
  const contentsOpen = useWorkspace((s) => s.contentsOpen);
  const doc = useActiveDoc();
  const reduceMotion = useReducedMotion();

  const headings = useMemo(() => extractHeadings(docContent), [docContent]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const visibleRef = useRef<Set<string>>(new Set());
  const elementsRef = useRef<HTMLElement[]>([]);

  // Scroll-spy. An IntersectionObserver tracks headings inside a band near
  // the top of the scroll container; a MutationObserver re-collects the
  // heading elements as blocks mount, unmount and re-render.
  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) return;

    const visible = visibleRef.current;
    let raf = 0;

    const pickActive = () => {
      const elements = elementsRef.current;
      const firstVisible = elements.find((el) => visible.has(el.id));
      if (firstVisible) {
        setActiveSlug(firstVisible.id);
        return;
      }
      // No heading inside the band: fall back to the last heading
      // scrolled past the top of the container.
      const rootTop = root.getBoundingClientRect().top;
      let fallback: string | null = null;
      for (const el of elements) {
        if (el.getBoundingClientRect().top - rootTop <= 88) fallback = el.id;
        else break;
      }
      setActiveSlug(fallback);
    };

    const schedulePick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(pickActive);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        schedulePick();
      },
      { root, rootMargin: "-80px 0px -70% 0px" },
    );

    const collect = () => {
      elementsRef.current = Array.from(
        root.querySelectorAll<HTMLElement>(
          ".prose-doc h1[id], .prose-doc h2[id], .prose-doc h3[id]",
        ),
      );
      visible.clear();
      observer.disconnect();
      for (const el of elementsRef.current) observer.observe(el);
      schedulePick();
    };

    collect();

    const scheduleCollect = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(collect);
    };
    const mutations = new MutationObserver(scheduleCollect);
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      mutations.disconnect();
      observer.disconnect();
    };
  }, [scrollRoot]);

  const jumpTo = (slug: string) => {
    const el = document.getElementById(slug);
    if (!el) return;
    el.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    setActiveSlug(slug);
  };

  const scrollToTop = () => {
    scrollRoot.current?.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  return (
    <AnimatePresence>
      {contentsOpen && (
        <motion.aside
          initial={reduceMotion ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
          transition={
            reduceMotion
              ? { duration: 0.12 }
              : { type: "spring", stiffness: 420, damping: 38 }
          }
          className="absolute right-6 top-14 z-20 w-[220px] rounded-[14px] border border-line bg-panel/95 shadow-[0_16px_48px_var(--color-shadow)] backdrop-blur-md"
        >
          <div className="px-4 pb-2 pt-3.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3">
            Contents
          </div>

          {headings.length === 0 ? (
            <p className="px-4 pb-3 text-[12px] text-ink-3">No headings</p>
          ) : (
            <nav className="max-h-[50vh] overflow-y-auto px-2 pb-2">
              {headings.map((h, i) => {
                const active = h.slug === activeSlug;
                return (
                  <button
                    key={`${h.slug}-${i}`}
                    type="button"
                    onClick={() => jumpTo(h.slug)}
                    className={[
                      "relative flex h-7 w-full items-center rounded-[6px] pr-2 text-left text-[12.5px] transition-colors duration-150 ease-out-expo",
                      paddingFor(h.level),
                      active
                        ? "font-medium text-ink"
                        : "text-ink-2 hover:bg-hover hover:text-ink",
                    ].join(" ")}
                  >
                    {active && (
                      <motion.span
                        layoutId="toc-dot"
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 32,
                        }}
                        className={`absolute top-[7px] h-3.5 w-[2px] rounded-full bg-accent ${dotOffsetFor(h.level)}`}
                      />
                    )}
                    <span className="truncate">{h.text}</span>
                  </button>
                );
              })}
            </nav>
          )}

          <div className="flex items-center justify-between border-t border-line-soft px-4 py-2.5">
            <span className="truncate text-[11.5px] text-ink-3">
              {doc?.title.trim() || "Untitled"}
            </span>
            <button
              type="button"
              aria-label="Back to top"
              onClick={scrollToTop}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-accent transition-colors duration-150 ease-out-expo hover:bg-hover"
            >
              <ArrowUp size={13} />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
