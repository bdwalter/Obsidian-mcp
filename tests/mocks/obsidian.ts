export function normalizePath(p: string): string {
  let s = p.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (s.startsWith("/")) s = s.slice(1);
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

export class TFile {}
export class TFolder {}
export class Notice {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class App {}
