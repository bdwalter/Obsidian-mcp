import { describe, it, expect } from "vitest";
import { localISODate, resolveDate } from "../src/util/date";

describe("localISODate", () => {
  it("formats year-month-day with zero padding", () => {
    expect(localISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localISODate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("uses local time, not UTC", () => {
    // Construct a Date at local 23:59 on May 11. UTC version would be May 12 in many zones.
    const d = new Date(2026, 4, 11, 23, 59, 59);
    expect(localISODate(d)).toBe("2026-05-11");
  });
});

describe("resolveDate", () => {
  const today = new Date(2026, 4, 12); // May 12 2026 local

  it("returns today when input is empty/today/undefined", () => {
    expect(resolveDate(undefined, today)).toBe("2026-05-12");
    expect(resolveDate("today", today)).toBe("2026-05-12");
    expect(resolveDate("", today)).toBe("2026-05-12");
    expect(resolveDate("TODAY", today)).toBe("2026-05-12");
  });

  it("handles yesterday/tomorrow", () => {
    expect(resolveDate("yesterday", today)).toBe("2026-05-11");
    expect(resolveDate("tomorrow", today)).toBe("2026-05-13");
  });

  it("handles relative offsets in days", () => {
    expect(resolveDate("+1d", today)).toBe("2026-05-13");
    expect(resolveDate("-1d", today)).toBe("2026-05-11");
    expect(resolveDate("+7d", today)).toBe("2026-05-19");
    expect(resolveDate("-30d", today)).toBe("2026-04-12");
  });

  it("handles relative offsets in weeks", () => {
    expect(resolveDate("+1w", today)).toBe("2026-05-19");
    expect(resolveDate("-2w", today)).toBe("2026-04-28");
  });

  it("passes through ISO dates unchanged", () => {
    expect(resolveDate("2024-12-25", today)).toBe("2024-12-25");
  });

  it("falls back to today for malformed input", () => {
    expect(resolveDate("garbage", today)).toBe("2026-05-12");
    expect(resolveDate("+xd", today)).toBe("2026-05-12");
    expect(resolveDate("2026-13-99", today)).toBe("2026-05-12");
  });

  it("crosses month and year boundaries correctly", () => {
    const eoy = new Date(2025, 11, 31);
    expect(resolveDate("+1d", eoy)).toBe("2026-01-01");

    const soy = new Date(2026, 0, 1);
    expect(resolveDate("-1d", soy)).toBe("2025-12-31");
  });
});
