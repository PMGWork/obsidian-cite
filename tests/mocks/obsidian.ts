export class TFile {
  path = "";
  name = "";
  basename = "";
  extension = "md";
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}
