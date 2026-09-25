import { createContext, isValidElement, useContext } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components, ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { slugify } from "@/lib/headings";
import { dueBucket, formatDue, isAgentName, isoDay } from "@/lib/tasks";

/**
 * Called when a rendered task-list checkbox is toggled.
 * `ordinal` is the checkbox's index among all checkboxes rendered from the
 * same markdown chunk (document order).
 */
export type TaskToggleHandler = (ordinal: number, checked: boolean) => void;

const TaskToggleContext = createContext<TaskToggleHandler | null>(null);

/**
 * Extracts plain text from react-markdown children.
 * Heading children can be nested elements (strong, code, links), so we walk
 * the tree and concatenate every text leaf.
 */
function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeToText(node.props.children);
  }
  return "";
}

type HeadingProps = ComponentPropsWithoutRef<"h1"> & ExtraProps;

/**
 * Heading renderer that stamps `id={slug}` on the element so the contents
 * panel can scroll-spy and jump to it. `node` is stripped from the props
 * before they reach the DOM.
 */
function makeHeading(Tag: "h1" | "h2" | "h3") {
  return function MarkdownHeading({ node, children, ...props }: HeadingProps) {
    void node;
    return (
      <Tag {...props} id={slugify(nodeToText(children))}>
        {children}
      </Tag>
    );
  };
}

/**
 * Checkbox renderer that makes task-list items interactive. react-markdown
 * emits disabled checkboxes; we re-enable them and report which checkbox
 * (in document order) was toggled so the parent can flip the matching
 * `- [ ]` / `- [x]` marker in the source.
 */
function CheckboxInput({
  node,
  ...props
}: ComponentPropsWithoutRef<"input"> & ExtraProps) {
  void node;
  const onToggle = useContext(TaskToggleContext);
  if (props.type !== "checkbox") return <input {...props} />;
  return (
    <input
      {...props}
      checked={Boolean(props.checked)}
      disabled={false}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const el = e.currentTarget;
        const scope = el.closest(".prose-doc");
        if (!scope || !onToggle) return;
        const boxes = Array.from(
          scope.querySelectorAll('input[type="checkbox"]'),
        );
        const ordinal = boxes.indexOf(el);
        if (ordinal >= 0) onToggle(ordinal, el.checked);
      }}
    />
  );
}

const CHIP =
  "inline-flex items-center gap-1 rounded-full border px-1.5 align-[1px] text-[0.72em] font-medium leading-[1.6] not-italic";

/**
 * Inline code renderer: task markers (`@name`, `due:YYYY-MM-DD`) become
 * chips; everything else stays regular inline code.
 */
function InlineCode({
  node,
  children,
  ...props
}: ComponentPropsWithoutRef<"code"> & ExtraProps) {
  void node;
  const text = typeof children === "string" ? children : null;
  const due = text && /^due:(\d{4}-\d{2}-\d{2})$/.exec(text)?.[1];
  if (due) {
    const today = isoDay(new Date());
    const b = dueBucket(due, today);
    const tone =
      b === "overdue"
        ? "border-danger/40 text-danger"
        : b === "today"
          ? "border-accent-line text-accent"
          : "border-line text-ink-2";
    return <span className={`${CHIP} ${tone}`}>{formatDue(due, today)}</span>;
  }
  const who = text && /^@([\p{L}\p{N}_.-]+)$/u.exec(text)?.[1];
  if (who) {
    const agent = isAgentName(who);
    return (
      <span
        className={`${CHIP} ${
          agent
            ? "border-accent-line bg-accent-dim text-accent"
            : "border-line text-ink-2"
        }`}
      >
        {agent ? "⚡" : "@"}
        {who}
      </span>
    );
  }
  return <code {...props}>{children}</code>;
}

const components: Components = {
  h1: makeHeading("h1"),
  h2: makeHeading("h2"),
  h3: makeHeading("h3"),
  input: CheckboxInput,
  code: InlineCode,
};

export type MarkdownProps = {
  /** Raw markdown source. */
  children: string;
  /** Receives the checkbox ordinal + desired state when a task checkbox is clicked. */
  onToggleTask?: TaskToggleHandler;
};

/**
 * Shared markdown renderer for the editor. Wraps output in the global
 * `.prose-doc` typography styles and adds heading ids for scroll-spy.
 */
export function Markdown({ children, onToggleTask }: MarkdownProps) {
  return (
    <TaskToggleContext.Provider value={onToggleTask ?? null}>
      <div className="prose-doc">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {children}
        </ReactMarkdown>
      </div>
    </TaskToggleContext.Provider>
  );
}
