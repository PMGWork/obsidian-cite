import {
  App,
  Keymap,
  MarkdownPostProcessorContext,
  editorInfoField,
} from "obsidian";
import { StateEffect } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import {
  createCitationDocumentIndex,
  hasCitation,
  type BibliographyOccurrence,
  type CitationDocumentIndex,
  type CitationOccurrence,
} from "./citations";
import { buildCitationCompletionExtension } from "./completion";
import { createObsidianFragment } from "./dom";
import type { CitationResolver } from "./resolver";
import type { CiteSettings } from "./settings";

export const refreshCiteDecorations = StateEffect.define<null>();

function getEditorSourcePath(view: EditorView): string {
  try {
    return view.state.field(editorInfoField)?.file?.path ?? "";
  } catch {
    return "";
  }
}

function triggerHoverPreview(
  app: App,
  event: MouseEvent,
  filePath: string,
  sourcePath: string,
): void {
  app.workspace.trigger("hover-link", {
    event,
    source: "cite",
    hoverParent: { hoverPopover: null },
    targetEl: event.currentTarget as HTMLElement,
    linktext: filePath.replace(/\.md$/, ""),
    sourcePath,
  });
}

function bindCitationLink(
  app: App,
  anchor: HTMLAnchorElement,
  filePath: string,
  sourcePath: string,
): void {
  const linktext = filePath.replace(/\.md$/, "");
  anchor.dataset.href = linktext;
  anchor.href = linktext;
  anchor.addEventListener("mouseenter", (event) => {
    triggerHoverPreview(app, event, filePath, sourcePath);
  });
  anchor.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void app.workspace.openLinkText(linktext, sourcePath, Keymap.isModEvent(event));
  });
}

export interface CiteEntry {
  key: string;
  displayText: string;
  filePath: string | null;
}

function buildCiteElement(
  document: Document,
  app: App,
  entries: CiteEntry[],
  sourcePath: string,
): HTMLElement {
  const span = createObsidianFragment(document).createSpan({ cls: "cite-inline" });
  span.append("[");
  entries.forEach((entry, index) => {
    if (index > 0) span.append(", ");
    if (entry.filePath) {
      const anchor = span.createEl("a", {
        cls: "internal-link cite-link",
        text: entry.displayText,
        title: entry.key,
      });
      bindCitationLink(app, anchor, entry.filePath, sourcePath);
    } else {
      span.createSpan({
        cls: "cite-unresolved",
        text: entry.displayText,
        title: `Unresolved: ${entry.key}`,
      });
    }
  });
  span.append("]");
  return span;
}

class CiteWidget extends WidgetType {
  constructor(
    private app: App,
    private entries: CiteEntry[],
    private sourcePath: string,
  ) {
    super();
  }

  eq(other: CiteWidget): boolean {
    return other.sourcePath === this.sourcePath
      && other.entries.length === this.entries.length
      && other.entries.every((entry, index) => {
        const current = this.entries[index];
        return current !== undefined
          && entry.key === current.key
          && entry.displayText === current.displayText
          && entry.filePath === current.filePath;
      });
  }

  ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    return buildCiteElement(view.dom.ownerDocument, this.app, this.entries, this.sourcePath);
  }
}

export interface BibliographyEntry {
  number: number;
  label: string;
  filePath: string | null;
}

function buildBibliographyElement(
  document: Document,
  app: App,
  entries: BibliographyEntry[],
  sourcePath: string,
): HTMLElement {
  const container = createObsidianFragment(document).createSpan({ cls: "cite-bibliography" });
  entries.forEach((entry, index) => {
    if (index > 0) container.createEl("br");
    const row = container.createSpan({ cls: "cite-bibliography-item" });
    if (entry.filePath) {
      const anchor = row.createEl("a", {
        cls: "internal-link cite-bibliography-link",
        text: entry.label,
      });
      bindCitationLink(app, anchor, entry.filePath, sourcePath);
    } else {
      row.setText(entry.label);
    }
  });
  return container;
}

class BibliographyWidget extends WidgetType {
  constructor(
    private app: App,
    private entries: BibliographyEntry[],
    private sourcePath: string,
  ) {
    super();
  }

  eq(other: BibliographyWidget): boolean {
    return other.sourcePath === this.sourcePath
      && other.entries.length === this.entries.length
      && other.entries.every((entry, index) => {
        const current = this.entries[index];
        return current !== undefined
          && entry.label === current.label
          && entry.filePath === current.filePath;
      });
  }

  ignoreEvent(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    return buildBibliographyElement(view.dom.ownerDocument, this.app, this.entries, this.sourcePath);
  }
}

function toCiteEntries(occurrence: CitationOccurrence, resolver: CitationResolver): CiteEntry[] {
  return occurrence.keys.map((key, index) => ({
    key,
    displayText: String(occurrence.numbers[index] ?? 1),
    filePath: resolver.findNote(key)?.path ?? null,
  }));
}

export interface DocumentPresentation {
  citations: Map<number, CiteEntry[]>;
  bibliographies: Map<number, BibliographyEntry[]>;
}

function usesCitationOrder(settings: CiteSettings): boolean {
  return settings.bibliographyStyle === "unsrt" || settings.bibliographyStyle === "ieeetr";
}

function disambiguateLabels(
  orderedKeys: string[],
  labels: Map<string, string>,
  settings: CiteSettings,
): Map<string, string> {
  if (settings.bibliographyStyle !== "alpha" && settings.bibliographyStyle !== "apalike") {
    return labels;
  }
  const counts = new Map<string, number>();
  for (const key of orderedKeys) {
    const label = labels.get(key) ?? key;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return new Map(orderedKeys.map((key) => {
    const label = labels.get(key) ?? key;
    if ((counts.get(label) ?? 0) < 2) return [key, label];
    const index = seen.get(label) ?? 0;
    seen.set(label, index + 1);
    const suffix = index < 26 ? String.fromCharCode(97 + index) : String(index + 1);
    return [key, `${label}${suffix}`];
  }));
}

export function buildDocumentPresentation(
  index: CitationDocumentIndex,
  resolver: CitationResolver,
  settings: CiteSettings,
): DocumentPresentation {
  const presentation: DocumentPresentation = {
    citations: new Map(),
    bibliographies: new Map(),
  };
  let segmentStart = 0;

  const addSegment = (
    citations: CitationOccurrence[],
    bibliography?: BibliographyOccurrence,
  ): void => {
    const citationOrder = [...new Set(citations.flatMap((citation) => citation.keys))];
    const orderedKeys = usesCitationOrder(settings)
      ? citationOrder
      : resolver.sortBibliographyKeys(citationOrder);
    const numbers = new Map(orderedKeys.map((key, index) => [key, index + 1]));
    const rawLabels = new Map(orderedKeys.map((key) => [
      key,
      resolver.getCitationLabel(key, numbers.get(key) ?? 1, settings.bibliographyStyle),
    ]));
    const labels = disambiguateLabels(orderedKeys, rawLabels, settings);

    for (const citation of citations) {
      presentation.citations.set(citation.from, citation.keys.map((key) => ({
        key,
        displayText: labels.get(key) ?? key,
        filePath: resolver.findNote(key)?.path ?? null,
      })));
    }
    if (bibliography) {
      presentation.bibliographies.set(bibliography.from, orderedKeys.map((key) => {
        const number = numbers.get(key) ?? 1;
        return {
          number,
          ...resolver.formatBibEntry(key, number, settings, labels.get(key)),
        };
      }));
    }
  };

  for (const bibliography of index.bibliographies) {
    addSegment(
      index.citations.filter((citation) =>
        citation.from >= segmentStart && citation.from < bibliography.from),
      bibliography,
    );
    segmentStart = bibliography.to;
  }
  addSegment(index.citations.filter((citation) => citation.from >= segmentStart));
  return presentation;
}

function intersectsSelection(view: EditorView, from: number, to: number): boolean {
  const selection = view.state.selection.main;
  return selection.from <= to && selection.to >= from;
}

function isVisible(view: EditorView, from: number, to: number): boolean {
  return view.visibleRanges.some((range) => from < range.to && to > range.from);
}

function buildDecorations(
  view: EditorView,
  resolver: CitationResolver,
  app: App,
  settings: CiteSettings,
): DecorationSet {
  const text = view.state.doc.toString();
  const index = createCitationDocumentIndex(text, settings);
  const presentation = buildDocumentPresentation(index, resolver, settings);
  const sourcePath = getEditorSourcePath(view);
  const pending: Array<{ from: number; to: number; decoration: Decoration }> = [];

  for (const citation of index.citations) {
    if (!isVisible(view, citation.from, citation.to) || intersectsSelection(view, citation.from, citation.to)) continue;
    pending.push({
      from: citation.from,
      to: citation.to,
      decoration: Decoration.replace({
        widget: new CiteWidget(
          app,
          presentation.citations.get(citation.from) ?? toCiteEntries(citation, resolver),
          sourcePath,
        ),
      }),
    });
  }
  for (const bibliography of index.bibliographies) {
    if (!isVisible(view, bibliography.from, bibliography.to)
      || intersectsSelection(view, bibliography.from, bibliography.to)) continue;
    pending.push({
      from: bibliography.from,
      to: bibliography.to,
      decoration: Decoration.replace({
        widget: new BibliographyWidget(
          app,
          presentation.bibliographies.get(bibliography.from) ?? [],
          sourcePath,
        ),
      }),
    });
  }

  pending.sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  for (const item of pending) builder.add(item.from, item.to, item.decoration);
  return builder.finish();
}

export function buildEditorExtension(
  resolver: CitationResolver,
  app: App,
  settings: CiteSettings,
) {
  return [
    buildCitationCompletionExtension(resolver, settings),
    ViewPlugin.fromClass(class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, resolver, app, settings);
      }

      update(update: ViewUpdate): void {
        const refresh = update.docChanged
          || update.viewportChanged
          || update.selectionSet
          || update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(refreshCiteDecorations)));
        if (refresh) this.decorations = buildDecorations(update.view, resolver, app, settings);
      }
    }, { decorations: (plugin) => plugin.decorations }),
  ];
}

function lineStartOffset(text: string, line: number): number {
  if (line <= 0) return 0;
  let offset = 0;
  for (let current = 0; current < line; current += 1) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return offset;
}

function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement;
  return parent === null || parent.closest(
    "code, pre, a, .math, .math-block, .math-inline, .cite-inline, .cite-bibliography",
  ) !== null;
}

function nextMatchingOccurrence<T extends { from: number; raw: string }>(
  occurrences: T[],
  raw: string,
  from: number,
): T | undefined {
  return occurrences.find((occurrence) => occurrence.from >= from && occurrence.raw === raw);
}

export async function processReadingMode(
  app: App,
  resolver: CitationResolver,
  settings: CiteSettings,
  sourceText: string,
  element: HTMLElement,
  context: MarkdownPostProcessorContext,
): Promise<void> {
  const textContent = element.textContent ?? "";
  if (!hasCitation(textContent, settings) && !textContent.includes("\\bibliography")) return;
  const documentIndex = createCitationDocumentIndex(sourceText, settings);
  const presentation = buildDocumentPresentation(documentIndex, resolver, settings);
  const section = context.getSectionInfo(element);
  const sectionOffset = section ? lineStartOffset(sourceText, section.lineStart) : 0;
  let bibliographyCursor = sectionOffset;

  for (const paragraph of Array.from(element.querySelectorAll("p"))) {
    const raw = paragraph.textContent?.trim() ?? "";
    if (!/^\\bibliography(?:\{[^}]*\})?$/.test(raw)) continue;
    const occurrence = nextMatchingOccurrence(documentIndex.bibliographies, raw, bibliographyCursor);
    if (!occurrence) continue;
    bibliographyCursor = occurrence.to;
    paragraph.replaceWith(buildBibliographyElement(
      element.ownerDocument,
      app,
      presentation.bibliographies.get(occurrence.from) ?? [],
      context.sourcePath,
    ));
  }

  if (!hasCitation(textContent, settings)) return;
  const showText = element.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = element.ownerDocument.createTreeWalker(element, showText);
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode()) !== null) {
    if (current.nodeType === 3) {
      const textNode = current as Text;
      if (!shouldSkipTextNode(textNode) && hasCitation(textNode.textContent ?? "", settings)) {
        nodes.push(textNode);
      }
    }
  }

  let sourceCursor = sectionOffset;
  for (const textNode of nodes) {
    const parent = textNode.parentNode;
    if (!parent) continue;
    const text = textNode.textContent ?? "";
    const fragment = createObsidianFragment(element.ownerDocument);
    const regex = settings.citationSyntax === "pandoc"
      ? /\[((?:@[^\]\s;]+(?:\s*;\s*)?)+)\]/g
      : /\\cite\{([^}]+)\}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) fragment.append(text.slice(lastIndex, match.index));
      const occurrence = nextMatchingOccurrence(documentIndex.citations, match[0], sourceCursor);
      if (!occurrence) {
        fragment.append(match[0]);
      } else {
        sourceCursor = occurrence.to;
        fragment.append(buildCiteElement(
          element.ownerDocument,
          app,
          presentation.citations.get(occurrence.from) ?? toCiteEntries(occurrence, resolver),
          context.sourcePath,
        ));
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) fragment.append(text.slice(lastIndex));
    parent.replaceChild(fragment, textNode);
  }
}
