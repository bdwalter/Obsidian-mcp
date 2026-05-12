import { z } from "zod";
import { TFile } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

export function registerSearchTools(mcp: McpServer, { app }: ToolContext): void {
  mcp.tool(
    "search_vault",
    "Search the vault. Provide one of: query (substring, case-insensitive), tag (e.g. #project), or frontmatterKey+frontmatterValue.",
    {
      query: z.string().optional(),
      tag: z.string().optional(),
      frontmatterKey: z.string().optional(),
      frontmatterValue: z.string().optional(),
      folder: z.string().optional().describe("Restrict to this folder prefix."),
      limit: z.number().int().positive().max(500).default(50),
    },
    async (args) => {
      const { query, tag, frontmatterKey, frontmatterValue, folder, limit } = args;
      const files = app.vault.getMarkdownFiles().filter((f) => !folder || f.path.startsWith(folder));
      const hits: Array<{ path: string; snippet?: string }> = [];

      const normTag = tag?.startsWith("#") ? tag.slice(1) : tag;

      for (const file of files) {
        if (hits.length >= limit) break;
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

        if (query) {
          const body = await app.vault.cachedRead(file);
          const idx = body.toLowerCase().indexOf(query.toLowerCase());
          if (idx === -1) continue;
          const start = Math.max(0, idx - 60);
          const end = Math.min(body.length, idx + query.length + 60);
          hits.push({ path: file.path, snippet: body.slice(start, end).replace(/\s+/g, " ") });
        } else {
          hits.push({ path: file.path });
        }
      }

      return textResult(JSON.stringify({ count: hits.length, hits }, null, 2));
    },
  );

  mcp.tool(
    "list_notes",
    "List notes with optional folder filter and sort by mtime. Useful for stale-note discovery.",
    {
      folder: z.string().optional(),
      sortBy: z.enum(["mtime", "ctime", "path"]).default("mtime"),
      order: z.enum(["asc", "desc"]).default("desc"),
      limit: z.number().int().positive().max(1000).default(100),
    },
    async ({ folder, sortBy, order, limit }) => {
      let files: TFile[] = app.vault.getMarkdownFiles();
      if (folder) files = files.filter((f) => f.path.startsWith(folder));
      files.sort((a, b) => {
        const av = sortBy === "path" ? a.path : (a.stat as any)[sortBy];
        const bv = sortBy === "path" ? b.path : (b.stat as any)[sortBy];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return order === "asc" ? cmp : -cmp;
      });
      const items = files.slice(0, limit).map((f) => ({
        path: f.path,
        mtime: f.stat.mtime,
        ctime: f.stat.ctime,
        size: f.stat.size,
      }));
      return textResult(JSON.stringify({ count: items.length, items }, null, 2));
    },
  );
}
