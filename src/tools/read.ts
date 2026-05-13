import { z } from "zod";
import { TFile } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";
import { resolveDate } from "../util/date";
import { stripFrontmatter } from "../util/markdown";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

function dailyNoteCandidates(app: any, target: string): string[] {
  const out: string[] = [];
  const dn = app.internalPlugins?.plugins?.["daily-notes"];
  if (dn?.enabled) {
    const opts = dn.instance?.options ?? {};
    const folder = (opts.folder ?? "").trim().replace(/^\/|\/$/g, "");
    const format = (opts.format ?? "YYYY-MM-DD").trim();
    const moment = (window as any).moment;
    let filename = target;
    if (moment && format) {
      try {
        filename = moment(target, "YYYY-MM-DD").format(format);
      } catch {
        /* fall back to ISO target */
      }
    }
    out.push(folder ? `${folder}/${filename}.md` : `${filename}.md`);
  }
  for (const fallback of [
    `${target}.md`,
    `Daily/${target}.md`,
    `Daily Notes/${target}.md`,
    `Journal/${target}.md`,
  ]) {
    if (!out.includes(fallback)) out.push(fallback);
  }
  return out;
}

export function registerReadTools(mcp: McpServer, { app }: ToolContext): void {
  mcp.tool(
    "read_note",
    "Read a note's markdown content. Returns parsed frontmatter and the body with the frontmatter block stripped.",
    { path: z.string() },
    async ({ path }) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${path}` }));
      }
      if (file.extension !== "md") {
        return textResult(
          JSON.stringify({ error: `not a markdown note: ${path} (.${file.extension})` }),
        );
      }
      const raw = await app.vault.cachedRead(file);
      const body = stripFrontmatter(raw);
      const cache = app.metadataCache.getFileCache(file);
      const tags = new Set((cache?.tags ?? []).map((t) => t.tag.replace(/^#/, "")));
      const fmTags = ([] as string[]).concat(
        (cache?.frontmatter?.tags as string[] | string | undefined) ?? [],
      );
      for (const t of fmTags) tags.add(t);
      return textResult(
        JSON.stringify(
          {
            path: file.path,
            frontmatter: cache?.frontmatter ?? null,
            tags: [...tags],
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
      const candidates = dailyNoteCandidates(app, target);
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

  mcp.tool(
    "list_tags",
    "List all tags used across the vault with usage counts. Combines inline #tags and frontmatter tags. Sorted by count descending.",
    {
      folder: z
        .string()
        .optional()
        .describe("Restrict to notes inside this folder prefix."),
    },
    async ({ folder }) => {
      const files = app.vault
        .getMarkdownFiles()
        .filter((f) => !folder || f.path.startsWith(folder));
      const counts = new Map<string, number>();
      for (const f of files) {
        const c = app.metadataCache.getFileCache(f);
        const inline = (c?.tags ?? []).map((t) => t.tag.replace(/^#/, ""));
        const fm = ([] as string[]).concat(
          (c?.frontmatter?.tags as string[] | string | undefined) ?? [],
        );
        const seen = new Set<string>();
        for (const t of [...inline, ...fm]) {
          if (!t || seen.has(t)) continue;
          seen.add(t);
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
      const items = [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
      return textResult(
        JSON.stringify({ scanned: files.length, count: items.length, items }, null, 2),
      );
    },
  );

  mcp.tool(
    "get_note_outline",
    "Returns the heading hierarchy of a note (level, text, line offset). Pulled from Obsidian's metadata cache — cheap, no body parse.",
    { path: z.string() },
    async ({ path }) => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        return textResult(JSON.stringify({ error: `not found: ${path}` }));
      }
      const cache = app.metadataCache.getFileCache(file);
      const headings = (cache?.headings ?? []).map((h) => ({
        level: h.level,
        text: h.heading,
        line: h.position.start.line,
      }));
      return textResult(
        JSON.stringify({ path: file.path, count: headings.length, headings }, null, 2),
      );
    },
  );
}
