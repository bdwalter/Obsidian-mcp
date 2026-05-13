import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./tools/registry";

export function registerPrompts(mcp: McpServer, _ctx: ToolContext): void {
  mcp.registerPrompt(
    "summarize-note",
    {
      description: "Summarize a single note in 3-5 bullet points. Use read_note to fetch the body.",
      argsSchema: {
        path: z.string().describe("Vault-relative path of the note to summarize."),
      },
    },
    async ({ path }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Read the note at \`${path}\` (use read_note) and produce a tight summary:

- 3-5 bullet points capturing the substance, not just the structure.
- Lead with the key claim or finding, not "this note discusses…"
- Preserve any concrete numbers, names, or decisions.
- If the note has unresolved links or open questions, list them last.`,
          },
        },
      ],
    }),
  );

  mcp.registerPrompt(
    "extract-action-items",
    {
      description: "Pull action items out of a note or a date range of daily notes.",
      argsSchema: {
        path: z.string().optional().describe("Specific note path, or omit to scan recent daily notes."),
        days: z.string().optional().describe("If `path` is omitted, look back this many days (default 7)."),
      },
    },
    async ({ path, days }) => {
      const target = path
        ? `the note at \`${path}\``
        : `the daily notes from the last ${days || 7} days (use get_daily_note with relative offsets like -0d, -1d…)`;
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Extract action items from ${target}.

Format each item as:
- [ ] <action> — <owner if mentioned> — <source note path>

Rules:
- Only items that are clearly things-to-do, not generic notes.
- Preserve original phrasing where possible.
- Skip duplicates across notes.
- If nothing actionable, say so explicitly.`,
            },
          },
        ],
      };
    },
  );

  mcp.registerPrompt(
    "find-stale-notes",
    {
      description: "Identify notes that haven't been updated in a while and might be candidates for archival or revival.",
      argsSchema: {
        threshold_days: z.string().optional().describe("Notes older than this many days are stale (default 90)."),
        folder: z.string().optional(),
      },
    },
    async ({ threshold_days, folder }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Use list_notes (sort=mtime, order=asc${folder ? `, folder="${folder}"` : ""}, limit=50) to find the oldest-modified notes. For each one older than ${threshold_days || 90} days:

1. Use read_note to peek at its contents.
2. Categorize: "archive" (one-off reference, no further work), "revive" (still relevant, needs an update), "keep" (intentionally evergreen).
3. For "archive" candidates, suggest a destination folder.
4. For "revive" candidates, suggest the smallest update that would make it current.

Output as a markdown table: path | mtime | category | suggested action.`,
          },
        },
      ],
    }),
  );
}
