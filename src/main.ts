import { Notice, Plugin } from "obsidian";
import {
  ClaudeMcpSettings,
  ClaudeMcpSettingTab,
  DEFAULT_SETTINGS,
  generateToken,
} from "./settings";
import { ObsidianMcpServer } from "./server";

export default class ClaudeMcpPlugin extends Plugin {
  settings: ClaudeMcpSettings = DEFAULT_SETTINGS;
  private server: ObsidianMcpServer | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    if (!this.settings.bearerToken) {
      this.settings.bearerToken = generateToken();
      await this.saveSettings();
      new Notice("Claude MCP: generated a bearer token. Open settings to copy it.");
    }

    this.addSettingTab(new ClaudeMcpSettingTab(this.app, this));

    this.addCommand({
      id: "restart-mcp-server",
      name: "Restart MCP server",
      callback: () => this.restartServer(),
    });

    this.app.workspace.onLayoutReady(() => {
      void this.startServer();
    });
  }

  async onunload(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async startServer(): Promise<void> {
    this.server = new ObsidianMcpServer(this.app, this.settings);
    try {
      await this.server.start();
    } catch (err) {
      console.error("[claude-mcp] start failed", err);
      new Notice(`Claude MCP: failed to start — ${(err as Error).message}`);
    }
  }

  async restartServer(): Promise<void> {
    if (this.server) await this.server.stop();
    this.server = null;
    await this.startServer();
    new Notice("Claude MCP: server restarted.");
  }
}
