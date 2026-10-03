import { createContext, isValidElement, useContext } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import type { Components, ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight } from "@phosphor-icons/react";
import { slugify } from "@/lib/headings";
import { dueBucket, formatDue, isAgentName, isoDay } from "@/lib/tasks";
import { useWorkspace } from "@/lib/store";
import { useAgentSetup } from "@/lib/agent-setup";
import { downloadFile, FILE_REF, IMAGE_REF, useImageSrc } from "@/lib/images";
import { toast } from "@/lib/toast";
import {
  findDocByTitle,
  linkifyWikilinks,
  PAGE_HREF,
  titleKey,
} from "@/lib/wikilinks";
import { DESKTOP_DOWNLOAD_URL, isDesktop, openExternal } from "@/lib/workspace";

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
  const every = text && /^every:(day|weekday|week|month|year)$/.exec(text)?.[1];
  if (every) {
    return (
      <span className={`${CHIP} border-line text-ink-2`} title="Repeats">
        ↻ {every === "weekday" ? "weekdays" : `${every}ly`.replace("dayly", "daily")}
      </span>
    );
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

/** Keeps app links (`cotenk:…`) and inline images (imports) intact. */
function urlTransform(url: string): string {
  if (
    url.startsWith("cotenk:") ||
    url.startsWith(IMAGE_REF) ||
    url.startsWith(FILE_REF)
  ) {
    return url;
  }
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(url)) return url;
  return defaultUrlTransform(url);
}

/** `[[Page]]` link: opens the page, or creates it when it doesn't exist. */
function PageLink({ title, children }: { title: string; children: ReactNode }) {
  const exists = useWorkspace((s) =>
    s.docs.some((d) => titleKey(d.title || "Untitled") === titleKey(title)),
  );
  return (
    <a
      href="#"
      className="wikilink"
      data-missing={exists ? undefined : ""}
      title={exists ? title : `Create “${title}”`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const st = useWorkspace.getState();
        const doc = findDocByTitle(st.docs, title);
        if (doc) st.setActiveDoc(doc.id);
        else st.createDocWith({ title, content: "" });
      }}
    >
      {children}
    </a>
  );
}

/**
 * In-page calls to action (`cotenk:connect-agent`, `cotenk:import`).
 * The agent CTA turns into a download link on the web, where agents
 * can't run.
 */
function ActionLink({ action, children }: { action: string; children: ReactNode }) {
  const web = action === "connect-agent" && !isDesktop();
  const run = () => {
    const ws = useWorkspace.getState();
    if (action === "import") ws.setImportOpen(true);
    else if (action === "connect-agent") {
      if (web) openExternal(DESKTOP_DOWNLOAD_URL);
      else useAgentSetup.getState().openGuide();
    }
  };
  return (
    <button type="button" className="doc-cta" onClick={run}>
      {web ? "Get the desktop app — agents run there" : children}
      <ArrowRight size={12} weight="bold" />
    </button>
  );
}

function Link({
  node,
  href,
  children,
  ...props
}: ComponentPropsWithoutRef<"a"> & ExtraProps) {
  void node;
  if (href?.startsWith(PAGE_HREF)) {
    let title = href.slice(PAGE_HREF.length);
    try {
      title = decodeURIComponent(title);
    } catch {
      /* keep raw */
    }
    return <PageLink title={title}>{children}</PageLink>;
  }
  if (href?.startsWith(FILE_REF)) {
    const path = href.slice(FILE_REF.length).split("#")[0];
    return (
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          downloadFile(path, nodeToText(children) || "file").catch(
            (err) => toast(err instanceof Error ? err.message : String(err), { tone: "error" }),
          );
        }}
      >
        {children}
      </a>
    );
  }
  if (href?.startsWith("cotenk:")) {
    return <ActionLink action={href.slice(7)}>{children}</ActionLink>;
  }
  const external = !!href && /^(https?:|mailto:)/i.test(href);
  return (
    <a
      {...props}
      href={href}
      rel={external ? "noreferrer" : undefined}
      onClick={
        external
          ? (e) => {
              // Never navigate the app itself away from the workspace.
              e.preventDefault();
              e.stopPropagation();
              openExternal(href);
            }
          : undefined
      }
    >
      {children}
    </a>
  );
}

/** Images: `cotenk-image:` references are read from the workspace folder. */
function Img({
  node,
  src,
  alt,
  ...props
}: ComponentPropsWithoutRef<"img"> & ExtraProps) {
  void node;
  const url = useImageSrc(typeof src === "string" ? src : undefined);
  if (!url) {
    return (
      <span className="inline-block rounded-[8px] border border-line-soft bg-panel-2 px-3 py-6 text-[12px] text-ink-3">
        {src?.startsWith(IMAGE_REF) ? "Image unavailable" : (alt ?? "Image")}
      </span>
    );
  }
  const width = /#w=(\d+)/.exec(src ?? "")?.[1];
  return (
    <img
      {...props}
      src={url}
      alt={alt ?? ""}
      loading="lazy"
      style={width ? { width: `min(100%, ${width}px)` } : undefined}
    />
  );
}

/** Wide tables scroll sideways instead of squeezing words apart. */
function Table({
  node,
  ...props
}: ComponentPropsWithoutRef<"table"> & ExtraProps) {
  void node;
  return (
    <div className="table-scroll">
      <table {...props} />
    </div>
  );
}

const components: Components = {
  table: Table,
  img: Img,
  h1: makeHeading("h1"),
  h2: makeHeading("h2"),
  h3: makeHeading("h3"),
  input: CheckboxInput,
  code: InlineCode,
  a: Link,
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
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={components}
          urlTransform={urlTransform}
        >
          {linkifyWikilinks(children)}
        </ReactMarkdown>
      </div>
    </TaskToggleContext.Provider>
  );
}
