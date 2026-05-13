import { describe, it, expect } from "vitest";
import { expandTemplate } from "../src/tools/templates";

describe("expandTemplate", () => {
  const now = new Date(2026, 4, 12, 9, 30, 0);

  it("substitutes {{date}} with local ISO date", () => {
    expect(expandTemplate("Today is {{date}}.", { now })).toBe("Today is 2026-05-12.");
  });

  it("substitutes {{time}} with HH:MM (local)", () => {
    expect(expandTemplate("at {{time}}", { now })).toBe("at 09:30");
  });

  it("substitutes {{title}}", () => {
    expect(expandTemplate("# {{title}}", { title: "Hello", now })).toBe("# Hello");
  });

  it("leaves untouched if no placeholders", () => {
    expect(expandTemplate("plain body", { now })).toBe("plain body");
  });

  it("leaves Templater syntax alone (not handled)", () => {
    const raw = "<% tp.date.now() %> {{date}}";
    const out = expandTemplate(raw, { now });
    expect(out).toBe("<% tp.date.now() %> 2026-05-12");
  });

  it("substitutes multiple occurrences of the same placeholder", () => {
    expect(expandTemplate("{{date}} / {{date}}", { now })).toBe("2026-05-12 / 2026-05-12");
  });

  it("treats missing title as empty string", () => {
    expect(expandTemplate("# {{title}} —", { now })).toBe("#  —");
  });
});
