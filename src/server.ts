import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { App, Notice } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ClaudeMcpSettings } from "./settings";
import { registerAllTools } from "./tools/registry";

export class ObsidianMcpServer {
  private http: HttpServer | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(private app: App, private settings: ClaudeMcpSettings) {}

  async start(): Promise<void> {
    if (this.http) return;
    if (!this.settings.bearerToken) {
      new Notice("Claude MCP: bearer token is empty — server not started. Set one in settings.");
      return;
    }

    this.http = createServer(async (req, res) => {
      try {
        await this.handle(req, res);
      } catch (err) {
        console.error("[claude-mcp]", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "internal_error" }));
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.http!.once("error", reject);
      this.http!.listen(this.settings.port, this.settings.bindHost, () => {
        this.http!.off("error", reject);
        resolve();
      });
    });

    console.log(
      `[claude-mcp] listening on http://${this.settings.bindHost}:${this.settings.port}/mcp`,
    );
  }

  async stop(): Promise<void> {
    for (const t of this.transports.values()) {
      try {
        await t.close();
      } catch {
        /* noop */
      }
    }
    this.transports.clear();
    if (this.http) {
      await new Promise<void>((resolve) => this.http!.close(() => resolve()));
      this.http = null;
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${this.settings.bearerToken}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const sessionId = (req.headers["mcp-session-id"] as string | undefined) ?? undefined;
    let transport = sessionId ? this.transports.get(sessionId) : undefined;

    if (!transport) {
      const mcp = new McpServer({ name: "obsidian-claude-mcp", version: "0.1.0" });
      registerAllTools(mcp, { app: this.app, settings: this.settings });

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          this.transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) this.transports.delete(transport!.sessionId);
      };

      await mcp.connect(transport);
    }

    await transport.handleRequest(req, res);
  }
}
