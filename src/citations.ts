import type { CiteSettings } from "./settings";

const LATEX_CITE_SOURCE = /\\cite\{([^}]+)\}/.source;
const PANDOC_CITE_SOURCE = /\[((?:@[^\]\s;]+(?:\s*;\s*)?)+)\]/.source;
const BIBLIOGRAPHY_SOURCE = /\\bibliography(?:\{[^}]*\})?/.source;

export interface TextRange {
  from: number;
  to: number;
}

export interface CitationOccurrence extends TextRange {
  raw: string;
  keys: string[];
  numbers: number[];
}

export interface BibliographyOccurrence extends TextRange {
  raw: string;
  entries: Array<{ key: string; number: number }>;
}

export interface CitationDocumentIndex {
  citations: CitationOccurrence[];
  bibliographies: BibliographyOccurrence[];
  protectedRanges: TextRange[];
}

export function splitCitationKeys(raw: string, settings: CiteSettings): string[] {
  const separator = settings.citationSyntax === "pandoc" ? ";" : ",";
  return raw
    .split(separator)
    .map((key) => key.trim().replace(settings.citationSyntax === "pandoc" ? /^@/ : /$^/, ""))
    .filter(Boolean);
}

export function getCitationRegex(settings: CiteSettings): RegExp {
  return new RegExp(
    settings.citationSyntax === "pandoc" ? PANDOC_CITE_SOURCE : LATEX_CITE_SOURCE,
    "g",
  );
}

export function hasCitation(text: string, settings: CiteSettings): boolean {
  return settings.citationSyntax === "pandoc" ? text.includes("[@") : text.includes("\\cite{");
}

function collectFencedCodeRanges(text: string, ranges: TextRange[]): void {
  const openingRegex = /^(?: {0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/gm;
  let opening: RegExpExecArray | null;
  while ((opening = openingRegex.exec(text)) !== null) {
    const marker = opening[1] ?? "```";
    const closingRegex = new RegExp(
      `^(?: {0,3})${marker[0]}{${marker.length},}\\s*$`,
      "gm",
    );
    closingRegex.lastIndex = openingRegex.lastIndex;
    const closing = closingRegex.exec(text);
    const to = closing ? closing.index + closing[0].length : text.length;
    ranges.push({ from: opening.index, to });
    openingRegex.lastIndex = to;
  }
}

function collectInlineCodeRanges(text: string, ranges: TextRange[]): void {
  const regex = /(`+)([^\n]*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length });
  }
}

function collectMathRanges(text: string, ranges: TextRange[]): void {
  let index = 0;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] !== "$") {
      index += 1;
      continue;
    }
    const block = text[index + 1] === "$";
    const delimiter = block ? "$$" : "$";
    const contentStart = index + delimiter.length;
    if (!block && /\s/.test(text[contentStart] ?? "")) {
      index += 1;
      continue;
    }
    let cursor = contentStart;
    while (cursor < text.length) {
      if (!block && text[cursor] === "\n") break;
      if (text[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (text.startsWith(delimiter, cursor)
        && (block || !/\s/.test(text[cursor - 1] ?? ""))) {
        ranges.push({ from: index, to: cursor + delimiter.length });
        index = cursor + delimiter.length;
        break;
      }
      cursor += 1;
    }
    if (cursor >= text.length || (!block && text[cursor] === "\n")) index += 1;
  }
}

export function collectProtectedRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  if (/^---\s*(?:\r?\n)/.test(text)) {
    const closing = /^---\s*$/gm;
    closing.lastIndex = text.indexOf("\n") + 1;
    const match = closing.exec(text);
    if (match) ranges.push({ from: 0, to: match.index + match[0].length });
  }

  collectFencedCodeRanges(text, ranges);
  collectInlineCodeRanges(text, ranges);
  collectMathRanges(text, ranges);

  const sorted = ranges.sort((a, b) => a.from - b.from || b.to - a.to);
  const merged: TextRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.from > previous.to) merged.push({ ...range });
    else previous.to = Math.max(previous.to, range.to);
  }
  return merged;
}

export function isProtectedOffset(offset: number, ranges: TextRange[]): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to);
}

export function createCitationDocumentIndex(
  text: string,
  settings: CiteSettings,
): CitationDocumentIndex {
  const protectedRanges = collectProtectedRanges(text);
  const events: Array<
    | { type: "citation"; from: number; to: number; raw: string; captured: string }
    | { type: "bibliography"; from: number; to: number; raw: string }
  > = [];

  let match: RegExpExecArray | null;
  const citationRegex = getCitationRegex(settings);
  while ((match = citationRegex.exec(text)) !== null) {
    if (!isProtectedOffset(match.index, protectedRanges)) {
      events.push({
        type: "citation",
        from: match.index,
        to: match.index + match[0].length,
        raw: match[0],
        captured: match[1] ?? "",
      });
    }
  }

  const bibliographyRegex = new RegExp(BIBLIOGRAPHY_SOURCE, "g");
  while ((match = bibliographyRegex.exec(text)) !== null) {
    if (!isProtectedOffset(match.index, protectedRanges)) {
      events.push({
        type: "bibliography",
        from: match.index,
        to: match.index + match[0].length,
        raw: match[0],
      });
    }
  }

  events.sort((a, b) => a.from - b.from);
  const citations: CitationOccurrence[] = [];
  const bibliographies: BibliographyOccurrence[] = [];
  let numbers = new Map<string, number>();

  for (const event of events) {
    if (event.type === "citation") {
      const keys = splitCitationKeys(event.captured, settings);
      const citationNumbers = keys.map((key) => {
        const existing = numbers.get(key);
        if (existing !== undefined) return existing;
        const next = numbers.size + 1;
        numbers.set(key, next);
        return next;
      });
      citations.push({ ...event, keys, numbers: citationNumbers });
    } else {
      bibliographies.push({
        ...event,
        entries: [...numbers.entries()].map(([key, number]) => ({ key, number })),
      });
      numbers = new Map<string, number>();
    }
  }

  return { citations, bibliographies, protectedRanges };
}
