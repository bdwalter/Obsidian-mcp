import { describe, it, expect } from "vitest";
import { isWriteAllowed } from "../src/util/audit";
import type { ClaudeMcpSettings } from "../src/settings";

function settings(writeAllowFolders: string[]): ClaudeMcpSettings {
  return {
    port: 27125,
    bearerToken: "x",
    bindHost: "127.0.0.1",
    trashOnWrite: true,
    readOnly: false,
    writeAllowFolders,
    auditLog: false,
    auditLogPath: ".claude-mcp-audit.md",
  };
}

describe("isWriteAllowed", () => {
  it("allows anything when the allow-list is empty", () => {
    const s = settings([]);
    expect(isWriteAllowed("note.md", s)).toBe(true);
    expect(isWriteAllowed("any/deep/path/note.md", s)).toBe(true);
    expect(isWriteAllowed(".trash/x.md", s)).toBe(true);
  });

  it("allows paths inside an allow-listed folder", () => {
    const s = settings(["Inbox", "Daily"]);
    expect(isWriteAllowed("Inbox/today.md", s)).toBe(true);
    expect(isWriteAllowed("Inbox/sub/folder/note.md", s)).toBe(true);
    expect(isWriteAllowed("Daily/2026-05-12.md", s)).toBe(true);
  });

  it("allows the folder itself", () => {
    const s = settings(["Inbox"]);
    expect(isWriteAllowed("Inbox", s)).toBe(true);
  });

  it("rejects paths outside the allow-list", () => {
    const s = settings(["Inbox"]);
    expect(isWriteAllowed("Other/note.md", s)).toBe(false);
    expect(isWriteAllowed("note.md", s)).toBe(false);
    expect(isWriteAllowed("inbox/case-mismatch.md", s)).toBe(false);
  });

  it("normalizes trailing/leading slashes in allow-list entries", () => {
    const s = settings(["/Inbox/", "Daily/"]);
    expect(isWriteAllowed("Inbox/x.md", s)).toBe(true);
    expect(isWriteAllowed("Daily/x.md", s)).toBe(true);
  });

  it("does not falsely match prefix substrings", () => {
    const s = settings(["Note"]);
    expect(isWriteAllowed("Note/inside.md", s)).toBe(true);
    expect(isWriteAllowed("Notebook/elsewhere.md", s)).toBe(false);
  });
});
