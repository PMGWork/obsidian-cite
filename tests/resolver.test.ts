import { beforeEach, describe, expect, it, vi } from "vitest";

import type { App } from "obsidian";
import { TFile } from "obsidian";
import { CitationResolver } from "../src/resolver";
import type { CiteSettings } from "../src/settings";

interface FakeFile extends TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
}

function makeFile(path: string): FakeFile {
  const file = new (TFile as unknown as new () => FakeFile)();
  const name = path.split("/").pop() ?? path;
  file.path = path;
  file.name = name;
  file.basename = name.replace(/\.md$/, "");
  file.extension = "md";
  return file;
}

function bib(key: string, title = key): string {
  return `\`\`\`bibtex\n@article{${key}, title = {${title}}, year = {2026}}\n\`\`\``;
}

describe("CitationResolver", () => {
  let files: FakeFile[];
  let content: Map<string, string>;
  let settings: CiteSettings;
  let app: App;

  beforeEach(() => {
    files = [];
    content = new Map();
    settings = {
      citationSyntax: "latex",
      referenceFolder: "References",
      bibliographyStyle: "plain",
    };
    app = {
      vault: {
        getMarkdownFiles: () => files,
        cachedRead: async (file: TFile) => content.get(file.path) ?? "",
        getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
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
    await resolver.initialize();
    expect(resolver.findNote("new")).toBeNull();
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
