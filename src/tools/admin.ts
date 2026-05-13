import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./registry";
import { safeVaultPath } from "../util/path";

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

declare const PLUGIN_VERSION: string;

export function registerAdminTools(mcp: McpServer, { app, settings }: ToolContext): void {
  mcp.tool(
    "get_server_info",
    "Returns plugin version, vault name, read-only state, and the registered tool count. Use this to probe capabilities before invoking other tools.",
    {},
    async () => {
      const tools = (mcp as unknown as { _registeredTools?: Record<string, unknown> })
        ._registeredTools;
      const toolCount = tools ? Object.keys(tools).length : null;
      return textResult(
        JSON.stringify(
          {
            plugin: "obsidian-claude-mcp",
            version: typeof PLUGIN_VERSION === "string" ? PLUGIN_VERSION : "unknown",
            vault: app.vault.getName(),
            readOnly: settings.readOnly,
            trashOnWrite: settings.trashOnWrite,
            writeAllowFolders: settings.writeAllowFolders ?? null,
            auditLog: !!settings.auditLog,
            toolCount,
          },
          null,
          2,
        ),
      );
    },
  );

  mcp.tool(
    "open_note_in_obsidian",
    "Open a note in the active Obsidian window. Does not return content — use read_note for that. Useful as a final step after find/search to focus the user's attention.",
    { path: z.string() },
    async ({ path }) => {
      const safe = safeVaultPath(path);
      if (!safe.ok) {
        return textResult(JSON.stringify({ error: safe.error, path }));
      }
      try {
        await app.workspace.openLinkText(safe.path, "", false);
        return textResult(JSON.stringify({ opened: safe.path }));
      } catch (e) {
        return textResult(JSON.stringify({ error: (e as Error).message, path: safe.path }));
      }
    },
  );
}
