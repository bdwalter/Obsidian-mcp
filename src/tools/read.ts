import { z } from "zod";
import { TFile } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

export function registerReadTools(mcp: McpServer, { app }: ToolContext): void {
  mcp.tool(
    "read_note",
    "Read a note's markdown content. Returns frontmatter (parsed) plus body.",
    { path: z.string() },
    async ({ path }) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${path}` }));
      }
      const body = await app.vault.cachedRead(file);
      const cache = app.metadataCache.getFileCache(file);
      return textResult(
        JSON.stringify(
          {
            path: file.path,
            frontmatter: cache?.frontmatter ?? null,
            tags: (cache?.tags ?? []).map((t) => t.tag),
            mtime: file.stat.mtime,
            body,
          },
          null,
          2,
        ),
      );
    },
  );

  mcp.tool(
    "get_daily_note",
    "Get today's daily note (or another date). Looks in the configured Daily Notes folder if the core/community plugin is enabled, else falls back to 'Daily/YYYY-MM-DD.md'.",
    {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("ISO date YYYY-MM-DD. Defaults to today."),
    },
    async ({ date }) => {
      const target = date ?? new Date().toISOString().slice(0, 10);
      const candidates = [
        `${target}.md`,
        `Daily/${target}.md`,
        `Daily Notes/${target}.md`,
        `Journal/${target}.md`,
      ];
      for (const path of candidates) {
        const file = app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          const body = await app.vault.cachedRead(file);
          return textResult(JSON.stringify({ path: file.path, body }, null, 2));
        }
      }
      return textResult(
        JSON.stringify({ error: `daily note not found for ${target}`, tried: candidates }),
      );
    },
  );
}
