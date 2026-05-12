import { z } from "zod";
import { TFile } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

export function registerLinkTools(mcp: McpServer, { app }: ToolContext): void {
  mcp.tool(
    "list_backlinks",
    "List notes that link to the given note (resolved links only).",
    { path: z.string() },
    async ({ path }) => {
      const target = app.vault.getAbstractFileByPath(path);
      if (!(target instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${path}` }));
      }
      const resolved = (app.metadataCache as any).resolvedLinks as Record<
        string,
        Record<string, number>
      >;
      const sources: Array<{ source: string; count: number }> = [];
      for (const [source, links] of Object.entries(resolved)) {
        if (links[target.path]) sources.push({ source, count: links[target.path] });
      }
      sources.sort((a, b) => b.count - a.count);
      return textResult(JSON.stringify({ target: target.path, backlinks: sources }, null, 2));
    },
  );

  mcp.tool(
    "get_unresolved_links",
    "List wikilinks across the vault that do not yet resolve to a file. Useful for finding link targets to create.",
    {
      limit: z.number().int().positive().max(2000).default(200),
    },
    async ({ limit }) => {
      const unresolved = (app.metadataCache as any).unresolvedLinks as Record<
        string,
        Record<string, number>
      >;
      const items: Array<{ source: string; target: string; count: number }> = [];
      for (const [source, links] of Object.entries(unresolved)) {
        for (const [target, count] of Object.entries(links)) {
          items.push({ source, target, count });
          if (items.length >= limit) break;
        }
        if (items.length >= limit) break;
      }
      return textResult(JSON.stringify({ count: items.length, items }, null, 2));
    },
  );

  mcp.tool(
    "find_similar_notes",
    "Find notes that share tags or frontmatter keys with the given note. Cheap heuristic, not embedding-based.",
    {
      path: z.string(),
      limit: z.number().int().positive().max(50).default(10),
    },
    async ({ path, limit }) => {
      const target = app.vault.getAbstractFileByPath(path);
      if (!(target instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${path}` }));
      }
      const targetCache = app.metadataCache.getFileCache(target);
      const targetTags = new Set(
        (targetCache?.tags ?? []).map((t) => t.tag.replace(/^#/, "")),
      );
      const fmTags = ([] as string[]).concat(
        (targetCache?.frontmatter?.tags as string[] | string | undefined) ?? [],
      );
      for (const t of fmTags) targetTags.add(t);

      const scored: Array<{ path: string; score: number; sharedTags: string[] }> = [];
      for (const file of app.vault.getMarkdownFiles()) {
        if (file.path === target.path) continue;
        const c = app.metadataCache.getFileCache(file);
        const tags = new Set((c?.tags ?? []).map((t) => t.tag.replace(/^#/, "")));
        for (const t of ([] as string[]).concat(
          (c?.frontmatter?.tags as string[] | string | undefined) ?? [],
        )) {
          tags.add(t);
        }
        const shared = [...targetTags].filter((t) => tags.has(t));
        if (shared.length > 0) scored.push({ path: file.path, score: shared.length, sharedTags: shared });
      }
      scored.sort((a, b) => b.score - a.score);
      return textResult(JSON.stringify({ target: target.path, candidates: scored.slice(0, limit) }, null, 2));
    },
  );
}
