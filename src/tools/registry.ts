import type { App } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClaudeMcpSettings } from "../settings";
import { registerSearchTools } from "./search";
import { registerReadTools } from "./read";
import { registerWriteTools } from "./write";
import { registerLinkTools } from "./links";

export interface ToolContext {
  app: App;
  settings: ClaudeMcpSettings;
}

export function registerAllTools(mcp: McpServer, ctx: ToolContext): void {
  registerSearchTools(mcp, ctx);
  registerReadTools(mcp, ctx);
  registerLinkTools(mcp, ctx);
  if (!ctx.settings.readOnly) {
    registerWriteTools(mcp, ctx);
  }
}
