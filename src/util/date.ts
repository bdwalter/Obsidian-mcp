export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveDate(input: string | undefined, now: Date = new Date()): string {
  if (!input) return localISODate(now);
  const lower = input.toLowerCase().trim();
  if (lower === "today") return localISODate(now);
  if (lower === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return localISODate(d);
  }
  if (lower === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return localISODate(d);
  }
  const rel = lower.match(/^([+-])(\d+)([dw])$/);
  if (rel) {
    const sign = rel[1] === "-" ? -1 : 1;
    const n = parseInt(rel[2], 10) * (rel[3] === "w" ? 7 : 1);
    const d = new Date(now);
    d.setDate(d.getDate() + sign * n);
    return localISODate(d);
  }
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const probe = new Date(y, m - 1, d);
      if (probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d) {
        return input;
      }
    }
  }
  return localISODate(now);
}
