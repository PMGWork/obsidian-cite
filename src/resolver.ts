import { App, TFile, TFolder } from "obsidian";
import {
  formatBibliographyPublication,
  getAuthorSortKey,
  getBibliographyLabel,
  parseBibtexEntries,
  renderBibliographyStyle,
  stringifyAuthors,
  type BibtexEntry,
} from "./bibtex";
import type { BibliographyStyle, CiteSettings } from "./settings";

interface IndexedEntry {
  path: string;
  type: string;
  fields: Record<string, string>;
}

export interface ResolverStats {
  configured: boolean;
  files: number;
  entries: number;
  duplicateKeys: string[];
  parseErrors: string[];
}

export interface FormattedBibEntry {
  label: string;
  filePath: string | null;
}

const EMPTY_STATS: ResolverStats = {
  configured: false,
  files: 0,
  entries: 0,
  duplicateKeys: [],
  parseErrors: [],
};

export class CitationResolver {
  private citationKeyIndex = new Map<string, IndexedEntry>();
  private generation = 0;
  private currentStats: ResolverStats = EMPTY_STATS;

  constructor(private app: App, private getSettings: () => CiteSettings) {}

  get stats(): ResolverStats {
    return this.currentStats;
  }

  isRelevantPath(path: string): boolean {
    const folder = this.getSettings().referenceFolder;
    return Boolean(folder) && path.toLowerCase().endsWith(".md") && path.startsWith(`${folder}/`);
  }

  private getReferenceFiles(): TFile[] {
    const folderPath = this.getSettings().referenceFolder;
    if (!folderPath) return [];
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return [];

    const files: TFile[] = [];
    const visit = (current: TFolder): void => {
      for (const child of current.children) {
        if (child instanceof TFolder) visit(child);
        else if (child instanceof TFile && child.extension === "md") files.push(child);
      }
    };
    visit(folder);
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  async initialize(): Promise<boolean> {
    const generation = ++this.generation;
    const folder = this.getSettings().referenceFolder;
    if (!folder) {
      this.citationKeyIndex = new Map();
      this.currentStats = EMPTY_STATS;
      return true;
    }

    const files = this.getReferenceFiles();
    const parsedFiles = await Promise.all(files.map(async (file) => {
      try {
        const content = await this.app.vault.cachedRead(file);
        return { file, parsed: parseBibtexEntries(content), readError: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { file, parsed: { entries: [] as BibtexEntry[], errors: [] }, readError: message };
      }
    }));
    if (generation !== this.generation) return false;

    const nextIndex = new Map<string, IndexedEntry>();
    const duplicateKeys = new Set<string>();
    const parseErrors: string[] = [];
    for (const { file, parsed, readError } of parsedFiles) {
      if (readError) parseErrors.push(`${file.path}: ${readError}`);
      parseErrors.push(...parsed.errors.map((error) => `${file.path}: ${error}`));
      for (const entry of parsed.entries) {
        if (nextIndex.has(entry.key)) {
          duplicateKeys.add(entry.key);
          continue;
        }
        nextIndex.set(entry.key, { path: file.path, type: entry.type, fields: entry.fields });
      }
    }

    this.citationKeyIndex = nextIndex;
    this.currentStats = {
      configured: true,
      files: files.length,
      entries: nextIndex.size,
      duplicateKeys: [...duplicateKeys].sort(),
      parseErrors,
    };
    return true;
  }

  findNote(key: string): TFile | null {
    const entry = this.citationKeyIndex.get(key);
    if (!entry) return null;
    const file = this.app.vault.getAbstractFileByPath(entry.path);
    return file instanceof TFile ? file : null;
  }

  sortBibliographyKeys(keys: string[]): string[] {
    return [...keys].sort((a, b) => {
      const first = this.citationKeyIndex.get(a);
      const second = this.citationKeyIndex.get(b);
      if (!first && !second) return a.localeCompare(b);
      if (!first) return 1;
      if (!second) return -1;
      const firstParts = [
        getAuthorSortKey(first.fields.author),
        first.fields.year ?? "",
        first.fields.title ?? "",
        a,
      ];
      const secondParts = [
        getAuthorSortKey(second.fields.author),
        second.fields.year ?? "",
        second.fields.title ?? "",
        b,
      ];
      return firstParts.join("\u0000").localeCompare(secondParts.join("\u0000"));
    });
  }

  getCitationLabel(
    key: string,
    number: number,
    style: BibliographyStyle,
  ): string {
    const indexed = this.citationKeyIndex.get(key);
    if (!indexed) return style === "alpha" || style === "apalike" ? key : String(number);
    return getBibliographyLabel(style, {
      number: String(number),
      authors: stringifyAuthors(indexed.fields.author, false),
      year: indexed.fields.year?.slice(0, 4) ?? "",
    });
  }

  formatBibEntry(
    key: string,
    number: number,
    settings: CiteSettings,
    labelOverride?: string,
  ): FormattedBibEntry {
    const indexed = this.citationKeyIndex.get(key);
    const file = this.findNote(key);
    if (!indexed || !file) {
      const label = labelOverride ?? this.getCitationLabel(key, number, settings.bibliographyStyle);
      return {
        label: settings.bibliographyStyle === "apalike" ? `${label}. ${key}.` : `[${label}] ${key}`,
        filePath: null,
      };
    }

    const author = indexed.fields.author;
    const year = indexed.fields.year?.slice(0, 4) ?? "";
    const apaYear = settings.bibliographyStyle === "apalike" && labelOverride
      ? /,\s*(\d{4}(?:[a-z]|\d+)?)$/.exec(labelOverride)?.[1] ?? year
      : year;
    const publication = formatBibliographyPublication(
      indexed.type,
      indexed.fields,
      settings.bibliographyStyle === "apalike" ? "" : year,
    );
    const label = renderBibliographyStyle(settings.bibliographyStyle, {
      number: String(number),
      label: labelOverride ?? "",
      key,
      authors: stringifyAuthors(author, false),
      abbrAuthors: stringifyAuthors(author, true),
      year: apaYear,
      title: indexed.fields.title ?? "",
      publication,
    });
    return { label: label || `[${number}] ${file.basename}`, filePath: file.path };
  }

  getAllKeys(): Array<{ key: string; title: string; detail: string }> {
    return [...this.citationKeyIndex.entries()]
      .map(([key, entry]) => ({
        key,
        title: entry.fields.title || this.app.vault.getAbstractFileByPath(entry.path)?.name.replace(/\.md$/, "") || key,
        detail: [entry.fields.author, entry.fields.year].filter(Boolean).join(", "),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }
}
