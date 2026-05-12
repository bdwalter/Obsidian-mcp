import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { randomBytes } from "node:crypto";
import type ClaudeMcpPlugin from "./main";

export interface ClaudeMcpSettings {
  port: number;
  bearerToken: string;
  bindHost: string;
  trashOnWrite: boolean;
}

export const DEFAULT_SETTINGS: ClaudeMcpSettings = {
  port: 27125,
  bearerToken: "",
  bindHost: "127.0.0.1",
  trashOnWrite: true,
};

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export class ClaudeMcpSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ClaudeMcpPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Claude MCP" });

    new Setting(containerEl)
      .setName("Bind host")
      .setDesc("Interface to listen on. Keep 127.0.0.1 unless you know why you're changing it.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.bindHost)
          .onChange(async (v) => {
            this.plugin.settings.bindHost = v.trim() || "127.0.0.1";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Port")
      .setDesc("MCP HTTP server port.")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.port))
          .onChange(async (v) => {
            const n = Number.parseInt(v, 10);
            if (Number.isFinite(n) && n > 0 && n < 65536) {
              this.plugin.settings.port = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Bearer token")
      .setDesc("Required for every request. Treat this like a password.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.bearerToken)
          .onChange(async (v) => {
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
      .setName("Backup on overwrite")
      .setDesc("Copy prior contents into .trash/ before update_note overwrites.")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.trashOnWrite)
          .onChange(async (v) => {
            this.plugin.settings.trashOnWrite = v;
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
      text: "Paste this into ~/.claude/settings.json under the top-level mcpServers key. Restart Claude Code after saving.",
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
  }
}
