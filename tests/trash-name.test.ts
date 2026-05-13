import { describe, it, expect } from "vitest";
import { encodeTrashName, decodeTrashName } from "../src/util/trash-name";

describe("encodeTrashName", () => {
  const fixedDate = new Date(Date.UTC(2026, 4, 12, 13, 36, 8, 670));

  it("encodes a root-level note with iso timestamp prefix", () => {
    expect(encodeTrashName("note.md", fixedDate)).toBe("2026-05-12T13-36-08-670Z__note.md");
  });

  it("encodes folder separators as double underscores", () => {
    expect(encodeTrashName("Stories/The Lighthouse.md", fixedDate)).toBe(
      "2026-05-12T13-36-08-670Z__Stories__The Lighthouse.md",
    );
  });

  it("encodes deeply nested paths", () => {
    expect(encodeTrashName("a/b/c/d.md", fixedDate)).toBe(
      "2026-05-12T13-36-08-670Z__a__b__c__d.md",
    );
  });

  it("replaces colons and dots in timestamp with dashes", () => {
    const name = encodeTrashName("x.md", fixedDate);
    expect(name).not.toContain(":");
    // ISO has dots before ms; should be dashes
    expect(name.split("__")[0]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d-]+Z$/);
  });
});

describe("decodeTrashName", () => {
  it("decodes a timestamped backup back to the original vault path", () => {
    expect(decodeTrashName("2026-05-12T13-36-08-670Z__Stories__The Lighthouse.md")).toBe(
      "Stories/The Lighthouse.md",
    );
  });

  it("decodes root-level paths", () => {
    expect(decodeTrashName("2026-05-12T13-36-08-670Z__note.md")).toBe("note.md");
  });

  it("decodes deeply nested paths", () => {
    expect(decodeTrashName("2026-05-12T13-36-08-670Z__a__b__c__d.md")).toBe("a/b/c/d.md");
  });

  it("returns null for filenames without a timestamp prefix", () => {
    expect(decodeTrashName("Cold Coffee.md")).toBeNull();
    expect(decodeTrashName("note.md")).toBeNull();
    expect(decodeTrashName("just-text.md")).toBeNull();
  });

  it("returns null for malformed timestamps", () => {
    expect(decodeTrashName("2026-13-99T99-99-99Z__note.md")).not.toBeNull(); // regex is permissive
    expect(decodeTrashName("notatimestamp__note.md")).toBeNull();
  });

  it("roundtrips with encodeTrashName", () => {
    const original = "Stories/Subfolder/My Note.md";
    const encoded = encodeTrashName(original);
    const decoded = decodeTrashName(encoded);
    expect(decoded).toBe(original);
  });
});
