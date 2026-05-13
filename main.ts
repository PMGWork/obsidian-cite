import {
  App,
  Plugin,
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

const CITE_SOURCE = /\\cite\{([^}]+)\}/.source;
const BIBLIOGRAPHY_SOURCE = /\\bibliography(?:\{[^}]*\})?/.source;

// ---------------------------------------------------------------------------
// BibTeX key extraction
// ---------------------------------------------------------------------------

function extractBibtexKey(content: string): string | null {
  const match = content.match(/```bibtex\s*\n\s*@\w+\{([^,\s\n]+),/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Citation numbering — first-appearance order across the full document
// ---------------------------------------------------------------------------

function splitKeys(raw: string): string[] {
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}

function buildCitationMap(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const regex = new RegExp(CITE_SOURCE, "g");
  let match: RegExpExecArray | null;
  let counter = 1;
  while ((match = regex.exec(text)) !== null) {
    for (const key of splitKeys(match[1])) {
      if (!map.has(key)) map.set(key, counter++);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Note resolver
// ---------------------------------------------------------------------------

class CitationResolver {
  // bibtex-key → file path (built async at startup, updated on file events)
  private bibtexIndex = new Map<string, string>();

  constructor(private app: App) {}

  async initialize() {
    await Promise.all(
      this.app.vault.getMarkdownFiles().map((f) => this.indexFile(f))
    );
  }

  async indexFile(file: TFile) {
    // Clear any previous entry for this file before re-indexing
    for (const [key, path] of this.bibtexIndex) {
      if (path === file.path) this.bibtexIndex.delete(key);
    }
    const content = await this.app.vault.cachedRead(file);
    const key = extractBibtexKey(content);
    if (key) this.bibtexIndex.set(key, file.path);
  }

  removeFile(file: TFile) {
    for (const [key, path] of this.bibtexIndex) {
      if (path === file.path) this.bibtexIndex.delete(key);
    }
  }

  getAllKeys(): Array<{ key: string; title: string; detail: string }> {
    const results: Array<{ key: string; title: string; detail: string }> = [];
    const seen = new Set<string>();

    for (const [key, path] of this.bibtexIndex) {
      if (seen.has(key)) continue;
      seen.add(key);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const title = fm?.title ?? file.basename;
      const author = fm?.author ?? fm?.authors ?? "";
      const year = fm?.year ? String(fm.year) : "";
      results.push({ key, title, detail: [author, year].filter(Boolean).join(", ") });
    }

    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const citekey = cache?.frontmatter?.citekey;
      if (!citekey || seen.has(citekey)) continue;
      seen.add(citekey);
      const fm = cache!.frontmatter!;
      const author = fm.author ?? fm.authors ?? "";
      const year = fm.year ? String(fm.year) : "";
      results.push({
        key: citekey,
        title: fm.title ?? file.basename,
        detail: [author, year].filter(Boolean).join(", "),
      });
    }

    return results.sort((a, b) => a.key.localeCompare(b.key));
  }

  formatBibEntry(key: string, number: number): { label: string; filePath: string | null } {
    const file = this.findNote(key);
    if (!file) return { label: `[${number}] ${key}`, filePath: null };

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) return { label: `[${number}] ${file.basename}`, filePath: file.path };

    const parts: string[] = [];

    const authorRaw = fm.author ?? fm.authors;
    if (authorRaw) {
      parts.push(Array.isArray(authorRaw) ? authorRaw.join(", ") : String(authorRaw));
    }

    const year = fm.year ? String(fm.year) : (fm.date ? String(fm.date).slice(0, 4) : null);
    if (year) parts.push(`(${year})`);
    if (fm.title) parts.push(fm.title);

    const venue = fm.journal ?? fm.booktitle ?? fm.publisher;
    if (venue) parts.push(venue);

    const body = parts.length > 0 ? parts.join(". ") + "." : file.basename;
    return { label: `[${number}] ${body}`, filePath: file.path };
  }

  findNote(key: string): TFile | null {
    // 1. Exact filename match
    const byBasename = this.app.vault.getMarkdownFiles().find(
      (f) => f.basename === key
    );
    if (byBasename) return byBasename;

    // 2. frontmatter citekey field
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.citekey === key) return file;
    }

    // 3. BibTeX key from ```bibtex code block
    const path = this.bibtexIndex.get(key);
    if (path) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) return file;
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Autocompletion
// ---------------------------------------------------------------------------

function makeCiteCompletionSource(resolver: CitationResolver) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);

    // Must be inside \cite{...} (not yet closed)
    const match = before.match(/\\cite\{([^}]*)$/);
    if (!match) return null;

    // Partial key after the last comma
    const inside = match[1];
    const lastComma = inside.lastIndexOf(",");
    const partial = lastComma >= 0
      ? inside.slice(lastComma + 1).replace(/^\s*/, "")
      : inside;

    const from = context.pos - partial.length;

    const entries = resolver.getAllKeys();
    const options: Completion[] = entries
      .filter(({ key }) =>
        partial === "" || key.toLowerCase().startsWith(partial.toLowerCase())
      )
      .map(({ key, title, detail }) => ({
        label: key,
        detail,
        info: title,
        type: "keyword",
        boost: 1,
      }));

    if (options.length === 0 && !context.explicit) return null;

    return { from, options };
  };
}

// ---------------------------------------------------------------------------
// CodeMirror 6 widget (live preview)
// ---------------------------------------------------------------------------

interface CiteEntry {
  key: string;
  number: number;
  filePath: string | null;
}

class CiteWidget extends WidgetType {
  constructor(
    private app: App,
    private entries: CiteEntry[]
  ) {
    super();
  }

  eq(other: CiteWidget): boolean {
    return (
      other.entries.length === this.entries.length &&
      other.entries.every(
        (e, i) =>
          e.key === this.entries[i].key &&
          e.number === this.entries[i].number &&
          e.filePath === this.entries[i].filePath
      )
    );
  }

  toDOM(): HTMLElement {
    const span = createSpan({ cls: "cite-inline" });
    span.append("[");

    this.entries.forEach((entry, i) => {
      if (i > 0) span.append(", ");

      if (entry.filePath) {
        const a = span.createEl("a", {
          text: String(entry.number),
          cls: "internal-link cite-link",
        });
        a.title = entry.key;
        a.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.app.workspace.openLinkText(
            entry.filePath!.replace(/\.md$/, ""),
            "",
            e.ctrlKey || e.metaKey
          );
        });
      } else {
        span.createSpan({
          text: String(entry.number),
          cls: "cite-unresolved",
          attr: { title: `Unresolved: ${entry.key}` },
        });
      }
    });

    span.append("]");
    return span;
  }
}

interface BibEntry {
  number: number;
  label: string;
  filePath: string | null;
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

  toDOM(): HTMLElement {
    return buildBibliographyEl(this.app, this.entries, "");
  }
}

function buildBibliographyEl(
  app: App,
  entries: BibEntry[],
  sourcePath: string
): HTMLElement {
  const container = createDiv({ cls: "cite-bibliography" });

  for (const { label, filePath } of entries) {
    const row = container.createDiv({ cls: "cite-bibliography-item" });
    if (filePath) {
      const a = row.createEl("a", { text: label, cls: "cite-bibliography-link" });
      a.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        app.workspace.openLinkText(
          filePath.replace(/\.md$/, ""),
          sourcePath,
          e.ctrlKey || e.metaKey
        );
      });
    } else {
      row.createSpan({ text: label, cls: "cite-unresolved" });
    }
  }

  return container;
}

function buildDecorations(
  view: EditorView,
  resolver: CitationResolver,
  app: App
): DecorationSet {
  const { from: selFrom, to: selTo } = view.state.selection.main;
  const fullText = view.state.doc.toString();
  const citationMap = buildCitationMap(fullText);

  const orderedRefs: BibEntry[] = [...citationMap.entries()]
    .sort(([, a], [, b]) => a - b)
    .map(([key, number]) => ({ number, ...resolver.formatBibEntry(key, number) }));

  // Collect all ranges first so they can be sorted before adding to the builder
  const pending: Array<{ start: number; end: number; dec: Decoration }> = [];

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match: RegExpExecArray | null;

    const citeRegex = new RegExp(CITE_SOURCE, "g");
    while ((match = citeRegex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      if (selFrom <= end && selTo >= start) continue;
      const entries: CiteEntry[] = splitKeys(match[1]).map((key) => ({
        key,
        number: citationMap.get(key) ?? 1,
        filePath: resolver.findNote(key)?.path ?? null,
      }));
      pending.push({ start, end, dec: Decoration.replace({ widget: new CiteWidget(app, entries) }) });
    }

    const bibRegex = new RegExp(BIBLIOGRAPHY_SOURCE, "g");
    while ((match = bibRegex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      if (selFrom <= end && selTo >= start) continue;
      pending.push({ start, end, dec: Decoration.replace({ widget: new BibliographyWidget(app, orderedRefs) }) });
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
  private resolver!: CitationResolver;
  private sourceCache = new Map<string, { mtime: number; map: Map<string, number> }>();

  async onload() {
    this.resolver = new CitationResolver(this.app);
    await this.resolver.initialize();

    // Keep the BibTeX index up to date
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          this.resolver.indexFile(file);
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
        if (file instanceof TFile) this.resolver.removeFile(file);
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
  }

  private async getCitationMap(sourcePath: string): Promise<Map<string, number>> {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) return new Map();

    const cached = this.sourceCache.get(sourcePath);
    if (cached && cached.mtime === file.stat.mtime) return cached.map;

    const content = await this.app.vault.cachedRead(file);
    const map = buildCitationMap(content);
    this.sourceCache.set(sourcePath, { mtime: file.stat.mtime, map });
    return map;
  }

  private async processReadingMode(
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) {
    const hasCite = el.textContent?.includes("\\cite{");
    const hasBib  = el.textContent?.includes("\\bibliography");
    if (!hasCite && !hasBib) return;

    const citationMap = await this.getCitationMap(ctx.sourcePath);

    // Replace \bibliography paragraphs with the rendered list
    if (hasBib) {
      const orderedRefs: BibEntry[] = [...citationMap.entries()]
        .sort(([, a], [, b]) => a - b)
        .map(([key, number]) => ({ number, ...this.resolver.formatBibEntry(key, number) }));

      el.querySelectorAll("p").forEach((p) => {
        if (/^\\bibliography(?:\{[^}]*\})?\s*$/.test(p.textContent?.trim() ?? "")) {
          p.replaceWith(buildBibliographyEl(this.app, orderedRefs, ctx.sourcePath));
        }
      });
    }

    if (!hasCite) return;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const pending: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if ((node as Text).textContent?.includes("\\cite{")) {
        pending.push(node as Text);
      }
    }

    for (const textNode of pending) {
      const parent = textNode.parentNode;
      if (!parent) continue;

      const text = textNode.textContent ?? "";
      const fragment = document.createDocumentFragment();
      const regex = new RegExp(CITE_SOURCE, "g");
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.append(
            document.createTextNode(text.slice(lastIndex, match.index))
          );
        }

        const keys = splitKeys(match[1]);
        const span = document.createElement("span");
        span.className = "cite-inline";
        span.append("[");

        keys.forEach((key, i) => {
          if (i > 0) span.append(", ");
          const number = citationMap.get(key) ?? 1;
          const file = this.resolver.findNote(key);

          if (file) {
            const a = document.createElement("a");
            a.className = "internal-link cite-link";
            a.textContent = String(number);
            a.title = key;
            const linkPath = file.path.replace(/\.md$/, "");
            a.addEventListener("click", (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              this.app.workspace.openLinkText(
                linkPath,
                ctx.sourcePath,
                e.ctrlKey || e.metaKey
              );
            });
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
    const app = this.app;

    const completionExt = autocompletion({
      override: [makeCiteCompletionSource(resolver)],
      activateOnTyping: true,
    });

    return [
      completionExt,
      ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = buildDecorations(view, resolver, app);
        }

        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.viewportChanged ||
            update.selectionSet
          ) {
            this.decorations = buildDecorations(update.view, resolver, app);
          }
        }
      },
      { decorations: (v) => v.decorations }
    ),
    ];
  }
}
