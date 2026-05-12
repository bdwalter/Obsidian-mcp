import { describe, it, expect } from "vitest";
import { safeVaultPath } from "../src/util/path";

describe("safeVaultPath", () => {
  describe("accepts safe vault-relative paths", () => {
    it.each([
      ["note.md"],
      ["folder/note.md"],
      ["deep/nested/path/note.md"],
      ["folder with spaces/note.md"],
      ["unicode-✓-emoji-🌊/note.md"],
      [".trash/something.md"],
      ["folder/.hidden.md"],
    ])("ok: %s", (p) => {
      const r = safeVaultPath(p);
      expect(r.ok).toBe(true);
      expect(r.error).toBeUndefined();
    });
  });

  describe("rejects unsafe paths", () => {
    it.each([
      ["", "empty"],
      ["/etc/passwd.md", "absolute"],
      ["\\Windows\\System32.md", "backslash absolute"],
      ["C:\\Windows\\notes.md", "drive letter"],
      ["c:/Users/notes.md", "drive letter lowercase"],
      ["../escape.md", "parent segment"],
      ["folder/../../escape.md", "parent in middle"],
      ["folder/..", "parent at end"],
      ["..", "bare parent"],
      ["folder/../escape.md", "parent embedded"],
      ["\\..\\windows-traversal.md", "windows traversal"],
      ["folder\\..\\escape.md", "windows traversal in middle"],
      ["null\0byte.md", "null byte"],
    ])("rejects: %s (%s)", (p) => {
      const r = safeVaultPath(p);
      expect(r.ok).toBe(false);
      expect(r.error).toBeTruthy();
    });
  });

  it("normalizes redundant slashes in accepted paths", () => {
    const r = safeVaultPath("folder//sub///note.md");
    expect(r.ok).toBe(true);
    expect(r.path).toBe("folder/sub/note.md");
  });

  it("returns structured shape (ok, path, error?)", () => {
    const good = safeVaultPath("a.md");
    expect(good).toMatchObject({ ok: true, path: "a.md" });

    const bad = safeVaultPath("../x.md");
    expect(bad.ok).toBe(false);
    expect(bad.path).toBe("../x.md");
    expect(bad.error).toContain("..");
  });
});
