import { beforeEach, describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";
import { TFile, TFolder } from "obsidian";
import { CitationResolver } from "../src/resolver";
import type { CiteSettings } from "../src/settings";

interface FakeFile extends TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
}

interface FakeFolder extends TFolder {
  path: string;
  name: string;
  children: Array<FakeFile | FakeFolder>;
}

function makeFile(path: string): FakeFile {
  const file = new (TFile as unknown as new () => FakeFile)();
  const name = path.split("/").pop() ?? path;
  file.path = path;
  file.name = name;
  file.extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  file.basename = name.replace(new RegExp(`\\.${file.extension}$`), "");
  return file;
}

function makeFolder(path: string, children: Array<FakeFile | FakeFolder> = []): FakeFolder {
  const folder = new (TFolder as unknown as new () => FakeFolder)();
  folder.path = path;
  folder.name = path.split("/").pop() ?? path;
  folder.children = children;
  return folder;
}

function bib(key: string, title = key): string {
  return `\`\`\`bibtex\n@article{${key}, title = {${title}}, year = {2026}}\n\`\`\``;
}

describe("CitationResolver", () => {
  let files: FakeFile[];
  let content: Map<string, string>;
  let settings: CiteSettings;
  let app: App;
  let referenceFolder: FakeFolder;

  beforeEach(() => {
    files = [];
    content = new Map();
    settings = {
      citationSyntax: "latex",
      referenceFolder: "References",
      bibliographyStyle: "plain",
    };
    referenceFolder = makeFolder("References", files);
    app = {
      vault: {
        cachedRead: async (file: TFile) => content.get(file.path) ?? "",
        getAbstractFileByPath: (path: string) => {
          if (path === referenceFolder.path) return referenceFolder;
          return files.find((file) => file.path === path) ?? null;
        },
      },
    } as unknown as App;
  });

  it("indexes deterministically and keeps the first path for duplicate keys", async () => {
    const later = makeFile("References/z.md");
    const first = makeFile("References/a.md");
    files.push(later, first);
    content.set(first.path, bib("same", "First"));
    content.set(later.path, bib("same", "Later"));
    const resolver = new CitationResolver(app, () => settings);

    await resolver.initialize();

    expect(resolver.findNote("same")?.path).toBe(first.path);
    expect(resolver.stats.duplicateKeys).toEqual(["same"]);
    expect(resolver.stats.entries).toBe(1);
  });

  it("reflects create, modify, delete, and parse-error recovery after reindexing", async () => {
    const file = makeFile("References/paper.md");
    files.push(file);
    content.set(file.path, bib("old"));
    const resolver = new CitationResolver(app, () => settings);
    await resolver.initialize();
    expect(resolver.findNote("old")).toBe(file);

    content.set(file.path, "```bibtex\n@article{broken, title = {oops}\n```");
    await resolver.initialize();
    expect(resolver.stats.parseErrors).toHaveLength(1);
    expect(resolver.findNote("old")).toBeNull();

    content.set(file.path, bib("new"));
    await resolver.initialize();
    expect(resolver.stats.parseErrors).toEqual([]);
    expect(resolver.findNote("new")).toBe(file);

    files = [];
    referenceFolder.children = files;
    await resolver.initialize();
    expect(resolver.findNote("new")).toBeNull();
  });

  it("walks only the configured folder recursively and sorts markdown files", async () => {
    const later = makeFile("References/z.md");
    const first = makeFile("References/nested/a.md");
    const ignoredType = makeFile("References/notes.txt");
    const outside = makeFile("Other/outside.md");
    const nested = makeFolder("References/nested", [first]);
    files.push(later, first, ignoredType, outside);
    referenceFolder.children = [later, nested, ignoredType];
    content.set(later.path, bib("same", "Later"));
    content.set(first.path, bib("same", "First"));
    content.set(ignoredType.path, bib("ignored-type"));
    content.set(outside.path, bib("outside"));
    const cachedRead = vi.fn(async (file: TFile) => content.get(file.path) ?? "");
    (app.vault as unknown as { cachedRead: typeof cachedRead }).cachedRead = cachedRead;
    const resolver = new CitationResolver(app, () => settings);

    await resolver.initialize();

    expect(resolver.stats.files).toBe(2);
    expect(resolver.findNote("same")?.path).toBe(first.path);
    expect(resolver.findNote("ignored-type")).toBeNull();
    expect(resolver.findNote("outside")).toBeNull();
    expect(cachedRead.mock.calls.map(([file]) => file.path)).toEqual([first.path, later.path]);
  });

  it("treats a missing configured folder as an empty index", async () => {
    settings.referenceFolder = "Missing";
    const cachedRead = vi.fn(async () => "");
    (app.vault as unknown as { cachedRead: typeof cachedRead }).cachedRead = cachedRead;
    const resolver = new CitationResolver(app, () => settings);

    await resolver.initialize();

    expect(resolver.stats.configured).toBe(true);
    expect(resolver.stats.files).toBe(0);
    expect(cachedRead).not.toHaveBeenCalled();
  });

  it("does not read the vault when the reference folder is not configured", async () => {
    const cachedRead = vi.fn(async () => "");
    (app.vault as unknown as { cachedRead: typeof cachedRead }).cachedRead = cachedRead;
    settings.referenceFolder = "";
    const resolver = new CitationResolver(app, () => settings);

    await resolver.initialize();

    expect(cachedRead).not.toHaveBeenCalled();
    expect(resolver.stats.configured).toBe(false);
  });

  it("ignores out-of-date concurrent rebuilds", async () => {
    const file = makeFile("References/paper.md");
    files.push(file);
    let releaseFirst: (() => void) | undefined;
    let reads = 0;
    (app.vault as unknown as { cachedRead: (file: TFile) => Promise<string> }).cachedRead = async () => {
      reads += 1;
      if (reads === 1) await new Promise<void>((resolve) => { releaseFirst = resolve; });
      return reads === 1 ? bib("stale") : bib("current");
    };
    const resolver = new CitationResolver(app, () => settings);

    const first = resolver.initialize();
    const second = resolver.initialize();
    await second;
    releaseFirst?.();
    expect(await first).toBe(false);
    expect(resolver.findNote("current")).toBe(file);
    expect(resolver.findNote("stale")).toBeNull();
  });
});
