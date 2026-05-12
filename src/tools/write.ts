import { z } from "zod";
import { TFile } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";
import { backupToTrash } from "../util/trash";
import { safeVaultPath } from "../util/path";
import { decodeTrashName } from "../util/trash-name";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

function checkPath(p: string): { np: string } | { errorText: string } {
  const safe = safeVaultPath(p);
  if (!safe.ok) return { errorText: JSON.stringify({ error: safe.error, path: p }) };
  return { np: safe.path };
}

export function registerWriteTools(mcp: McpServer, { app, settings }: ToolContext): void {
  mcp.tool(
    "create_note",
    "Create a new note. Fails if the file already exists (use update_note for overwrite).",
    {
      path: z.string().describe("Vault-relative path including .md extension."),
      content: z.string(),
    },
    async ({ path, content }) => {
      const check = checkPath(path);
      if ("errorText" in check) return textResult(check.errorText);
      const np = check.np;
      try {
        if (app.vault.getAbstractFileByPath(np)) {
          return textResult(JSON.stringify({ error: `already exists: ${np}` }));
        }
        const parent = np.includes("/") ? np.slice(0, np.lastIndexOf("/")) : "";
        if (parent && !app.vault.getAbstractFileByPath(parent)) {
          await app.vault.createFolder(parent);
        }
        const file = await app.vault.create(np, content);
        return textResult(JSON.stringify({ path: file.path, created: true }));
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message, path: np }));
      }
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
      const check = checkPath(path);
      if ("errorText" in check) return textResult(check.errorText);
      const np = check.np;
      try {
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
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message, path: np }));
      }
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
      const check = checkPath(path);
      if ("errorText" in check) return textResult(check.errorText);
      const np = check.np;
      try {
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
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message, path: np }));
      }
    },
  );

  mcp.tool(
    "restore_note",
    "Restore a file from .trash/ back into the vault. If `target` is omitted, the destination is inferred from a backup created by update_note/prepend_to_note/append_to_note (filename pattern `<iso-ts>__<path-with-slashes-as-__>.md`).",
    {
      trashPath: z.string().describe("Vault-relative path inside .trash/, e.g. '.trash/Cold Coffee.md'."),
      target: z
        .string()
        .optional()
        .describe("Destination path. Required if trashPath isn't a timestamped backup."),
    },
    async ({ trashPath, target }) => {
      const checkTrash = checkPath(trashPath);
      if ("errorText" in checkTrash) return textResult(checkTrash.errorText);
      const np = checkTrash.np;
      try {
        if (!np.startsWith(".trash/")) {
          return textResult(JSON.stringify({ error: `trashPath must be inside .trash/: ${np}` }));
        }
        if (!(await app.vault.adapter.exists(np))) {
          return textResult(JSON.stringify({ error: `not found in trash: ${np}` }));
        }

        let dest = target;
        if (!dest) {
          const base = np.slice(".trash/".length);
          const decoded = decodeTrashName(base);
          if (decoded) {
            dest = decoded;
          } else {
            return textResult(
              JSON.stringify({
                error: `cannot infer target — pass 'target' for non-timestamped trash files (e.g. delete_note results)`,
              }),
            );
          }
        }

        const checkDest = checkPath(dest);
        if ("errorText" in checkDest) return textResult(checkDest.errorText);
        const destNorm = checkDest.np;
        if (app.vault.getAbstractFileByPath(destNorm)) {
          return textResult(JSON.stringify({ error: `target already exists: ${destNorm}` }));
        }
        const parent = destNorm.includes("/") ? destNorm.slice(0, destNorm.lastIndexOf("/")) : "";
        if (parent && !app.vault.getAbstractFileByPath(parent)) {
          await app.vault.createFolder(parent);
        }
        await app.vault.adapter.rename(np, destNorm);
        return textResult(JSON.stringify({ restored: destNorm, from: np }));
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message, path: np }));
      }
    },
  );

  mcp.tool(
    "delete_note",
    "Move a note to Obsidian's .trash/ (recoverable). Use Obsidian itself to permanently delete from trash.",
    {
      path: z.string(),
    },
    async ({ path }) => {
      const check = checkPath(path);
      if ("errorText" in check) return textResult(check.errorText);
      const np = check.np;
      try {
        const file = app.vault.getAbstractFileByPath(np);
        if (!(file instanceof TFile)) {
          return textResult(JSON.stringify({ error: `not found: ${np}` }));
        }
        await app.vault.trash(file, false);
        return textResult(JSON.stringify({ path: np, deleted: true, location: ".trash/" }));
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message, path: np }));
      }
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
      const check = checkPath(path);
      if ("errorText" in check) return textResult(check.errorText);
      const np = check.np;
      try {
        const file = app.vault.getAbstractFileByPath(np);
        if (!(file instanceof TFile)) {
          return textResult(JSON.stringify({ error: `not found: ${np}` }));
        }
        let backup: string | null = null;
        if (settings.trashOnWrite) backup = await backupToTrash(app, np);

        if (!heading) {
          const cur = await app.vault.read(file);
          const sep = cur.length === 0 || cur.endsWith("\n") ? "" : "\n";
          await app.vault.modify(file, cur + sep + content + "\n");
          return textResult(JSON.stringify({ path: file.path, appended: true, backup }));
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
        return textResult(
          JSON.stringify({ path: file.path, appended: true, underHeading: heading, backup }),
        );
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message, path: np }));
      }
    },
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
