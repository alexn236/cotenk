import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Plus, X } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/modal";
import { btn } from "@/components/ui/styles";
import { toast } from "@/lib/toast";
import { isDesktop } from "@/lib/workspace";
import {
  BUILTIN_MCP,
  BUILTIN_SKILL,
  expandExtensions,
  extensionSecrets,
  extensionSlug,
  joinCommandLine,
  missingSecrets,
  parseMcpConfig,
  parseSkillFile,
  pluginItemId,
  splitCommandLine,
  storeExtensionSecrets,
  useExtensions,
  type Extension,
  type McpExtension,
  type PluginExtension,
  type PluginServer,
  type PluginSkill,
  type SkillExtension,
} from "@/lib/extensions";
import {
  Badge,
  Card,
  Row,
  SectionTitle,
  SmallButton,
  Switch,
} from "./settings-ui";

const inputCls =
  "w-full rounded-[7px] border border-line bg-panel-2 px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus:border-accent";

type Editing =
  | { kind: "skill"; ext: SkillExtension | null; seed?: SkillSeed }
  | { kind: "mcp"; ext: McpExtension | null }
  | { kind: "plugin"; ext: PluginExtension };

/** Where a plugin comes from: file paths relative to its root + a reader. */
type PluginSource = {
  folder: string;
  paths: string[];
  read: (rel: string) => Promise<string>;
};

type SkillSeed = Pick<SkillExtension, "name" | "description" | "body">;

export function ExtensionsSection() {
  const items = useExtensions((s) => s.items);
  const update = useExtensions((s) => s.update);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [addingPlugin, setAddingPlugin] = useState(false);

  const skills = items.filter((e): e is SkillExtension => e.kind === "skill");
  const servers = items.filter((e): e is McpExtension => e.kind === "mcp");
  const plugins = items.filter((e): e is PluginExtension => e.kind === "plugin");
  const add = useExtensions((s) => s.add);

  const importFolder = async () => {
    const root = await openDialog({
      title: "Add a plugin (choose its folder)",
      directory: true,
    });
    if (typeof root !== "string") return;
    try {
      const files = await invoke<{ path: string }[]>("fs_list_md", { root });
      const prefix = root.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
      await addPlugin({
        folder: root.split(/[\\/]/).filter(Boolean).pop() ?? "plugin",
        paths: files.map((f) => f.path.replace(/\\/g, "/").replace(prefix, "")),
        read: (rel) => invoke<string>("fs_read", { path: `${prefix}${rel}` }),
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    }
  };

  const importGithub = async (input: string) => {
    try {
      const m =
        /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+?))?)?\/?$/i.exec(
          input.trim(),
        );
      if (!m) {
        throw new Error("Enter a GitHub link, e.g. https://github.com/owner/repo");
      }
      const [, owner, repo, treeRef, sub = ""] = m;
      const api = async <T,>(url: string): Promise<T> => {
        const res = await fetch(url, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "Repository not found — is it public?"
              : res.status === 403
                ? "GitHub rate limit reached — try again later."
                : `GitHub error ${res.status}.`,
          );
        }
        return (await res.json()) as T;
      };
      const ref =
        treeRef ??
        (await api<{ default_branch: string }>(
          `https://api.github.com/repos/${owner}/${repo}`,
        )).default_branch;
      const tree = await api<{ tree: { path: string; type: string }[] }>(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      );
      const base = sub ? `${sub.replace(/\/+$/, "")}/` : "";
      await addPlugin({
        folder: base ? base.split("/").filter(Boolean).pop()! : repo,
        paths: tree.tree
          .filter((t) => t.type === "blob" && t.path.startsWith(base))
          .map((t) => t.path.slice(base.length)),
        read: async (rel) => {
          const res = await fetch(
            `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${base}${rel}`,
          );
          if (!res.ok) throw new Error(`Couldn't download ${rel}.`);
          return res.text();
        },
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    }
  };

  /** Turns a plugin source (folder or repo) into a plugin; throws on problems. */
  const addPlugin = async (src: PluginSource) => {
    {
      const readJson = async (rel: string): Promise<unknown> => {
        const text = await src.read(rel).catch(() => "");
        try {
          return text.trim() ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      };
      const manifest = ((await readJson(".claude-plugin/plugin.json")) ??
        {}) as Record<string, unknown>;
      const name = extensionSlug(
        typeof manifest.name === "string" && manifest.name ? manifest.name : src.folder,
      );
      if (!name) throw new Error("Couldn't work out a name for this plugin.");
      if (plugins.some((p) => p.name === name)) {
        throw new Error(`There already is a plugin named “${name}”.`);
      }

      const skills: PluginSkill[] = [];
      for (const rel of src.paths) {
        const skill = /^skills\/([^/]+)\/skill\.md$/i.exec(rel);
        const command = /^commands\/(.+)\.md$/i.exec(rel);
        const fallback = skill?.[1] ?? command?.[1].replace(/\//g, "-");
        if (!fallback) continue;
        const parsed = parseSkillFile(await src.read(rel), fallback);
        // Commands carry no name in their frontmatter — the file names them.
        const skillName = skill ? parsed.name : extensionSlug(fallback);
        if (!skillName || !parsed.body || skills.some((s) => s.name === skillName)) continue;
        skills.push({
          name: skillName,
          description: parsed.description || `Instructions for ${skillName}.`,
          body: parsed.body,
        });
      }

      const inline = parseMcpConfig(manifest.mcpServers ? manifest : null);
      const found = [...inline, ...parseMcpConfig(await readJson(".mcp.json"))];
      const imports = found.filter(
        (m, i) => found.findIndex((x) => x.server.name === m.server.name) === i,
      );
      if (skills.length + imports.length === 0) {
        throw new Error(
          "No skills, commands or MCP servers found — link the plugin's own folder.",
        );
      }

      const ext = add({
        kind: "plugin",
        enabled: true,
        name,
        description: typeof manifest.description === "string" ? manifest.description : "",
        skills,
        servers: imports.map((m) => m.server),
      }) as PluginExtension;
      imports.forEach((m) =>
        storeExtensionSecrets(pluginItemId(ext.id, m.server.name), m.secrets),
      );
      toast(
        `Added ${name}: ${skills.length} skill${skills.length === 1 ? "" : "s"}, ${imports.length} server${imports.length === 1 ? "" : "s"}.`,
      );
    }
  };

  const importSkill = async () => {
    const chosen = await openDialog({
      title: "Import a skill",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (typeof chosen !== "string") return;
    try {
      const text = await invoke<string>("fs_read", { path: chosen });
      // A SKILL.md is named after its folder.
      const parts = chosen.split(/[\\/]/);
      const file = parts.pop() ?? "skill";
      const fallback = /^skill\.md$/i.test(file)
        ? (parts.pop() ?? "skill")
        : file.replace(/\.md$/i, "");
      setEditing({ kind: "skill", ext: null, seed: parseSkillFile(text, fallback) });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: "error" });
    }
  };

  return (
    <section>
      <SectionTitle
        title="Agent customisation"
        sub="Only usable when Claude Code or Devin CLI run inside CoTenk — your own claude and devin setups can't use them. Changes apply to new chats."
      />

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12.5px] font-medium text-ink-2">Skills</h3>
        <div className="flex items-center gap-2">
          {isDesktop() && (
            <SmallButton onClick={() => void importSkill()}>Import .md</SmallButton>
          )}
          <SmallButton accent onClick={() => setEditing({ kind: "skill", ext: null })}>
            New skill
          </SmallButton>
        </div>
      </div>
      <Card>
        <Row
          label={<span className="font-mono text-[12.5px]">{BUILTIN_SKILL}</span>}
          desc="How CoTenk pages, tasks and embeds work."
        >
          <Badge>Built in</Badge>
        </Row>
        {skills.map((s) => (
          <Row
            key={s.id}
            label={<span className="font-mono text-[12.5px]">{s.name}</span>}
            desc={<span className="line-clamp-1">{s.description || "No description"}</span>}
          >
            <div className="flex items-center gap-2">
              <SmallButton onClick={() => setEditing({ kind: "skill", ext: s })}>
                Edit
              </SmallButton>
              <Switch
                on={s.enabled}
                label={`Enable ${s.name}`}
                onChange={(on) => update(s.id, { enabled: on })}
              />
            </div>
          </Row>
        ))}
        {skills.length === 0 && (
          <Empty>
            A skill is markdown with instructions for one kind of task. The
            agent sees its description and loads the rest when a task fits.
          </Empty>
        )}
      </Card>

      <div className="mb-2 mt-8 flex items-center justify-between">
        <h3 className="text-[12.5px] font-medium text-ink-2">MCP servers</h3>
        <SmallButton accent onClick={() => setEditing({ kind: "mcp", ext: null })}>
          Add server
        </SmallButton>
      </div>
      <Card>
        {servers.map((m) => {
          const missing = missingSecrets(m);
          return (
            <Row
              key={m.id}
              label={
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[12.5px]">{m.name}</span>
                  {missing.length > 0 && <Badge>Needs {missing.join(", ")}</Badge>}
                </span>
              }
              desc={
                <span className="line-clamp-1 font-mono text-[11.5px]">
                  {m.transport === "http"
                    ? m.url
                    : joinCommandLine([m.command, ...m.args])}
                </span>
              }
            >
              <div className="flex items-center gap-2">
                <SmallButton onClick={() => setEditing({ kind: "mcp", ext: m })}>
                  Edit
                </SmallButton>
                <Switch
                  on={m.enabled}
                  label={`Enable ${m.name}`}
                  onChange={(on) => update(m.id, { enabled: on })}
                />
              </div>
            </Row>
          );
        })}
        {servers.length === 0 && (
          <Empty>
            MCP servers give agents extra tools — GitHub, Linear, a database,
            your own API. Add one by command (e.g. npx) or by URL.
          </Empty>
        )}
      </Card>

      <div className="mb-2 mt-8 flex items-center justify-between">
        <h3 className="text-[12.5px] font-medium text-ink-2">Plugins</h3>
        <SmallButton accent onClick={() => setAddingPlugin(true)}>
          Add plugin
        </SmallButton>
      </div>
      <Card>
        {plugins.map((p) => {
          const missing = expandExtensions([p]).some(
            (x) => x.kind === "mcp" && missingSecrets(x).length > 0,
          );
          return (
            <Row
              key={p.id}
              label={
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[12.5px]">{p.name}</span>
                  {missing && <Badge>Needs secrets</Badge>}
                </span>
              }
              desc={
                <span className="line-clamp-1">
                  {p.skills.length} skill{p.skills.length === 1 ? "" : "s"} ·{" "}
                  {p.servers.length} server{p.servers.length === 1 ? "" : "s"}
                  {p.description ? ` — ${p.description}` : ""}
                </span>
              }
            >
              <div className="flex items-center gap-2">
                <SmallButton onClick={() => setEditing({ kind: "plugin", ext: p })}>
                  Details
                </SmallButton>
                <Switch
                  on={p.enabled}
                  label={`Enable ${p.name}`}
                  onChange={(on) => update(p.id, { enabled: on })}
                />
              </div>
            </Row>
          );
        })}
        {plugins.length === 0 && (
          <Empty>
            A plugin bundles skills, commands and MCP servers. Paste a GitHub
            link (or choose a folder) and everything in it is available to the
            agents in chats and tasks.
          </Empty>
        )}
      </Card>

      <p className="mt-3 text-[12px] text-ink-3">
        Saved on this device. Secret values (keys, tokens) are stored apart
        from the list.
      </p>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-3">
        claude code: everything is handed over per session, skills load as
        cotenk:&lt;name&gt; · devin cli: skills and servers come through the
        “{BUILTIN_MCP}” gateway in the workspace&apos;s
        .devin/mcp_config.local.json — it has no tools outside CoTenk · url
        servers reach devin through mcp-remote (needs node.js)
      </p>

      <Modal
        open={addingPlugin}
        onClose={() => setAddingPlugin(false)}
        title="Add plugin"
        width={520}
      >
        {addingPlugin && (
          <AddPlugin
            onGithub={importGithub}
            onFolder={isDesktop() ? importFolder : undefined}
            onDone={() => setAddingPlugin(false)}
          />
        )}
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing?.kind === "plugin"
            ? `Plugin ${editing.ext.name}`
            : editing?.kind === "skill"
              ? editing.ext
                ? "Edit skill"
                : "New skill"
              : editing?.ext
                ? "Edit MCP server"
                : "Add MCP server"
        }
        width={600}
      >
        {editing?.kind === "skill" && (
          <SkillEditor
            key={editing.ext?.id ?? "new"}
            ext={editing.ext}
            seed={editing.seed}
            onDone={() => setEditing(null)}
          />
        )}
        {editing?.kind === "mcp" && (
          <McpEditor
            key={editing.ext?.id ?? "new"}
            ext={editing.ext}
            onDone={() => setEditing(null)}
          />
        )}
        {editing?.kind === "plugin" && (
          <PluginDetails
            key={editing.ext.id}
            ext={editing.ext}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3 text-[12px] leading-relaxed text-ink-3">
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
    </label>
  );
}

/** Name problems shared by both editors, or null. */
function nameError(
  slug: string,
  kind: Extension["kind"],
  selfId: string | undefined,
): string | null {
  if (!slug) return "Give it a name.";
  if (slug === (kind === "skill" ? BUILTIN_SKILL : BUILTIN_MCP)) {
    return `“${slug}” is reserved for CoTenk.`;
  }
  const taken = useExtensions
    .getState()
    .items.some((e) => e.kind === kind && e.name === slug && e.id !== selfId);
  return taken ? `There already is a ${kind === "skill" ? "skill" : "server"} named “${slug}”.` : null;
}

function EditorFooter({
  ext,
  onDelete,
  onCancel,
  onSave,
}: {
  ext: Extension | null;
  onDelete: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-4">
      <div>
        {ext && (
          <button
            type="button"
            onClick={() => (confirming ? onDelete() : setConfirming(true))}
            className={`${btn.ghost} ${confirming ? "text-danger hover:text-danger" : ""}`}
          >
            {confirming ? "Click again to delete" : "Delete"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className={btn.secondary}>
          Cancel
        </button>
        <button type="button" onClick={onSave} className={btn.primary}>
          Save
        </button>
      </div>
    </div>
  );
}

function SkillEditor({
  ext,
  seed,
  onDone,
}: {
  ext: SkillExtension | null;
  seed?: SkillSeed;
  onDone: () => void;
}) {
  const add = useExtensions((s) => s.add);
  const update = useExtensions((s) => s.update);
  const remove = useExtensions((s) => s.remove);
  const start = ext ?? seed;
  const [name, setName] = useState(start?.name ?? "");
  const [description, setDescription] = useState(start?.description ?? "");
  const [body, setBody] = useState(start?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const slug = extensionSlug(name);

  const save = () => {
    const err =
      nameError(slug, "skill", ext?.id) ??
      (!description.trim()
        ? "Add a description — it's how the agent decides when to use the skill."
        : !body.trim()
          ? "Add the instructions."
          : null);
    if (err) {
      setError(err);
      return;
    }
    const fields = { name: slug, description: description.trim(), body: body.trim() };
    if (ext) update(ext.id, fields);
    else add({ kind: "skill", enabled: true, ...fields });
    onDone();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Field
        label="Name"
        hint={slug && slug !== name ? `Saved as ${slug}` : "Lowercase letters, digits and hyphens."}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="release-notes"
          spellCheck={false}
          autoFocus
          className={`${inputCls} font-mono`}
        />
      </Field>
      <Field label="Description" hint="When should the agent use it? One or two sentences.">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Use when writing release notes from merged changes."
          className={inputCls}
        />
      </Field>
      <Field label="Instructions" hint="Markdown — what the agent reads once it loads the skill.">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          spellCheck={false}
          placeholder={"# Release notes\n\n1. Collect the changes…"}
          className={`${inputCls} resize-y font-mono text-[12px] leading-relaxed`}
        />
      </Field>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <EditorFooter
        ext={ext}
        onCancel={onDone}
        onSave={save}
        onDelete={() => {
          if (ext) remove(ext.id);
          onDone();
        }}
      />
    </div>
  );
}

function AddPlugin({
  onGithub,
  onFolder,
  onDone,
}: {
  onGithub: (url: string) => Promise<void>;
  onFolder?: () => Promise<void>;
  onDone: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
    onDone();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Field
        label="GitHub link"
        hint="A repository, or a folder inside one (…/tree/main/plugins/name). Public repos only."
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim() && !busy) void run(() => onGithub(url));
          }}
          placeholder="https://github.com/owner/repo"
          spellCheck={false}
          autoFocus
          className={`${inputCls} font-mono`}
        />
      </Field>
      <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-4">
        <div>
          {onFolder && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(onFolder)}
              className={btn.ghost}
            >
              Choose folder…
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDone} className={btn.secondary}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !url.trim()}
            onClick={() => void run(() => onGithub(url))}
            className={btn.primary}
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PluginDetails({
  ext,
  onDone,
}: {
  ext: PluginExtension;
  onDone: () => void;
}) {
  const remove = useExtensions((s) => s.remove);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(
      ext.servers.map((s) => [s.name, extensionSecrets(pluginItemId(ext.id, s.name))]),
    ),
  );

  const save = () => {
    ext.servers.forEach((s) =>
      storeExtensionSecrets(pluginItemId(ext.id, s.name), values[s.name] ?? {}),
    );
    onDone();
  };

  const setValue = (s: PluginServer, key: string, value: string) =>
    setValues((v) => ({ ...v, [s.name]: { ...v[s.name], [key]: value } }));

  return (
    <div className="flex flex-col gap-4 p-4">
      {ext.description && <p className="text-[12.5px] text-ink-2">{ext.description}</p>}

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-ink-2">Skills</span>
        {ext.skills.length === 0 && <span className="text-[12px] text-ink-3">None</span>}
        {ext.skills.map((s) => (
          <div key={s.name} className="text-[12px]">
            <span className="font-mono text-ink">{extensionSlug(`${ext.name}-${s.name}`)}</span>
            <span className="line-clamp-1 text-ink-3">{s.description}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-[12px] font-medium text-ink-2">MCP servers</span>
        {ext.servers.length === 0 && <span className="text-[12px] text-ink-3">None</span>}
        {ext.servers.map((s) => (
          <div key={s.name} className="flex flex-col gap-1.5">
            <span className="font-mono text-[12px] text-ink">
              {extensionSlug(`${ext.name}-${s.name}`)}
            </span>
            <span className="line-clamp-1 font-mono text-[11.5px] text-ink-3">
              {s.transport === "http" ? s.url : joinCommandLine([s.command, ...s.args])}
            </span>
            {s.secretKeys.map((k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-[40%] truncate font-mono text-[12px] text-ink-2">{k}</span>
                <input
                  type="password"
                  value={values[s.name]?.[k] ?? ""}
                  onChange={(e) => setValue(s, k, e.target.value)}
                  placeholder="value"
                  className={`${inputCls} flex-1 font-mono`}
                />
              </div>
            ))}
          </div>
        ))}
        <span className="text-[11.5px] text-ink-3">
          Values stay on this device and are kept apart from the list.
        </span>
      </div>

      <EditorFooter
        ext={ext}
        onCancel={onDone}
        onSave={save}
        onDelete={() => {
          remove(ext.id);
          onDone();
        }}
      />
    </div>
  );
}

type SecretRow = { key: string; value: string };

function McpEditor({
  ext,
  onDone,
}: {
  ext: McpExtension | null;
  onDone: () => void;
}) {
  const add = useExtensions((s) => s.add);
  const update = useExtensions((s) => s.update);
  const remove = useExtensions((s) => s.remove);
  const [name, setName] = useState(ext?.name ?? "");
  const [transport, setTransport] = useState<McpExtension["transport"]>(
    ext?.transport ?? "stdio",
  );
  const [commandLine, setCommandLine] = useState(
    ext?.command ? joinCommandLine([ext.command, ...ext.args]) : "",
  );
  const [url, setUrl] = useState(ext?.url ?? "");
  const [secrets, setSecrets] = useState<SecretRow[]>(() => {
    if (!ext) return [];
    const values = extensionSecrets(ext.id);
    return ext.secretKeys.map((key) => ({ key, value: values[key] ?? "" }));
  });
  const [error, setError] = useState<string | null>(null);
  const slug = extensionSlug(name);
  const stdio = transport === "stdio";

  const patchSecret = (i: number, patch: Partial<SecretRow>) =>
    setSecrets((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () => {
    const parts = splitCommandLine(commandLine.trim());
    const rows = secrets
      .map((r) => ({ key: r.key.trim(), value: r.value }))
      .filter((r) => r.key || r.value);
    const keyPattern = stdio ? /^[A-Za-z_][A-Za-z0-9_]*$/ : /^[A-Za-z0-9-]+$/;
    const badKey = rows.find((r) => !keyPattern.test(r.key));
    const dupKey = rows.find(
      (r, i) => rows.findIndex((x) => x.key.toLowerCase() === r.key.toLowerCase()) !== i,
    );
    const err =
      nameError(slug, "mcp", ext?.id) ??
      (stdio && parts.length === 0
        ? "Enter the command that starts the server."
        : !stdio && !/^https?:\/\/\S+$/i.test(url.trim())
          ? "Enter the server URL (https://…)."
          : badKey
            ? `“${badKey.key || "(empty)"}” isn't a valid ${stdio ? "variable" : "header"} name.`
            : dupKey
              ? `“${dupKey.key}” is listed twice.`
              : null);
    if (err) {
      setError(err);
      return;
    }
    const fields = {
      name: slug,
      transport,
      command: stdio ? parts[0] : "",
      args: stdio ? parts.slice(1) : [],
      url: stdio ? "" : url.trim(),
      secretKeys: rows.map((r) => r.key),
    };
    const id = ext ? ext.id : add({ kind: "mcp", enabled: true, ...fields }).id;
    if (ext) update(ext.id, fields);
    storeExtensionSecrets(
      id,
      Object.fromEntries(rows.map((r) => [r.key, r.value])),
    );
    onDone();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="github"
          spellCheck={false}
          autoFocus
          className={`${inputCls} font-mono`}
        />
      </Field>

      <div
        role="radiogroup"
        aria-label="Server type"
        className="flex w-fit items-center rounded-[7px] border border-line bg-panel-2 p-0.5"
      >
        {(["stdio", "http"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={transport === t}
            onClick={() => setTransport(t)}
            className={`h-6 rounded-[5px] px-2.5 text-[11.5px] transition-colors duration-150 ${
              transport === t ? "bg-elev text-ink" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            {t === "stdio" ? "Command" : "URL"}
          </button>
        ))}
      </div>

      {stdio ? (
        <Field
          label="Command"
          hint="Runs on this machine. npx/uvx download the server on first use."
        >
          <input
            value={commandLine}
            onChange={(e) => setCommandLine(e.target.value)}
            placeholder="npx -y @modelcontextprotocol/server-github"
            spellCheck={false}
            className={`${inputCls} font-mono`}
          />
        </Field>
      ) : (
        <Field
          label="URL"
          hint="Devin CLI connects through mcp-remote. Servers with a sign-in open the browser on first use."
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mcp.linear.app/mcp"
            spellCheck={false}
            className={`${inputCls} font-mono`}
          />
        </Field>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-ink-2">
          {stdio ? "Environment variables" : "Headers"}
        </span>
        {secrets.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.key}
              onChange={(e) => patchSecret(i, { key: e.target.value })}
              placeholder={stdio ? "GITHUB_TOKEN" : "Authorization"}
              spellCheck={false}
              className={`${inputCls} w-[40%] font-mono`}
            />
            <input
              type="password"
              value={r.value}
              onChange={(e) => patchSecret(i, { value: e.target.value })}
              placeholder={stdio ? "value" : "Bearer …"}
              className={`${inputCls} flex-1 font-mono`}
            />
            <button
              type="button"
              aria-label="Remove"
              onClick={() => setSecrets((rows) => rows.filter((_, j) => j !== i))}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-ink-3 hover:bg-hover hover:text-ink-2"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSecrets((rows) => [...rows, { key: "", value: "" }])}
          className={`${btn.ghost} w-fit`}
        >
          <Plus size={12} />
          Add {stdio ? "variable" : "header"}
        </button>
        <span className="text-[11.5px] text-ink-3">
          Values stay on this device and are kept apart from the list.
        </span>
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}
      <EditorFooter
        ext={ext}
        onCancel={onDone}
        onSave={save}
        onDelete={() => {
          if (ext) remove(ext.id);
          onDone();
        }}
      />
    </div>
  );
}
