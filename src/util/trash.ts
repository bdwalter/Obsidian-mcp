import { App, normalizePath } from "obsidian";

export async function backupToTrash(app: App, path: string): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) return null;

  const adapter = app.vault.adapter;
  const stat = await adapter.stat(path);
  if (!stat || stat.type !== "file") return null;

  const contents = await adapter.read(path);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.replace(/\//g, "__");
  const dest = normalizePath(`.trash/${ts}__${base}`);

  if (!(await adapter.exists(".trash"))) {
    await adapter.mkdir(".trash");
  }
  await adapter.write(dest, contents);
  return dest;
}
