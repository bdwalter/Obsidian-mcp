import { z } from "zod";
import { TFile, TFolder } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

export function registerSearchTools(mcp: McpServer, { app }: ToolContext): void {
  mcp.tool(
    "search_vault",
    "Search the vault. Filters compose: query (body substring), filename (path/basename substring), tag (e.g. #project), frontmatterKey+frontmatterValue. Use offset+limit to page.",
    {
      query: z
        .string()
        .optional()
        .describe("Substring match against note body (case-insensitive)."),
      filename: z
        .string()
        .optional()
        .describe("Substring match against the file path/name (case-insensitive)."),
      tag: z.string().optional(),
      frontmatterKey: z.string().optional(),
      frontmatterValue: z.string().optional(),
      folder: z.string().optional().describe("Restrict to this folder prefix."),
      limit: z.number().int().positive().max(500).default(50),
      offset: z.number().int().min(0).default(0),
    },
    async (args) => {
      const { query, filename, tag, frontmatterKey, frontmatterValue, folder, limit, offset } =
        args;
      const files = app.vault
        .getMarkdownFiles()
        .filter((f) => !folder || f.path.startsWith(folder));
      const hits: Array<{ path: string; snippet?: string }> = [];
      let skipped = 0;
      let totalMatched = 0;

      const normTag = tag?.startsWith("#") ? tag.slice(1) : tag;
      const filenameLower = filename?.toLowerCase();
      const queryLower = query?.toLowerCase();

      for (const file of files) {
        if (hits.length >= limit && totalMatched > offset + limit) break;

        if (filenameLower && !file.path.toLowerCase().includes(filenameLower)) continue;

        const cache = app.metadataCache.getFileCache(file);

        if (normTag) {
          const tags = (cache?.tags ?? []).map((t) => t.tag.replace(/^#/, ""));
          const fmTags = ([] as string[]).concat(
            (cache?.frontmatter?.tags as string[] | string | undefined) ?? [],
          );
          if (!tags.includes(normTag) && !fmTags.includes(normTag)) continue;
        }

        if (frontmatterKey) {
          const v = cache?.frontmatter?.[frontmatterKey];
          if (v === undefined) continue;
          if (frontmatterValue !== undefined && String(v) !== frontmatterValue) continue;
        }

        let snippet: string | undefined;
        if (queryLower) {
          const body = await app.vault.cachedRead(file);
          const idx = body.toLowerCase().indexOf(queryLower);
          if (idx === -1) continue;
          const start = Math.max(0, idx - 60);
          const end = Math.min(body.length, idx + queryLower.length + 60);
          snippet = body.slice(start, end).replace(/\s+/g, " ");
        }

        totalMatched++;
        if (skipped < offset) {
          skipped++;
          continue;
        }
        if (hits.length < limit) {
          hits.push(snippet ? { path: file.path, snippet } : { path: file.path });
        }
      }

      return textResult(
        JSON.stringify({ count: hits.length, totalMatched, offset, limit, hits }, null, 2),
      );
    },
  );

  mcp.tool(
    "get_metadata_keys",
    "List frontmatter keys used across the vault with usage counts. Optionally restrict to a folder.",
    {
      folder: z.string().optional(),
    },
    async ({ folder }) => {
      const files = app.vault
        .getMarkdownFiles()
        .filter((f) => !folder || f.path.startsWith(folder));
      const counts = new Map<string, number>();
      for (const f of files) {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) continue;
        for (const k of Object.keys(fm)) {
          if (k === "position") continue;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      const items = [...counts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);
      return textResult(
        JSON.stringify({ scanned: files.length, count: items.length, items }, null, 2),
      );
    },
  );

  mcp.tool(
    "list_folders",
    "List folders in the vault. Use `folder` to scope to a subtree and `recursive` to control depth.",
    {
      folder: z.string().optional().describe("Parent folder. Omit for vault root."),
      recursive: z.boolean().default(true),
    },
    async ({ folder, recursive }) => {
      const root = folder ? app.vault.getAbstractFileByPath(folder) : app.vault.getRoot();
      if (!(root instanceof TFolder)) {
        return textResult(JSON.stringify({ error: `folder not found: ${folder}` }));
      }
      const out: Array<{ path: string; noteCount: number; subfolderCount: number }> = [];
      const walk = (f: TFolder) => {
        for (const child of f.children) {
          if (child instanceof TFolder) {
            const notes = child.children.filter(
              (c) => c instanceof TFile && c.extension === "md",
            ).length;
            const subs = child.children.filter((c) => c instanceof TFolder).length;
            out.push({ path: child.path, noteCount: notes, subfolderCount: subs });
            if (recursive) walk(child);
          }
        }
      };
      walk(root);
      out.sort((a, b) => (a.path < b.path ? -1 : 1));
      return textResult(JSON.stringify({ count: out.length, folders: out }, null, 2));
    },
  );

  mcp.tool(
    "list_notes",
    "List notes with optional folder filter, recursive flag, sort, and pagination.",
    {
      folder: z.string().optional(),
      recursive: z
        .boolean()
        .default(true)
        .describe("If false, only return notes directly in `folder` (no subfolders)."),
      sortBy: z.enum(["mtime", "ctime", "path"]).default("mtime"),
      order: z.enum(["asc", "desc"]).default("desc"),
      limit: z.number().int().positive().max(1000).default(100),
      offset: z.number().int().min(0).default(0),
    },
    async ({ folder, recursive, sortBy, order, limit, offset }) => {
      let files: TFile[] = app.vault.getMarkdownFiles();
      if (folder) {
        const prefix = folder.endsWith("/") ? folder : folder + "/";
        files = files.filter((f) => {
          if (!f.path.startsWith(prefix) && f.path !== folder) return false;
          if (recursive) return true;
          const rest = f.path.slice(prefix.length);
          return !rest.includes("/");
        });
      }
      files.sort((a, b) => {
        const av = sortBy === "path" ? a.path : (a.stat as any)[sortBy];
        const bv = sortBy === "path" ? b.path : (b.stat as any)[sortBy];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return order === "asc" ? cmp : -cmp;
      });
      const total = files.length;
      const items = files.slice(offset, offset + limit).map((f) => ({
        path: f.path,
        mtime: f.stat.mtime,
        ctime: f.stat.ctime,
        size: f.stat.size,
      }));
      return textResult(
        JSON.stringify({ count: items.length, total, offset, limit, items }, null, 2),
      );
    },
  );
}
