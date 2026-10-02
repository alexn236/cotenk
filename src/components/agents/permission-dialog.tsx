import { useMemo, useState } from "react";
import { FileText, Lightning, Terminal } from "@phosphor-icons/react";
import {
  answerPermission,
  changedBlockCount,
  diffBlocks,
  usePermissions,
  type BlockChange,
  type FileDiff,
  type PermissionRequest,
} from "@/lib/agent-permissions";
import { AGENTS } from "@/lib/agents";
import { useWorkspace } from "@/lib/store";
import { docRelativePath } from "@/lib/file-sync";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";

/**
 * Review dialog for agent actions that need approval: shows what the
 * agent wants to change as a block diff ("Claude Code wants to change 3
 * blocks in Weekly Sync") or the command it wants to run.
 */
export function PermissionDialog() {
  const req = usePermissions((s) => s.queue[0] ?? null);
  const pending = usePermissions((s) => s.queue.length);
  if (!req) return null;
  return <Review key={req.id} req={req} pending={pending} />;
}

function usePageTitle(path: string): string | null {
  const docs = useWorkspace((s) => s.docs);
  const folders = useWorkspace((s) => s.folders);
  return useMemo(() => {
    const p = path.replace(/\\/g, "/").toLowerCase();
    const hit = docs.find((d) =>
      p.endsWith(`/${docRelativePath(d, folders).toLowerCase()}`),
    );
    return hit ? hit.title.trim() || "Untitled" : null;
  }, [docs, folders, path]);
}

function Review({ req, pending }: { req: PermissionRequest; pending: number }) {
  const agent = AGENTS[req.agent].name;
  const diffs = useMemo(
    () => req.diffs.map((d) => ({ d, changes: diffBlocks(d.oldText, d.newText) })),
    [req.diffs],
  );
  const blocks = diffs.reduce((n, x) => n + changedBlockCount(x.changes), 0);
  const firstTitle = usePageTitle(req.diffs[0]?.path ?? "");
  const fileName = req.diffs[0]?.path.split(/[\\/]/).pop() ?? "";
  const where = firstTitle ?? fileName;

  const headline =
    req.diffs.length > 0
      ? req.diffs.length === 1 && req.diffs[0].oldText === null
        ? `${agent} wants to create “${where}”`
        : `${agent} wants to change ${blocks} ${blocks === 1 ? "block" : "blocks"}${
            req.diffs.length === 1 ? ` in “${where}”` : ` across ${req.diffs.length} pages`
          }`
      : req.kind === "execute"
        ? `${agent} wants to run a command`
        : req.kind === "delete"
          ? `${agent} wants to delete a file`
          : `${agent} asks for permission`;

  const allowChat = req.options.some((o) => o.kind === "allow_always");

  return (
    <Modal
      open
      onClose={() => answerPermission(req.id, "reject")}
      width={760}
      title={
        <span className="flex items-center gap-2">
          <Lightning size={14} weight="fill" className="text-accent" />
          {headline}
          {pending > 1 && (
            <span className="font-normal text-ink-3">· {pending - 1} more waiting</span>
          )}
        </span>
      }
      footer={
        <>
          <span className="mr-auto hidden text-[11.5px] text-ink-3 sm:inline">
            Auto-approve can be turned on in Settings → Agents.
          </span>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => answerPermission(req.id, "reject")}
          >
            Reject
          </button>
          {allowChat && (
            <button
              type="button"
              className={btn.secondary}
              onClick={() => answerPermission(req.id, "allow_chat")}
            >
              Allow for this chat
            </button>
          )}
          <button
            type="button"
            autoFocus
            className={btn.primary}
            onClick={() => answerPermission(req.id, "allow")}
          >
            Allow
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        {req.note && (
          <p className="rounded-[8px] border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[12.5px] text-ink-2">
            {req.note}
          </p>
        )}
        <p className="font-mono text-[11.5px] text-ink-3">{req.title}</p>
        {req.command && (
          <div className="flex items-start gap-2 rounded-[8px] border border-line bg-canvas px-3 py-2.5">
            <Terminal size={14} className="mt-0.5 shrink-0 text-ink-3" />
            <code className="whitespace-pre-wrap break-all font-mono text-[12px] text-ink">
              {req.command}
            </code>
          </div>
        )}
        {diffs.map(({ d, changes }) => (
          <FileReview key={d.path} diff={d} changes={changes} />
        ))}
        {req.diffs.length === 0 && !req.command && (
          <p className="text-[12.5px] text-ink-3">
            The agent didn't send details for this step.
          </p>
        )}
      </div>
    </Modal>
  );
}

function FileReview({ diff, changes }: { diff: FileDiff; changes: BlockChange[] }) {
  const title = usePageTitle(diff.path);
  const name = diff.path.split(/[\\/]/).pop() ?? diff.path;
  return (
    <section className="overflow-hidden rounded-[10px] border border-line-soft">
      <header className="flex items-center gap-2 border-b border-line-soft bg-panel-2 px-3 py-2 text-[12px]">
        <FileText size={13} className="text-ink-3" />
        <span className="font-medium text-ink">{title ?? name}</span>
        {title && <span className="font-mono text-[11px] text-ink-3">{name}</span>}
        {diff.oldText === null && (
          <span className="ml-auto rounded-full bg-accent-dim px-2 py-0.5 text-[10.5px] text-accent">
            new page
          </span>
        )}
      </header>
      <div className="flex flex-col gap-1 p-2">
        <Changes changes={changes} />
      </div>
    </section>
  );
}

/** Changed blocks in full; runs of unchanged ones collapse to a line. */
function Changes({ changes }: { changes: BlockChange[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const rows: ({ run: number; start: number; items: BlockChange[] } | BlockChange)[] = [];
  changes.forEach((c, i) => {
    const last = rows[rows.length - 1];
    if (c.type === "same") {
      if (last && "run" in last) last.items.push(c);
      else rows.push({ run: rows.length, start: i, items: [c] });
    } else {
      rows.push(c);
    }
  });
  return (
    <>
      {rows.map((r, i) => {
        if ("run" in r) {
          if (expanded.has(r.start) || r.items.length === 1) {
            return r.items.map((c, k) => <Row key={`${i}-${k}`} change={c} />);
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => setExpanded((s) => new Set(s).add(r.start))}
              className="rounded-[6px] px-2 py-1 text-left font-mono text-[11px] text-ink-3 hover:bg-hover"
            >
              … {r.items.length} unchanged blocks
            </button>
          );
        }
        return <Row key={i} change={r} />;
      })}
    </>
  );
}

function Row({ change }: { change: BlockChange }) {
  const tone =
    change.type === "added"
      ? "border-l-2 border-emerald-500/70 bg-emerald-500/[0.07] text-ink"
      : change.type === "removed"
        ? "border-l-2 border-danger/70 bg-danger/[0.07] text-ink-3 line-through decoration-danger/40"
        : "border-l-2 border-transparent text-ink-3";
  const text = change.text.length > 1200 ? `${change.text.slice(0, 1200)}…` : change.text;
  return (
    <pre
      className={`max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[6px] px-2.5 py-1.5 font-mono text-[11.5px] leading-[1.55] ${tone}`}
    >
      {text}
    </pre>
  );
}
