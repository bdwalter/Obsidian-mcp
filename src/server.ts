import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { App, Notice } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ClaudeMcpSettings } from "./settings";
import { registerAllTools } from "./tools/registry";
import { makeAuditLogger } from "./util/audit";
import { registerResources } from "./resources";
import { registerPrompts } from "./prompts";

const MAX_BODY_BYTES = 16 * 1024 * 1024;

export class ObsidianMcpServer {
  private http: HttpServer | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(
    private app: App,
    private settings: ClaudeMcpSettings,
  ) {}

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

    try {
      await new Promise<void>((resolve, reject) => {
        this.http!.once("error", reject);
        this.http!.listen(this.settings.port, this.settings.bindHost, () => {
          this.http!.off("error", reject);
          resolve();
        });
      });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      this.http = null;
      if (e.code === "EADDRINUSE") {
        throw new Error(
          `port ${this.settings.port} is already in use — change it in Claude MCP settings or stop the conflicting process`,
          { cause: err },
        );
      }
      if (e.code === "EACCES") {
        throw new Error(
          `permission denied binding to ${this.settings.bindHost}:${this.settings.port} (ports < 1024 require elevated permissions)`,
          { cause: err },
        );
      }
      throw err;
    }

    console.log(
      `[claude-mcp] listening on http://${this.settings.bindHost}:${this.settings.port}/mcp` +
        (this.settings.readOnly ? " (read-only)" : ""),
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
    if (url.pathname === "/health") {
      const body = {
        status: "ok",
        plugin: "obsidian-claude-mcp",
        readOnly: this.settings.readOnly,
        sessions: this.transports.size,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const origin = req.headers["origin"];
    if (origin !== undefined && !this.isAllowedOrigin(origin)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden_origin" }));
      return;
    }

    const declared = Number.parseInt(String(req.headers["content-length"] ?? "0"), 10);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "payload_too_large", maxBytes: MAX_BODY_BYTES }));
      return;
    }

    const auth = req.headers["authorization"];
    if (!this.authMatches(auth)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    const sessionId = (req.headers["mcp-session-id"] as string | undefined) ?? undefined;
    let transport = sessionId ? this.transports.get(sessionId) : undefined;

    if (!transport) {
      const mcp = new McpServer({ name: "obsidian-claude-mcp", version: "0.1.0" });
      const audit = makeAuditLogger(this.app, this.settings);
      const ctx = { app: this.app, settings: this.settings, audit };
      registerAllTools(mcp, ctx);
      registerResources(mcp, ctx);
      registerPrompts(mcp, ctx);

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

  private isAllowedOrigin(origin: string): boolean {
    const { bindHost, port } = this.settings;
    const allowed = new Set([
      `http://${bindHost}:${port}`,
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
    ]);
    return allowed.has(origin);
  }

  private authMatches(header: string | string[] | undefined): boolean {
    if (typeof header !== "string") return false;
    const expected = `Bearer ${this.settings.bearerToken}`;
    if (header.length !== expected.length) return false;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return timingSafeEqual(a, b);
  }
}
