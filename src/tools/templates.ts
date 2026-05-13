import { z } from "zod";
import { TFile } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";
import { safeVaultPath } from "../util/path";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

interface CorePluginsHost {
  internalPlugins?: {
    plugins?: Record<string, { enabled?: boolean; instance?: { options?: { folder?: string } } }>;
  };
}

function templatesFolder(app: unknown): string | null {
  const h = app as CorePluginsHost;
  const t = h.internalPlugins?.plugins?.["templates"];
  if (!t?.enabled) return null;
  const folder = (t.instance?.options?.folder ?? "").trim().replace(/^\/|\/$/g, "");
  return folder || null;
}

// Substitute the core Templates plugin's date/title placeholders.
// Templater (community plugin) uses richer syntax — not handled here.
export function expandTemplate(body: string, opts: { title?: string; now?: Date }): string {
  const now = opts.now ?? new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const isoDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const isoTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return body
    .replace(/{{date}}/g, isoDate)
    .replace(/{{time}}/g, isoTime)
    .replace(/{{title}}/g, opts.title ?? "");
}

export function registerTemplateTools(mcp: McpServer, { app }: ToolContext): void {
  mcp.tool(
    "list_templates",
    "List available templates from the core Templates plugin's configured folder. Returns paths; use get_template to read one.",
    {},
    async () => {
      const folder = templatesFolder(app);
      if (!folder) {
        return textResult(
          JSON.stringify({
            error: "core Templates plugin not enabled or folder not configured",
            templates: [],
          }),
        );
      }
      const files = app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.startsWith(folder + "/"))
        .map((f) => ({ path: f.path, mtime: f.stat.mtime }))
        .sort((a, b) => a.path.localeCompare(b.path));
      return textResult(JSON.stringify({ folder, count: files.length, templates: files }, null, 2));
    },
  );

  mcp.tool(
    "get_template",
    "Read a template file's raw markdown (placeholders not expanded). Use apply_template to expand and create a note.",
    { path: z.string() },
    async ({ path }) => {
      const safe = safeVaultPath(path);
      if (!safe.ok) return textResult(JSON.stringify({ error: safe.error, path }));
      const file = app.vault.getAbstractFileByPath(safe.path);
      if (!(file instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${safe.path}` }));
      }
      const body = await app.vault.cachedRead(file);
      return textResult(JSON.stringify({ path: file.path, body }, null, 2));
    },
  );

  mcp.tool(
    "apply_template",
    "Expand a template (substitutes {{date}}, {{time}}, {{title}}) and create a new note at `targetPath`. Fails if the target already exists. Only supports core Templates placeholders; Templater syntax is left as-is.",
    {
      templatePath: z.string(),
      targetPath: z.string(),
      title: z.string().optional(),
    },
    async ({ templatePath, targetPath, title }) => {
      const sTpl = safeVaultPath(templatePath);
      if (!sTpl.ok) return textResult(JSON.stringify({ error: sTpl.error, path: templatePath }));
      const sTarget = safeVaultPath(targetPath);
      if (!sTarget.ok) return textResult(JSON.stringify({ error: sTarget.error, path: targetPath }));
      try {
        const tpl = app.vault.getAbstractFileByPath(sTpl.path);
        if (!(tpl instanceof TFile)) {
          return textResult(JSON.stringify({ error: `template not found: ${sTpl.path}` }));
        }
        if (app.vault.getAbstractFileByPath(sTarget.path)) {
          return textResult(JSON.stringify({ error: `target already exists: ${sTarget.path}` }));
        }
        const raw = await app.vault.cachedRead(tpl);
        const expanded = expandTemplate(raw, {
          title: title ?? sTarget.path.split("/").pop()?.replace(/\.md$/, ""),
        });
        const parent = sTarget.path.includes("/")
          ? sTarget.path.slice(0, sTarget.path.lastIndexOf("/"))
          : "";
        if (parent && !app.vault.getAbstractFileByPath(parent)) {
          await app.vault.createFolder(parent);
        }
        const created = await app.vault.create(sTarget.path, expanded);
        return textResult(
          JSON.stringify({ created: created.path, fromTemplate: sTpl.path, title }, null, 2),
        );
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message }));
      }
    },
  );
}
