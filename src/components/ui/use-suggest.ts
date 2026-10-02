import { createElement, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/lib/store";
import {
  applySuggestion,
  findTrigger,
  suggestionsFor,
  type SuggestItem,
  type SuggestMode,
} from "@/lib/suggest";
import { SuggestList, type Field } from "./suggest-menu";

/**
 * Inline suggestions for a text field — `[[` pages, `@` people/agents
 * (or pages and folders in the agent composer), `due:` dates. Spread
 * `fieldProps` on the field, call `onKeyDown` first in the field's key
 * handler (true = consumed) and render `menu`.
 */
export function useSuggest({
  ref,
  value,
  onChange,
  mode,
  enabled = true,
}: {
  ref: RefObject<Field | null>;
  value: string;
  onChange: (next: string) => void;
  mode: SuggestMode;
  enabled?: boolean;
}) {
  const docs = useWorkspace((s) => s.docs);
  const folders = useWorkspace((s) => s.folders);
  const [caret, setCaret] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  /** Trigger start the user dismissed with Escape. */
  const [dismissed, setDismissed] = useState<number | null>(null);

  const trigger =
    enabled && caret !== null && caret <= value.length
      ? findTrigger(value, caret, mode)
      : null;
  const tStart = trigger?.start ?? -1;
  // Only computed while a trigger is being typed.
  const items =
    trigger && tStart !== dismissed
      ? suggestionsFor(trigger, mode, docs, folders)
      : [];
  const open = items.length > 0;
  const active = Math.min(index, Math.max(items.length - 1, 0));

  const syncCaret = () => {
    const el = ref.current;
    const next = el && document.activeElement === el ? el.selectionStart : null;
    // Arrow keys fire select events without moving the caret — keep the
    // highlighted suggestion then.
    if (next !== caret) {
      setCaret(next);
      setIndex(0);
    }
  };

  const pickItem = (item: SuggestItem) => {
    if (!trigger) return;
    const r = applySuggestion(value, trigger, item);
    onChange(r.text);
    setIndex(0);
    setCaret(r.caret);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(r.caret, r.caret);
    });
  };

  const onKeyDown = (e: KeyboardEvent<Field>): boolean => {
    if (!open) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (i + 1) % items.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (i - 1 + items.length) % items.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickItem(items[active]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setDismissed(tStart);
      return true;
    }
    return false;
  };

  const fieldProps = {
    onSelect: syncCaret,
    onInput: syncCaret,
    onKeyUp: syncCaret,
    onClick: syncCaret,
    onFocus: syncCaret,
    onBlur: () => setCaret(null),
  };

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          createElement(SuggestList, {
            anchor: ref,
            items,
            active,
            onHover: setIndex,
            onPick: pickItem,
          }),
          document.body,
        )
      : null;

  return { open, onKeyDown, fieldProps, menu };
}
