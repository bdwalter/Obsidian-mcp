import { z } from "zod";
import { TFile } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

function resolveDate(input: string | undefined): string {
  const now = new Date();
  const isoToday = () => {
    const d = new Date(now);
    return d.toISOString().slice(0, 10);
  };
  if (!input) return isoToday();
  const lower = input.toLowerCase().trim();
  if (lower === "today") return isoToday();
  if (lower === "yesterday") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (lower === "tomorrow") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const rel = lower.match(/^([+-])(\d+)([dw])$/);
  if (rel) {
    const sign = rel[1] === "-" ? -1 : 1;
    const n = parseInt(rel[2], 10) * (rel[3] === "w" ? 7 : 1);
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + sign * n);
    return d.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return isoToday();
}

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
    "Get the daily note for a given date. Accepts ISO (YYYY-MM-DD), 'today', 'yesterday', 'tomorrow', or relative offsets like '+1d', '-7d', '+2w'.",
    {
      date: z
        .string()
        .optional()
        .describe("ISO date, keyword (today|yesterday|tomorrow), or relative offset (e.g. -7d, +2w). Defaults to today."),
    },
    async ({ date }) => {
      const target = resolveDate(date);
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
