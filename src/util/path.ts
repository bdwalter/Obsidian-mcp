import { normalizePath } from "obsidian";

export interface SafePath {
  ok: boolean;
  path: string;
  error?: string;
}

export function safeVaultPath(input: string): SafePath {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, path: "", error: "path is empty" };
  }
  if (input.startsWith("/") || input.startsWith("\\")) {
    return { ok: false, path: input, error: "absolute paths are not allowed (paths are vault-relative)" };
  }
  if (/^[A-Za-z]:[\\/]/.test(input)) {
    return { ok: false, path: input, error: "drive-letter paths are not allowed" };
  }
  if (/(^|[\\/])\.\.([\\/]|$)/.test(input)) {
    return { ok: false, path: input, error: "path contains '..' segment" };
  }
  if (input.includes("\0")) {
    return { ok: false, path: input, error: "path contains null byte" };
  }
  const np = normalizePath(input);
  if (np.startsWith("..") || np.includes("/../") || np === "..") {
    return { ok: false, path: np, error: "path escapes the vault" };
  }
  return { ok: true, path: np };
}
