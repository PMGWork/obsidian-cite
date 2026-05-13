import {
  App,
  Keymap,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  MarkdownPostProcessorContext,
} from "obsidian";

import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";

import { RangeSetBuilder } from "@codemirror/state";

import {
  autocompletion,
  CompletionContext,
  CompletionResult,
  Completion,
} from "@codemirror/autocomplete";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface ObsidianCiteSettings {
  citationSyntax: "latex" | "pandoc";
  referenceFolder: string;
  bibliographyStyle: "plain" | "abbrv" | "unsrt" | "alpha" | "ieeetr" | "acm";
}

const DEFAULT_SETTINGS: ObsidianCiteSettings = {
  citationSyntax: "latex",
  referenceFolder: "",
  bibliographyStyle: "plain",
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CITE_SOURCE        = /\\cite\{([^}]+)\}/.source;
const PANDOC_CITE_SOURCE = /\[((?:@[^\]\s;]+(?:\s*;\s*)?)+)\]/.source;
const BIBLIOGRAPHY_SOURCE = /\\bibliography(?:\{[^}]*\})?/.source;

// ---------------------------------------------------------------------------
// BibTeX key extraction
// ---------------------------------------------------------------------------

interface BibtexEntry {
  key: string;
  fields: Record<string, string>;
}

function cleanBibtexValue(value: string): string {
  return value
    .trim()
    .replace(/^["{]+|["},]+$/g, "")
    .replace(/[{}]/g, "")
    .replace(/\\&/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBibtexEntries(content: string): BibtexEntry[] {
  return [...content.matchAll(/```bibtex[\s\S]*?```/gi)].flatMap((block) => {
    const blockText = block[0];
    return [...blockText.matchAll(/@\w+\{([^,\s\r\n]+),([\s\S]*?)(?=\n\s*@\w+\{|```)/g)]
      .map((entryMatch) => {
        const fields: Record<string, string> = {};
        const body = entryMatch[2];
        for (const fieldMatch of body.matchAll(/(\w+)\s*=\s*({[\s\S]*?}|"[\s\S]*?"|[^,\r\n]+)/g)) {
          fields[fieldMatch[1].toLowerCase()] = cleanBibtexValue(fieldMatch[2]);
        }
        return { key: entryMatch[1], fields };
      });
  });
}

// ---------------------------------------------------------------------------
// Citation numbering
// ---------------------------------------------------------------------------

function splitKeys(raw: string): string[] {
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

function splitCitationKeys(raw: string, settings: ObsidianCiteSettings): string[] {
  if (settings.citationSyntax === "pandoc") {
    return raw
      .split(";")
      .map((key) => key.trim().replace(/^@/, ""))
      .filter(Boolean);
  }
  return splitKeys(raw);
}

function getCitationRegex(settings: ObsidianCiteSettings): RegExp {
  return new RegExp(
    settings.citationSyntax === "pandoc" ? PANDOC_CITE_SOURCE : CITE_SOURCE,
    "g"
  );
}

function hasCitation(text: string, settings: ObsidianCiteSettings): boolean {
  if (settings.citationSyntax === "pandoc") return /\[@/.test(text);
  return text.includes("\\cite{");
}

function buildCitationMap(
  text: string,
  settings: ObsidianCiteSettings
): Map<string, number> {
  const map = new Map<string, number>();
  const regex = getCitationRegex(settings);
  let match: RegExpExecArray | null;
  let counter = 1;
  while ((match = regex.exec(text)) !== null) {
    for (const key of splitCitationKeys(match[1], settings)) {
      if (!map.has(key)) map.set(key, counter++);
    }
  }
  return map;
}

function findPreviousBibliographyEnd(text: string, position: number): number {
  const regex = new RegExp(BIBLIOGRAPHY_SOURCE, "g");
  let match: RegExpExecArray | null;
  let end = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index >= position) break;
    end = match.index + match[0].length;
  }
  return end;
}

function findNextBibliographyStart(text: string, position: number): number {
  const regex = new RegExp(BIBLIOGRAPHY_SOURCE, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > position) return match.index;
  }
  return text.length;
}

function buildCitationMapInRange(
  text: string,
  start: number,
  end: number,
  settings: ObsidianCiteSettings
): Map<string, number> {
  return buildCitationMap(text.slice(start, end), settings);
}

function buildCitationMapAt(
  text: string,
  position: number,
  settings: ObsidianCiteSettings
): Map<string, number> {
  return buildCitationMapInRange(
    text,
    findPreviousBibliographyEnd(text, position),
    findNextBibliographyStart(text, position),
    settings
  );
}

function buildBibliographyCitationMap(
  text: string,
  position: number,
  settings: ObsidianCiteSettings
): Map<string, number> {
  return buildCitationMapInRange(
    text,
    findPreviousBibliographyEnd(text, position),
    position,
    settings
  );
}

function getLineStartOffset(text: string, line: number): number {
  if (line <= 0) return 0;

  let offset = 0;
  for (let currentLine = 0; currentLine < line; currentLine++) {
    const next = text.indexOf("\n", offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return offset;
}

// ---------------------------------------------------------------------------
// Note resolver
// ---------------------------------------------------------------------------

function extractLastName(raw: string): string {
  const name = raw
    .replace(/\s*\([^)]*\)/g, "")
    .trim();

  // Handles both "Last, First" and "First Last" formats
  if (name.includes(",")) return name.split(",")[0].trim();
  return name.split(/\s+/).pop() ?? name;
}

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function stripAffiliation(raw: string): string {
  return raw.replace(/\s*\([^)]*\)/g, "").trim();
}

function stringifyAuthors(value: unknown, abbreviate: boolean): string {
  const authors = Array.isArray(value)
    ? value.map((item) => String(item))
    : stringifyValue(value).split(/\s+and\s+|,\s+(?=[A-Z][^,]+(?:\(|$))/);

  return authors
    .map((author) => {
      const name = stripAffiliation(author);
      if (!abbreviate) return name;
      if (name.includes(",")) return name;
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length <= 1) return name;
      const last = parts.pop();
      const initials = parts.map((part) => `${part[0]}.`).join(" ");
      return `${initials} ${last}`;
    })
    .filter(Boolean)
    .join(", ");
}

function getAlphaLabel(authors: string, year: string): string {
  const firstAuthor = authors.split(",")[0]?.trim() ?? "";
  const base = extractLastName(firstAuthor).slice(0, 3) || "ref";
  return `${base}${year.slice(-2)}`;
}

function cleanupBibliographyLabel(label: string): string {
  return label
    .replace(/\s+\./g, ".")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function renderBibliographyFormat(
  format: string,
  values: Record<string, string>
): string {
  const rendered = format.replace(/\{(\w+)\}/g, (_match, key: string) => {
    return values[key] ?? "";
  });
  return cleanupBibliographyLabel(rendered);
}

function renderBibliographyStyle(
  style: ObsidianCiteSettings["bibliographyStyle"],
  values: Record<string, string>
): string {
  const styleValues = {
    ...values,
    label: style === "alpha" ? getAlphaLabel(values.authors, values.year) : values.number,
  };

  const formats: Record<ObsidianCiteSettings["bibliographyStyle"], string> = {
    plain: "[{label}] {authors}. {title}. {venue}, {year}.",
    abbrv: "[{label}] {abbrAuthors}. {title}. {venue}, {year}.",
    unsrt: "[{label}] {authors}. {title}. {venue}, {year}.",
    alpha: "[{label}] {authors}. {title}. {venue}, {year}.",
    ieeetr: "[{label}] {authors}, \"{title},\" {venue}, {year}.",
    acm: "[{label}] {authors}. {title}. In {venue}, {year}.",
  };

  return renderBibliographyFormat(formats[style], styleValues);
}

class CitationResolver {
  private citationKeyIndex = new Map<string, { path: string; fields?: Record<string, string> }>();

  constructor(private app: App, private settings: ObsidianCiteSettings) {}

  async initialize() {
    this.citationKeyIndex.clear();
    await Promise.all(
      this.getReferenceFiles().map((f) => this.indexFile(f))
    );
  }

  private isInReferenceFolder(file: TFile): boolean {
    const folder = this.settings.referenceFolder;
    if (!folder) return true;
    return file.path === `${folder}.md` || file.path.startsWith(`${folder}/`);
  }

  private getReferenceFiles(): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => this.isInReferenceFolder(file));
  }

  async indexFile(file: TFile) {
    for (const [key, entry] of this.citationKeyIndex) {
      if (entry.path === file.path) this.citationKeyIndex.delete(key);
    }

    if (!this.isInReferenceFolder(file)) return;

    for (const entry of await this.extractCitationEntries(file)) {
      this.citationKeyIndex.set(entry.key, {
        path: file.path,
        fields: entry.fields,
      });
    }
  }

  private async extractCitationEntries(file: TFile): Promise<BibtexEntry[]> {
    const content = await this.app.vault.cachedRead(file);
    return extractBibtexEntries(content);
  }

  removeFile(file: TFile) {
    for (const [key, entry] of this.citationKeyIndex) {
      if (entry.path === file.path) this.citationKeyIndex.delete(key);
    }
  }

  findNote(key: string): TFile | null {
    const entry = this.citationKeyIndex.get(key);
    if (entry) {
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof TFile) return file;
    }

    return null;
  }

  private getEntryFields(key: string): Record<string, string> | null {
    return this.citationKeyIndex.get(key)?.fields ?? null;
  }

  formatBibEntry(
    key: string,
    number: number,
    settings: ObsidianCiteSettings
  ): { label: string; filePath: string | null } {
    const file = this.findNote(key);
    if (!file) return { label: `[${number}] ${key}`, filePath: null };

    const entryFields = this.getEntryFields(key);

    const authorRaw = entryFields?.author;
    const yearRaw = entryFields?.year;
    const title = entryFields?.title;
    const venue = entryFields?.journal
      ?? entryFields?.booktitle
      ?? entryFields?.publisher
      ?? entryFields?.howpublished
      ?? entryFields?.url;
    const year = yearRaw ? String(yearRaw).slice(0, 4) : "";

    const label = renderBibliographyStyle(settings.bibliographyStyle, {
      number: String(number),
      key,
      authors: stringifyAuthors(authorRaw, false),
      abbrAuthors: stringifyAuthors(authorRaw, true),
      year,
      title: stringifyValue(title),
      venue: stringifyValue(venue),
    });

    return { label: label || `[${number}] ${file.basename}`, filePath: file.path };
  }

  getAllKeys(): Array<{ key: string; title: string; detail: string }> {
    const results: Array<{ key: string; title: string; detail: string }> = [];
    const seen = new Set<string>();

    for (const [key, entry] of this.citationKeyIndex) {
      if (seen.has(key)) continue;
      seen.add(key);
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (!(file instanceof TFile)) continue;
      const title  = entry.fields?.title ?? file.basename;
      const author = entry.fields?.author ?? "";
      const year   = entry.fields?.year ?? "";
      results.push({ key, title, detail: [author, year].filter(Boolean).join(", ") });
    }

    return results.sort((a, b) => a.key.localeCompare(b.key));
  }
}

// ---------------------------------------------------------------------------
// Autocompletion
// ---------------------------------------------------------------------------

function makeCiteCompletionSource(
  resolver: CitationResolver,
  settings: ObsidianCiteSettings
) {
  return (context: CompletionContext): CompletionResult | null => {
    const line   = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);

    let partial = "";
    if (settings.citationSyntax === "pandoc") {
      const match = before.match(/\[(?:@[^\]\s;]+;\s*)*@([^\]\s;]*)$/);
      if (!match) return null;
      partial = match[1];
    } else {
      const match = before.match(/\\cite\{([^}]*)$/);
      if (!match) return null;

      const inside    = match[1];
      const lastComma = inside.lastIndexOf(",");
      partial = lastComma >= 0
        ? inside.slice(lastComma + 1).replace(/^\s*/, "")
        : inside;
    }

    const from = context.pos - partial.length;

    const q = partial.toLowerCase();

    const options: Completion[] = resolver
      .getAllKeys()
      .filter(({ key, title }) => {
        if (partial === "") return true;
        return key.toLowerCase().includes(q) || title.toLowerCase().includes(q);
      })
      .map(({ key, title }) => {
        const keyLower = key.toLowerCase();
        const boost = keyLower.startsWith(q) ? 2 : keyLower.includes(q) ? 1 : 0;
        return {
          label: title, // displayed in dropdown
          apply: key,   // inserted on selection
          type: "keyword",
          boost,
        };
      });

    if (options.length === 0 && !context.explicit) return null;
    // filter: false — our source already filters; skip CM6's label-based re-filter
    return { from, options, filter: false };
  };
}

// ---------------------------------------------------------------------------
// Hover preview helper
// ---------------------------------------------------------------------------

function triggerHoverPreview(
  app: App,
  e: MouseEvent,
  filePath: string,
  sourcePath: string
) {
  app.workspace.trigger("hover-link", {
    event: e,
    source: "obsidian-cite",
    hoverParent: { hoverPopover: null },
    targetEl: e.currentTarget as HTMLElement,
    linktext: filePath.replace(/\.md$/, ""),
    sourcePath,
  });
}

function openCitationLink(app: App, e: MouseEvent, linktext: string, sourcePath: string) {
  e.preventDefault();
  e.stopPropagation();
  app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(e));
}

function bindCitationLink(
  app: App,
  a: HTMLAnchorElement,
  filePath: string,
  sourcePath: string
) {
  const linktext = filePath.replace(/\.md$/, "");
  a.setAttribute("data-href", linktext);
  a.setAttribute("href", linktext);
  a.addEventListener("mouseover", (e: MouseEvent) => {
    triggerHoverPreview(app, e, filePath, sourcePath);
  });
  a.addEventListener("click", (e: MouseEvent) => {
    openCitationLink(app, e, linktext, sourcePath);
  });
}

// ---------------------------------------------------------------------------
// CodeMirror 6 widget — inline citation
// ---------------------------------------------------------------------------

interface CiteEntry {
  key: string;
  number: number;
  displayText: string;
  filePath: string | null;
}

class CiteWidget extends WidgetType {
  constructor(
    private app: App,
    private entries: CiteEntry[],
    private settings: ObsidianCiteSettings
  ) {
    super();
  }

  eq(other: CiteWidget): boolean {
    return (
      other.entries.length === this.entries.length &&
      other.entries.every(
        (e, i) =>
          e.key         === this.entries[i].key &&
          e.displayText === this.entries[i].displayText &&
          e.filePath    === this.entries[i].filePath
      )
    );
  }

  // Let mouse events reach our anchor's handlers instead of being captured
  // by CM6 for cursor placement/selection.
  ignoreEvent(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const span = createSpan({ cls: "cite-inline" });
    span.append("[");

    const sep = ", ";

    this.entries.forEach((entry, i) => {
      if (i > 0) span.append(sep);

      if (entry.filePath) {
        const a = span.createEl("a", {
          text: entry.displayText,
          cls: "internal-link cite-link",
        });
        a.title = entry.key;
        bindCitationLink(this.app, a, entry.filePath, "");
      } else {
        span.createSpan({
          text: entry.displayText,
          cls: "cite-unresolved",
          attr: { title: `Unresolved: ${entry.key}` },
        });
      }
    });

    span.append("]");
    return span;
  }
}

// ---------------------------------------------------------------------------
// CodeMirror 6 widget — bibliography block
// ---------------------------------------------------------------------------

interface BibEntry {
  number: number;
  label: string;
  filePath: string | null;
}

function buildBibliographyEl(
  app: App,
  entries: BibEntry[],
  sourcePath: string
): HTMLElement {
  const container = createSpan({ cls: "cite-bibliography" });

  entries.forEach(({ label, filePath }, index) => {
    if (index > 0) container.append(document.createElement("br"));
    const row = container.createSpan({ cls: "cite-bibliography-item" });
    if (filePath) {
      const a = row.createEl("a", {
        text: label,
        cls: "internal-link cite-bibliography-link",
      });
      bindCitationLink(app, a, filePath, sourcePath);
    } else {
      row.createSpan({ text: label });
    }
  });

  return container;
}

class BibliographyWidget extends WidgetType {
  constructor(private app: App, private entries: BibEntry[]) {
    super();
  }

  eq(other: BibliographyWidget): boolean {
    return (
      other.entries.length === this.entries.length &&
      other.entries.every((e, i) => e.label === this.entries[i].label)
    );
  }

  // Let mouse events reach our anchor's handlers instead of being captured
  // by CM6 for cursor placement/selection.
  ignoreEvent(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    return buildBibliographyEl(this.app, this.entries, "");
  }
}

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

function buildDecorations(
  view: EditorView,
  resolver: CitationResolver,
  app: App,
  settings: ObsidianCiteSettings
): DecorationSet {
  const { from: selFrom, to: selTo } = view.state.selection.main;
  const fullText    = view.state.doc.toString();

  const pending: Array<{ start: number; end: number; dec: Decoration }> = [];

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match: RegExpExecArray | null;

    const citeRegex = getCitationRegex(settings);
    while ((match = citeRegex.exec(text)) !== null) {
      const start = from + match.index;
      const end   = start + match[0].length;
      if (selFrom <= end && selTo >= start) continue;

      const citationMap = buildCitationMapAt(fullText, start, settings);
      const entries: CiteEntry[] = splitCitationKeys(match[1], settings).map((key) => ({
        key,
        number:      citationMap.get(key) ?? 1,
        displayText: String(citationMap.get(key) ?? 1),
        filePath:    resolver.findNote(key)?.path ?? null,
      }));

      pending.push({
        start,
        end,
        dec: Decoration.replace({ widget: new CiteWidget(app, entries, settings) }),
      });
    }

    const bibRegex = new RegExp(BIBLIOGRAPHY_SOURCE, "g");
    while ((match = bibRegex.exec(text)) !== null) {
      const start = from + match.index;
      const end   = start + match[0].length;
      if (selFrom <= end && selTo >= start) continue;
      const citationMap = buildBibliographyCitationMap(fullText, start, settings);
      const orderedRefs: BibEntry[] = [...citationMap.entries()]
        .sort(([, a], [, b]) => a - b)
        .map(([key, number]) => ({
          number,
          ...resolver.formatBibEntry(key, number, settings),
        }));
      pending.push({
        start,
        end,
        dec: Decoration.replace({ widget: new BibliographyWidget(app, orderedRefs) }),
      });
    }
  }

  pending.sort((a, b) => a.start - b.start);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { start, end, dec } of pending) builder.add(start, end, dec);
  return builder.finish();
}

// ---------------------------------------------------------------------------
// Main plugin
// ---------------------------------------------------------------------------

export default class ObsidianCitePlugin extends Plugin {
  settings!: ObsidianCiteSettings;
  private resolver!: CitationResolver;
  private sourceCache = new Map<string, { mtime: number; text: string }>();

  async onload() {
    await this.loadSettings();

    this.resolver = new CitationResolver(this.app, this.settings);
    this.addSettingTab(new CiteSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.resolver.indexFile(file);
          this.sourceCache.delete(file.path);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.resolver.indexFile(file);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.resolver.removeFile(file);
          this.sourceCache.delete(file.path);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.resolver.indexFile(file);
        }
      })
    );

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      await this.processReadingMode(el, ctx);
    });

    this.registerEditorExtension(this.buildEditorExtension());

    // Initialize BibTeX index after the vault is fully loaded
    const init = async () => {
      await this.resolver.initialize();
      this.refreshOpenNotes();
    };
    if (this.app.workspace.layoutReady) {
      init();
    } else {
      this.app.workspace.onLayoutReady(init);
    }
  }

  refreshOpenNotes() {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const view = leaf.view as MarkdownView;
      // Refresh reading mode
      view.previewMode?.rerender(true);
      // Dispatch a no-op CM6 transaction to trigger live preview re-decoration
      const cm = (view.editor as any)?.cm as EditorView | undefined;
      cm?.dispatch({});
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!["latex", "pandoc"].includes(this.settings.citationSyntax)) {
      this.settings.citationSyntax = DEFAULT_SETTINGS.citationSyntax;
    }
    if (!["plain", "abbrv", "unsrt", "alpha", "ieeetr", "acm"].includes(this.settings.bibliographyStyle)) {
      this.settings.bibliographyStyle = DEFAULT_SETTINGS.bibliographyStyle;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async reindexReferences() {
    await this.resolver.initialize();
    this.refreshOpenNotes();
  }

  private async getSourceText(sourcePath: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) return "";

    const cached = this.sourceCache.get(sourcePath);
    if (cached && cached.mtime === file.stat.mtime) return cached.text;

    const text = await this.app.vault.cachedRead(file);
    this.sourceCache.set(sourcePath, { mtime: file.stat.mtime, text });
    return text;
  }

  private async processReadingMode(
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) {
    const hasCite = hasCitation(el.textContent ?? "", this.settings);
    const hasBib  = el.textContent?.includes("\\bibliography");
    if (!hasCite && !hasBib) return;

    const sourceText = await this.getSourceText(ctx.sourcePath);
    const section = ctx.getSectionInfo(el);
    const sectionOffset = section
      ? getLineStartOffset(sourceText, section.lineStart)
      : 0;

    if (hasBib) {
      el.querySelectorAll("p").forEach((p) => {
        if (/^\\bibliography(?:\{[^}]*\})?\s*$/.test(p.textContent?.trim() ?? "")) {
          const bibliographySource = p.textContent?.trim() ?? "";
          const bibliographyIndex = sourceText.indexOf(bibliographySource, sectionOffset);
          const citationMap = buildBibliographyCitationMap(
            sourceText,
            bibliographyIndex >= 0 ? bibliographyIndex : sectionOffset,
            this.settings
          );
          const orderedRefs: BibEntry[] = [...citationMap.entries()]
            .sort(([, a], [, b]) => a - b)
            .map(([key, number]) => ({
              number,
              ...this.resolver.formatBibEntry(key, number, this.settings),
            }));
          p.replaceWith(buildBibliographyEl(this.app, orderedRefs, ctx.sourcePath));
        }
      });
    }

    if (!hasCite) return;

    const walker  = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const pending: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (hasCitation((node as Text).textContent ?? "", this.settings)) {
        pending.push(node as Text);
      }
    }

    let sourceSearchFrom = sectionOffset;

    for (const textNode of pending) {
      const parent = textNode.parentNode;
      if (!parent) continue;

      const text     = textNode.textContent ?? "";
      const fragment = document.createDocumentFragment();
      const regex    = getCitationRegex(this.settings);
      let lastIndex  = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        const keys = splitCitationKeys(match[1], this.settings);
        const span = document.createElement("span");
        span.className = "cite-inline";
        span.append("[");

        const sep = ", ";
        const sourceIndex = sourceText.indexOf(match[0], sourceSearchFrom);
        const citationMap = buildCitationMapAt(
          sourceText,
          sourceIndex >= 0 ? sourceIndex : sectionOffset,
          this.settings
        );
        if (sourceIndex >= 0) sourceSearchFrom = sourceIndex + match[0].length;

        keys.forEach((key, i) => {
          if (i > 0) span.append(sep);
          const number      = citationMap.get(key) ?? 1;
          const file        = this.resolver.findNote(key);

          if (file) {
            const a = document.createElement("a");
            a.className = "internal-link cite-link";
            a.textContent = String(number);
            a.title = key;
            bindCitationLink(this.app, a, file.path, ctx.sourcePath);
            span.append(a);
          } else {
            const s = document.createElement("span");
            s.className = "cite-unresolved";
            s.textContent = String(number);
            s.title = `Unresolved: ${key}`;
            span.append(s);
          }
        });

        span.append("]");
        fragment.append(span);
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < text.length) {
        fragment.append(document.createTextNode(text.slice(lastIndex)));
      }

      parent.replaceChild(fragment, textNode);
    }
  }

  private buildEditorExtension() {
    const resolver = this.resolver;
    const app      = this.app;
    const settings = this.settings; // shared reference; mutations are visible immediately

    return [
      autocompletion({
        override: [makeCiteCompletionSource(resolver, settings)],
        activateOnTyping: true,
        addToOptions: [
          {
            // Key shown as caption below the title
            render(completion: Completion) {
              const key = typeof completion.apply === "string" ? completion.apply : null;
              if (!key) return null;
              const el = document.createElement("span");
              el.className = "cite-completion-key";
              el.textContent = key;
              return el;
            },
            position: 55, // after default label (50)
          },
          {
            // Separator between items
            render() {
              const el = document.createElement("hr");
              el.className = "cite-completion-separator";
              return el;
            },
            position: 90,
          },
        ],
      }),
      ViewPlugin.fromClass(
        class {
          decorations: DecorationSet;

          constructor(view: EditorView) {
            this.decorations = buildDecorations(view, resolver, app, settings);
          }

          update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
              this.decorations = buildDecorations(update.view, resolver, app, settings);
            }
          }
        },
        { decorations: (v) => v.decorations }
      ),
    ];
  }
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

class CiteSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ObsidianCitePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Citation syntax")
      .setDesc("Inline citation notation to parse and complete")
      .addDropdown((drop) =>
        drop
          .addOption("latex", "\\cite{key}")
          .addOption("pandoc", "[@key]")
          .setValue(this.plugin.settings.citationSyntax)
          .onChange(async (val) => {
            this.plugin.settings.citationSyntax = val as "latex" | "pandoc";
            await this.plugin.saveSettings();
            this.plugin.refreshOpenNotes();
          })
      );

    new Setting(containerEl)
      .setName("Reference folder")
      .setDesc("Folder used to resolve citation keys")
      .addText((text) =>
        text
          .setPlaceholder("papers")
          .setValue(this.plugin.settings.referenceFolder)
          .onChange(async (val) => {
            this.plugin.settings.referenceFolder = val.trim().replace(/^\/|\/$/g, "");
            await this.plugin.saveSettings();
            await this.plugin.reindexReferences();
          })
      );

    new Setting(containerEl)
      .setName("Bibliography style")
      .setDesc("BibTeX-style bibliography preset")
      .addDropdown((drop) =>
        drop
          .addOption("plain", "plain")
          .addOption("abbrv", "abbrv")
          .addOption("unsrt", "unsrt")
          .addOption("alpha", "alpha")
          .addOption("ieeetr", "ieeetr")
          .addOption("acm", "acm")
          .setValue(this.plugin.settings.bibliographyStyle)
          .onChange(async (val) => {
            this.plugin.settings.bibliographyStyle =
              val as ObsidianCiteSettings["bibliographyStyle"];
            await this.plugin.saveSettings();
            this.plugin.refreshOpenNotes();
          })
      );

  }
}
