import { useWorkspace } from "./store";
import { toast } from "./toast";
import { askAgent } from "./agent-actions";
import { isDesktop } from "./workspace";
import { buildImport, filesFromDrop, filesFromList, type RawFile } from "./importer";

export { filesFromDrop, filesFromList };

const SOURCE_LABEL = {
  notion: "Notion",
  obsidian: "Obsidian",
  markdown: "your files",
} as const;

/**
 * Converts dropped/picked files into pages, adds them to the workspace
 * (sync and the folder mirror pick them up from there) and opens the
 * first one. Returns the number of pages created.
 */
export function runImport(files: RawFile[]): number {
  const st = useWorkspace.getState();
  const plan = buildImport(files, st);
  if (plan.docs.length === 0) {
    toast(
      plan.duplicates > 0
        ? "Those pages are already in your workspace."
        : "Nothing to import — drop .md, .txt, .csv or a Notion .zip export.",
      { tone: plan.duplicates > 0 ? "default" : "error" },
    );
    return 0;
  }
  useWorkspace.setState((s) => ({
    folders: [...s.folders, ...plan.folders],
    docs: [...plan.docs, ...s.docs],
    activeDocId: plan.docs[0].id,
    railSection: "docs",
    importOpen: false,
  }));

  const n = plan.docs.length;
  const from = SOURCE_LABEL[plan.source];
  const folderNames = [
    ...new Set(
      plan.docs
        .map((d) => useWorkspace.getState().folders.find((f) => f.id === d.folderId)?.name)
        .filter((x): x is string => !!x),
    ),
  ];
  const extra = [
    plan.skipped > 0 ? `${plan.skipped} attachment${plan.skipped === 1 ? "" : "s"} skipped` : null,
    plan.duplicates > 0 ? `${plan.duplicates} already here` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  toast(
    `Imported ${n} ${n === 1 ? "page" : "pages"} from ${from}${extra ? ` — ${extra}` : ""}`,
    {
      ttlMs: 12_000,
      action: isDesktop()
        ? {
            label: "Summarize with agent",
            run: () =>
              askAgent({
                title: `Overview of the ${from} import`,
                prompt: [
                  `I just imported ${n} pages from ${from}${
                    folderNames.length
                      ? ` (folder${folderNames.length > 1 ? "s" : ""} ${folderNames
                          .slice(0, 5)
                          .map((f) => `"${f}"`)
                          .join(", ")})`
                      : ""
                  }.`,
                  `Read them and create a new page "Overview — ${from} import" in the workspace root: the key themes, decisions and open questions, then every open task as "- [ ]" items. Link each point to its source page as [[Page title]].`,
                ].join("\n\n"),
              }),
          }
        : undefined,
    },
  );
  return n;
}
