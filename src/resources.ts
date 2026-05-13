import { TFile } from "obsidian";
import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./tools/registry";

const MAX_RESOURCE_LIST = 500;

export function registerResources(mcp: McpServer, { app }: ToolContext): void {
  const template = new ResourceTemplate("obsidian-note:///{+path}", {
    list: async () => {
      const files = app.vault.getMarkdownFiles().slice(0, MAX_RESOURCE_LIST);
      return {
        resources: files.map((f) => ({
          uri: `obsidian-note:///${encodeURI(f.path)}`,
          name: f.path,
          mimeType: "text/markdown",
        })),
      };
    },
  });

  mcp.registerResource(
    "vault-notes",
    template,
    {
      description:
        "Markdown notes in the Obsidian vault. URI shape: obsidian-note:///<vault-relative path>. Listing is capped at 500 — use the search_vault or list_notes tools for large vaults.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const rawPath = typeof variables.path === "string" ? variables.path : Array.isArray(variables.path) ? variables.path[0] : "";
      const path = decodeURIComponent(rawPath);
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        throw new Error(`note not found: ${path}`);
      }
      const text = await app.vault.cachedRead(file);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    },
  );
}
