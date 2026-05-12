import { z } from "zod";
import { TFile, normalizePath } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";
import { backupToTrash } from "../util/trash";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

export function registerWriteTools(mcp: McpServer, { app, settings }: ToolContext): void {
  mcp.tool(
    "create_note",
    "Create a new note. Fails if the file already exists (use update_note for overwrite).",
    {
      path: z.string().describe("Vault-relative path including .md extension."),
      content: z.string(),
    },
    async ({ path, content }) => {
      const np = normalizePath(path);
      if (app.vault.getAbstractFileByPath(np)) {
        return textResult(JSON.stringify({ error: `already exists: ${np}` }));
      }
      const parent = np.includes("/") ? np.slice(0, np.lastIndexOf("/")) : "";
      if (parent && !app.vault.getAbstractFileByPath(parent)) {
        await app.vault.createFolder(parent);
      }
      const file = await app.vault.create(np, content);
      return textResult(JSON.stringify({ path: file.path, created: true }));
    },
  );

  mcp.tool(
    "update_note",
    "Overwrite a note's contents. Backs up prior contents into .trash/ if backup-on-overwrite is enabled.",
    {
      path: z.string(),
      content: z.string(),
    },
    async ({ path, content }) => {
      const np = normalizePath(path);
      const file = app.vault.getAbstractFileByPath(np);
      if (!(file instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${np}` }));
      }
      let backup: string | null = null;
      if (settings.trashOnWrite) {
        backup = await backupToTrash(app, np);
      }
      await app.vault.modify(file, content);
      return textResult(JSON.stringify({ path: file.path, updated: true, backup }));
    },
  );

  mcp.tool(
    "prepend_to_note",
    "Prepend text to an existing note (after frontmatter if present). Backs up prior contents to .trash/ if enabled.",
    {
      path: z.string(),
      content: z.string(),
    },
    async ({ path, content }) => {
      const np = normalizePath(path);
      const file = app.vault.getAbstractFileByPath(np);
      if (!(file instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${np}` }));
      }
      let backup: string | null = null;
      if (settings.trashOnWrite) backup = await backupToTrash(app, np);

      const cur = await app.vault.read(file);
      const fmMatch = cur.match(/^---\n[\s\S]*?\n---\n/);
      let next: string;
      if (fmMatch) {
        const head = fmMatch[0];
        const rest = cur.slice(head.length);
        next = head + content + (content.endsWith("\n") ? "" : "\n") + rest;
      } else {
        next = content + (content.endsWith("\n") ? "" : "\n") + cur;
      }
      await app.vault.modify(file, next);
      return textResult(JSON.stringify({ path: file.path, prepended: true, backup }));
    },
  );

  mcp.tool(
    "delete_note",
    "Move a note to Obsidian's .trash/ (recoverable). Use Obsidian itself to permanently delete from trash.",
    {
      path: z.string(),
    },
    async ({ path }) => {
      const np = normalizePath(path);
      const file = app.vault.getAbstractFileByPath(np);
      if (!(file instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${np}` }));
      }
      await app.vault.trash(file, false);
      return textResult(JSON.stringify({ path: np, deleted: true, location: ".trash/" }));
    },
  );

  mcp.tool(
    "append_to_note",
    "Append text to an existing note (creates a leading newline if missing). Use 'heading' to append under a specific heading.",
    {
      path: z.string(),
      content: z.string(),
      heading: z.string().optional(),
    },
    async ({ path, content, heading }) => {
      const np = normalizePath(path);
      const file = app.vault.getAbstractFileByPath(np);
      if (!(file instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${np}` }));
      }

      if (!heading) {
        const cur = await app.vault.read(file);
        const sep = cur.length === 0 || cur.endsWith("\n") ? "" : "\n";
        await app.vault.modify(file, cur + sep + content + "\n");
        return textResult(JSON.stringify({ path: file.path, appended: true }));
      }

      const cur = await app.vault.read(file);
      const lines = cur.split("\n");
      const headingRe = new RegExp(`^#{1,6}\\s+${escapeRegex(heading)}\\s*$`);
      let insertAt = -1;
      for (let i = 0; i < lines.length; i++) {
        if (headingRe.test(lines[i])) {
          insertAt = i + 1;
          while (insertAt < lines.length && !/^#{1,6}\s+/.test(lines[insertAt])) insertAt++;
          break;
        }
      }
      if (insertAt === -1) {
        return textResult(JSON.stringify({ error: `heading not found: ${heading}` }));
      }
      lines.splice(insertAt, 0, content);
      await app.vault.modify(file, lines.join("\n"));
      return textResult(JSON.stringify({ path: file.path, appended: true, underHeading: heading }));
    },
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
