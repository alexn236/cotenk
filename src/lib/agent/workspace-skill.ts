import { invoke } from "@tauri-apps/api/core";
import skill from "./cotenk-skill.md?raw";

/**
 * The workspace guide for agents (cotenk-skill.md) is copied into the
 * workspace folder before an agent starts. Claude Code discovers it as a
 * project skill; every other agent is pointed at it by the preamble.
 * Dot folders are skipped by the file sync, so it never shows up as a page.
 */
export const SKILL_PATH = ".claude/skills/cotenk-workspace/SKILL.md";

let installedFor: string | null = null;

export async function installWorkspaceSkill(root: string) {
  if (installedFor === root) return;
  const path = `${root.replace(/[\\/]+$/, "")}/${SKILL_PATH}`;
  try {
    const current = await invoke<string>("fs_read", { path }).catch(
      () => null,
    );
    if (current !== skill) await invoke("fs_write", { path, contents: skill });
    installedFor = root;
  } catch {
    /* read-only folder — agents still get the preamble */
  }
}
