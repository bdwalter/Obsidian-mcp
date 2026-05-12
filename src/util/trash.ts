import { App, normalizePath } from "obsidian";
import { encodeTrashName } from "./trash-name";

export async function backupToTrash(app: App, path: string): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) return null;

  const adapter = app.vault.adapter;
  const stat = await adapter.stat(path);
  if (!stat || stat.type !== "file") return null;

  const contents = await adapter.read(path);
  const dest = normalizePath(`.trash/${encodeTrashName(path)}`);

  if (!(await adapter.exists(".trash"))) {
    await adapter.mkdir(".trash");
  }
  await adapter.write(dest, contents);
  return dest;
}
