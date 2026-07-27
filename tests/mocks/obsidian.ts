export class App {}

export class Plugin {}

export class PluginSettingTab {
  containerEl = {} as HTMLElement;

  constructor(
    public app: App,
    public plugin: Plugin,
  ) {}

  update(): void {}
}

export class Setting {
  descEl = {} as HTMLElement;
}

export class TFile {
  path = "";
  name = "";
  basename = "";
  extension = "md";
}

export class TFolder {
  path = "";
  name = "";
  children: Array<TFile | TFolder> = [];
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}
