import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { randomBytes } from "node:crypto";
import type ClaudeMcpPlugin from "./main";

export interface ClaudeMcpSettings {
  port: number;
  bearerToken: string;
  bindHost: string;
  trashOnWrite: boolean;
  readOnly: boolean;
  writeAllowFolders: string[];
  auditLog: boolean;
  auditLogPath: string;
}

export const DEFAULT_SETTINGS: ClaudeMcpSettings = {
  port: 27125,
  bearerToken: "",
  bindHost: "127.0.0.1",
  trashOnWrite: true,
  readOnly: false,
  writeAllowFolders: [],
  auditLog: false,
  auditLogPath: ".claude-mcp-audit.md",
};

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export class ClaudeMcpSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: ClaudeMcpPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Claude MCP" });

    new Setting(containerEl)
      .setName("Bind host")
      .setDesc(
        "Interface to listen on. Keep 127.0.0.1 unless you know why you're changing it. Server auto-restarts ~1.5s after the last edit.",
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.bindHost).onChange(async (v) => {
          const next = v.trim() || "127.0.0.1";
          if (next === this.plugin.settings.bindHost) return;
          this.plugin.settings.bindHost = next;
          await this.plugin.saveSettings();
          this.plugin.scheduleRestart("bind host changed");
        }),
      );

    new Setting(containerEl)
      .setName("Port")
      .setDesc("MCP HTTP server port. Server auto-restarts ~1.5s after the last edit.")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.port)).onChange(async (v) => {
          const n = Number.parseInt(v, 10);
          if (!Number.isFinite(n) || n <= 0 || n >= 65536) return;
          if (n === this.plugin.settings.port) return;
          this.plugin.settings.port = n;
          await this.plugin.saveSettings();
          this.plugin.scheduleRestart("port changed");
        }),
      );

    new Setting(containerEl)
      .setName("Bearer token")
      .setDesc("Required for every request. Treat this like a password.")
      .addText((t) =>
        t.setValue(this.plugin.settings.bearerToken).onChange(async (v) => {
          this.plugin.settings.bearerToken = v.trim();
          await this.plugin.saveSettings();
        }),
      )
      .addExtraButton((b) =>
        b
          .setIcon("copy")
          .setTooltip("Copy token")
          .onClick(async () => {
            await navigator.clipboard.writeText(this.plugin.settings.bearerToken);
            new Notice("Token copied");
          }),
      )
      .addButton((b) =>
        b.setButtonText("Generate").onClick(async () => {
          this.plugin.settings.bearerToken = generateToken();
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName("Read-only mode")
      .setDesc(
        "When on, the server only registers read tools — write/delete/restore tools are not exposed. Server auto-restarts ~1.5s after toggling. Useful for safer dogfooding or when sharing the bearer token with less-trusted clients.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.readOnly).onChange(async (v) => {
          if (v === this.plugin.settings.readOnly) return;
          this.plugin.settings.readOnly = v;
          await this.plugin.saveSettings();
          this.plugin.scheduleRestart(v ? "read-only enabled" : "read-only disabled");
        }),
      );

    new Setting(containerEl)
      .setName("Backup on overwrite")
      .setDesc(
        "Copy prior contents into .trash/ before update_note overwrites. Only relevant when read-only mode is off.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.trashOnWrite).onChange(async (v) => {
          this.plugin.settings.trashOnWrite = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Write allow-folders")
      .setDesc(
        "Comma-separated vault-relative folder prefixes. When non-empty, write tools refuse paths outside these prefixes. Leave empty to allow writes anywhere. Example: Inbox, Daily, Journal",
      )
      .addText((t) =>
        t.setValue(this.plugin.settings.writeAllowFolders.join(", ")).onChange(async (v) => {
          const list = v
            .split(",")
            .map((s) => s.trim().replace(/^\/|\/$/g, ""))
            .filter((s) => s.length > 0);
          this.plugin.settings.writeAllowFolders = list;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Audit log")
      .setDesc(
        "Append every tool call to a note in the vault. Useful for reviewing what Claude has been doing.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.auditLog).onChange(async (v) => {
          this.plugin.settings.auditLog = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Audit log path")
      .setDesc("Vault-relative path for the audit log note. Default: .claude-mcp-audit.md")
      .addText((t) =>
        t.setValue(this.plugin.settings.auditLogPath).onChange(async (v) => {
          const next = v.trim() || ".claude-mcp-audit.md";
          this.plugin.settings.auditLogPath = next;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Restart server")
      .setDesc("Apply port/host/token changes.")
      .addButton((b) =>
        b.setButtonText("Restart").onClick(async () => {
          await this.plugin.restartServer();
        }),
      );

    const snippet = JSON.stringify(
      {
        mcpServers: {
          obsidian: {
            type: "http",
            url: `http://${this.plugin.settings.bindHost}:${this.plugin.settings.port}/mcp`,
            headers: {
              Authorization: `Bearer ${this.plugin.settings.bearerToken || "<set a token above>"}`,
            },
          },
        },
      },
      null,
      2,
    );

    const cfg = containerEl.createEl("div");
    cfg.createEl("h3", { text: "Claude Code MCP config snippet" });
    cfg.createEl("p", {
      text: "Paste this into ~/.claude.json under the top-level mcpServers key. Restart Claude Code after saving.",
      cls: "setting-item-description",
    });

    const pre = cfg.createEl("pre");
    pre.setAttr(
      "style",
      "user-select: text; white-space: pre-wrap; padding: 12px; background: var(--background-secondary); border-radius: 6px; font-family: var(--font-monospace); font-size: 12px;",
    );
    pre.setText(snippet);

    new Setting(cfg)
      .setName("Copy snippet")
      .setDesc("Copies the JSON above to the clipboard.")
      .addButton((b) =>
        b
          .setButtonText("Copy")
          .setCta()
          .onClick(async () => {
            await navigator.clipboard.writeText(snippet);
            new Notice("MCP config copied to clipboard");
          }),
      );

    const about = containerEl.createEl("div", {
      attr: {
        style:
          "margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--background-modifier-border); font-size: 12px; color: var(--text-muted);",
      },
    });
    about.createSpan({
      text: "Claude MCP is open-source software (MIT). Source, issues, and contributions: ",
    });
    about.createEl("a", {
      text: "github.com/bdwalter/Obsidian-mcp",
      href: "https://github.com/bdwalter/Obsidian-mcp",
      attr: { target: "_blank", rel: "noopener" },
    });
    about.createEl("br");
    about.createSpan({
      text: "Beta software — no warranty. Use at your own risk; back up vaults you can't afford to lose.",
    });
  }
}
