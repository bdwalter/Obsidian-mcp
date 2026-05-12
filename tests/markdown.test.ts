import { describe, it, expect } from "vitest";
import { stripFrontmatter } from "../src/util/markdown";

describe("stripFrontmatter", () => {
  it("strips a standard YAML frontmatter block", () => {
    const raw = "---\ntags: [a]\n---\nBody content.\n";
    expect(stripFrontmatter(raw)).toBe("Body content.\n");
  });

  it("strips a multi-line frontmatter block", () => {
    const raw = "---\ntitle: Hello\ntags:\n  - a\n  - b\nauthor: X\n---\n# Heading\n\nBody.\n";
    expect(stripFrontmatter(raw)).toBe("# Heading\n\nBody.\n");
  });

  it("returns the original string when no frontmatter is present", () => {
    const raw = "# Just a heading\n\nNo frontmatter.\n";
    expect(stripFrontmatter(raw)).toBe(raw);
  });

  it("only strips frontmatter at the start of the file", () => {
    const raw = "# Heading\n\n---\ntags: [a]\n---\nMid-doc separator.\n";
    expect(stripFrontmatter(raw)).toBe(raw);
  });

  it("handles frontmatter with no trailing newline after final ---", () => {
    const raw = "---\ntags: [a]\n---";
    // Without trailing \n after the closing ---, no match (we require \n? after)
    // But the regex allows optional trailing newline, so this should still match
    expect(stripFrontmatter(raw)).toBe("");
  });

  it("handles empty frontmatter block", () => {
    const raw = "---\n\n---\nBody.\n";
    expect(stripFrontmatter(raw)).toBe("Body.\n");
  });

  it("leaves the closing delimiter when frontmatter is unterminated", () => {
    const raw = "---\ntags: [a]\nthis-never-closes\nBody.\n";
    expect(stripFrontmatter(raw)).toBe(raw);
  });
});
