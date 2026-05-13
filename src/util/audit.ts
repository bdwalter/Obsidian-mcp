import { App, normalizePath } from "obsidian";
import type { ClaudeMcpSettings } from "../settings";

export type AuditEntry = {
  tool: string;
  args: Record<string, unknown>;
  result: "ok" | "error";
  detail?: string;
};

export interface AuditLogger {
  log(entry: AuditEntry): Promise<void>;
}

export function makeAuditLogger(app: App, settings: ClaudeMcpSettings): AuditLogger {
  return {
    async log(entry) {
      if (!settings.auditLog) return;
      const path = normalizePath(settings.auditLogPath || ".claude-mcp-audit.md");
      const ts = new Date().toISOString();
      // Trim large arg values so the log stays readable
      const safeArgs = Object.fromEntries(
        Object.entries(entry.args).map(([k, v]) => {
          if (typeof v === "string" && v.length > 200)
            return [k, v.slice(0, 200) + `…(+${v.length - 200} chars)`];
          return [k, v];
        }),
      );
      const line = `- ${ts} \`${entry.tool}\` ${entry.result === "ok" ? "✓" : "✗"} \`${JSON.stringify(safeArgs)}\`${entry.detail ? ` — ${entry.detail}` : ""}`;
      const adapter = app.vault.adapter;
      try {
        if (await adapter.exists(path)) {
          const cur = await adapter.read(path);
          const sep = cur.length === 0 || cur.endsWith("\n") ? "" : "\n";
          await adapter.write(path, cur + sep + line + "\n");
        } else {
          const header = `# Claude MCP audit log\n\nEach line records a tool call: timestamp, tool name, result, arguments.\n\n`;
          await adapter.write(path, header + line + "\n");
        }
      } catch {
        // Audit failure should never break the tool call — swallow.
      }
    },
  };
}

export function isWriteAllowed(path: string, settings: ClaudeMcpSettings): boolean {
  if (!settings.writeAllowFolders || settings.writeAllowFolders.length === 0) return true;
  return settings.writeAllowFolders.some((prefix) => {
    if (!prefix) return false;
    const norm = prefix.replace(/^\/|\/$/g, "");
    return path === norm || path.startsWith(norm + "/");
  });
}
