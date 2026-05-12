export function encodeTrashName(vaultPath: string, when: Date = new Date()): string {
  const ts = when.toISOString().replace(/[:.]/g, "-");
  const base = vaultPath.replace(/\//g, "__");
  return `${ts}__${base}`;
}

const TIMESTAMPED = /^\d{4}-\d{2}-\d{2}T[\d-]+Z__(.+)$/;

export function decodeTrashName(trashFilename: string): string | null {
  const m = trashFilename.match(TIMESTAMPED);
  if (!m) return null;
  return m[1].replace(/__/g, "/");
}
