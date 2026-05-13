import { z } from "zod";
import { TFile } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";
import { backupToTrash } from "../util/trash";
import { safeVaultPath } from "../util/path";
import { decodeTrashName } from "../util/trash-name";
import { isWriteAllowed, type AuditLogger } from "../util/audit";
import type { ClaudeMcpSettings } from "../settings";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

function checkSafePath(p: string): { np: string } | { errorText: string } {
  const safe = safeVaultPath(p);
  if (!safe.ok) return { errorText: JSON.stringify({ error: safe.error, path: p }) };
  return { np: safe.path };
}

function checkPath(p: string, settings: ClaudeMcpSettings): { np: string } | { errorText: string } {
  const safe = checkSafePath(p);
  if ("errorText" in safe) return safe;
  if (!isWriteAllowed(safe.np, settings)) {
    return {
      errorText: JSON.stringify({
        error: `path not in write allow-list (allowed prefixes: ${settings.writeAllowFolders.join(", ")})`,
        path: safe.np,
      }),
    };
  }
  return { np: safe.np };
}

type TextOut = { content: Array<{ type: "text"; text: string }> };

async function auditCallResult(
  audit: AuditLogger,
  tool: string,
  args: Record<string, unknown>,
  out: TextOut,
): Promise<void> {
  let result: "ok" | "error" = "ok";
  let detail: string | undefined;
  try {
    const parsed = JSON.parse(out.content[0]?.text ?? "{}");
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      result = "error";
      detail = String(parsed.error);
    }
  } catch {
    /* non-JSON content — leave result as ok */
  }
  await audit.log({ tool, args, result, detail });
}

// Wrap a tool registration so every call is appended to the audit log.
// `handler` types are loose intentionally — the actual MCP SDK overload
// validates the shape via Zod at runtime.
function registerAudited(
  mcp: McpServer,
  audit: AuditLogger,
  name: string,
  description: string,
  schema: Record<string, z.ZodTypeAny>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<TextOut>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcp.tool(name, description, schema as any, async (args: any) => {
    const out = await handler(args);
    await auditCallResult(audit, name, args as Record<string, unknown>, out);
    return out;
  });
}

export function registerWriteTools(mcp: McpServer, { app, settings, audit }: ToolContext): void {
  registerAudited(mcp, audit, 
    "create_note",
    "Create a new note. Fails if the file already exists (use update_note for overwrite).",
    {
      path: z.string().describe("Vault-relative path including .md extension."),
      content: z.string(),
    },
    async ({ path, content }) => {
      const check = checkPath(path, settings);
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

  registerAudited(mcp, audit, 
    "update_note",
    "Overwrite a note's contents. Backs up prior contents into .trash/ if backup-on-overwrite is enabled.",
    {
      path: z.string(),
      content: z.string(),
    },
    async ({ path, content }) => {
      const check = checkPath(path, settings);
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

  registerAudited(mcp, audit, 
    "prepend_to_note",
    "Prepend text to an existing note (after frontmatter if present). Backs up prior contents to .trash/ if enabled.",
    {
      path: z.string(),
      content: z.string(),
    },
    async ({ path, content }) => {
      const check = checkPath(path, settings);
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

  registerAudited(mcp, audit, 
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
      const checkTrash = checkSafePath(trashPath);
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

        const checkDest = checkPath(dest, settings);
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

  registerAudited(mcp, audit, 
    "rename_note",
    "Rename or move a note. Uses Obsidian's fileManager so all incoming wikilinks are auto-updated across the vault. Both `from` and `to` are vault-relative .md paths.",
    {
      from: z.string(),
      to: z.string(),
    },
    async ({ from, to }) => {
      const cFrom = checkPath(from, settings);
      if ("errorText" in cFrom) return textResult(cFrom.errorText);
      const cTo = checkPath(to, settings);
      if ("errorText" in cTo) return textResult(cTo.errorText);
      try {
        const file = app.vault.getAbstractFileByPath(cFrom.np);
        if (!(file instanceof TFile)) {
          return textResult(JSON.stringify({ error: `not found: ${cFrom.np}` }));
        }
        if (app.vault.getAbstractFileByPath(cTo.np)) {
          return textResult(JSON.stringify({ error: `target already exists: ${cTo.np}` }));
        }
        const parent = cTo.np.includes("/") ? cTo.np.slice(0, cTo.np.lastIndexOf("/")) : "";
        if (parent && !app.vault.getAbstractFileByPath(parent)) {
          await app.vault.createFolder(parent);
        }
        await app.fileManager.renameFile(file, cTo.np);
        return textResult(JSON.stringify({ from: cFrom.np, to: cTo.np, renamed: true }));
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message, from: cFrom.np, to: cTo.np }));
      }
    },
  );

  registerAudited(mcp, audit, 
    "update_frontmatter",
    "Surgically update a note's YAML frontmatter without rewriting the body. Pass `set` to assign keys, `unset` to remove keys, or both. Backs up the prior note contents to .trash/ if backup-on-overwrite is enabled.",
    {
      path: z.string(),
      set: z.record(z.unknown()).optional().describe("Keys to set; values overwrite existing."),
      unset: z.array(z.string()).optional().describe("Keys to remove."),
    },
    async ({ path, set, unset }) => {
      const check = checkPath(path, settings);
      if ("errorText" in check) return textResult(check.errorText);
      const np = check.np;
      try {
        const file = app.vault.getAbstractFileByPath(np);
        if (!(file instanceof TFile)) {
          return textResult(JSON.stringify({ error: `not found: ${np}` }));
        }
        let backup: string | null = null;
        if (settings.trashOnWrite) backup = await backupToTrash(app, np);

        const changes: { set: string[]; unset: string[] } = { set: [], unset: [] };
        await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
          if (set) {
            for (const [k, v] of Object.entries(set)) {
              fm[k] = v;
              changes.set.push(k);
            }
          }
          if (unset) {
            for (const k of unset) {
              if (k in fm) {
                delete fm[k];
                changes.unset.push(k);
              }
            }
          }
        });
        return textResult(JSON.stringify({ path: file.path, updated: true, changes, backup }));
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message, path: np }));
      }
    },
  );

  registerAudited(mcp, audit, 
    "delete_note",
    "Move a note to Obsidian's .trash/ (recoverable). Use Obsidian itself to permanently delete from trash.",
    {
      path: z.string(),
    },
    async ({ path }) => {
      const check = checkPath(path, settings);
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

  registerAudited(mcp, audit, 
    "append_to_note",
    "Append text to an existing note (creates a leading newline if missing). Use 'heading' to append under a specific heading.",
    {
      path: z.string(),
      content: z.string(),
      heading: z.string().optional(),
    },
    async ({ path, content, heading }) => {
      const check = checkPath(path, settings);
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
