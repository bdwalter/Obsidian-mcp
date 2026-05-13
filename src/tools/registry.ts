import type { App } from "obsidian";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClaudeMcpSettings } from "../settings";
import type { AuditLogger } from "../util/audit";
import { registerSearchTools } from "./search";
import { registerReadTools } from "./read";
import { registerWriteTools } from "./write";
import { registerLinkTools } from "./links";
import { registerAdminTools } from "./admin";
import { registerTemplateTools } from "./templates";

export interface ToolContext {
  app: App;
  settings: ClaudeMcpSettings;
  audit: AuditLogger;
}

export function registerAllTools(mcp: McpServer, ctx: ToolContext): void {
  registerSearchTools(mcp, ctx);
  registerReadTools(mcp, ctx);
  registerLinkTools(mcp, ctx);
  registerTemplateTools(mcp, ctx);
  registerAdminTools(mcp, ctx);
  if (!ctx.settings.readOnly) {
    registerWriteTools(mcp, ctx);
  }
}
