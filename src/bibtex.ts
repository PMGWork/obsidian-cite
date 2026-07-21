import type { BibliographyStyle } from "./settings";

export interface BibtexEntry {
  key: string;
  type: string;
  fields: Record<string, string>;
}

export interface BibtexParseResult {
  entries: BibtexEntry[];
  errors: string[];
}

interface ParsedValue {
  value: string;
  next: number;
}

function isWhitespaceOrComma(char: string | undefined): boolean {
  return char === undefined || /[\s,]/.test(char);
}

function skipWhitespaceAndCommas(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    if (isWhitespaceOrComma(text[index])) {
      index += 1;
      continue;
    }
    if (text[index] === "%") {
      const newline = text.indexOf("\n", index);
      index = newline < 0 ? text.length : newline + 1;
      continue;
    }
    break;
  }
  return index;
}

function skipWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    if (/\s/.test(text[index] ?? "")) {
      index += 1;
      continue;
    }
    if (text[index] === "%") {
      const newline = text.indexOf("\n", index);
      index = newline < 0 ? text.length : newline + 1;
      continue;
    }
    break;
  }
  return index;
}

function readIdentifier(text: string, start: number): { value: string; next: number } {
  let index = start;
  while (index < text.length && /[\w:-]/.test(text[index] ?? "")) index += 1;
  return { value: text.slice(start, index), next: index };
}

function cleanBibtexText(value: string): string {
  return value
    .replace(/[{}]/g, "")
    .replace(/\\&/g, "&")
    .replace(/\\([{}%_$#])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function readBracedValue(text: string, start: number): ParsedValue | null {
  let index = start + 1;
  let depth = 1;
  let escaped = false;
  while (index < text.length) {
    const char = text[index];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { value: cleanBibtexText(text.slice(start + 1, index)), next: index + 1 };
      }
    }
    index += 1;
  }
  return null;
}

function readQuotedValue(text: string, start: number): ParsedValue | null {
  let index = start + 1;
  let braceDepth = 0;
  let escaped = false;
  while (index < text.length) {
    const char = text[index];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "{") {
      braceDepth += 1;
    } else if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (char === '"' && braceDepth === 0) {
      return { value: cleanBibtexText(text.slice(start + 1, index)), next: index + 1 };
    }
    index += 1;
  }
  return null;
}

function readBareValue(text: string, start: number, closing: string): ParsedValue {
  let index = start;
  while (index < text.length && text[index] !== "," && text[index] !== closing) index += 1;
  return { value: cleanBibtexText(text.slice(start, index)), next: index };
}

function readValue(text: string, start: number, closing: string): ParsedValue | null {
  const index = skipWhitespace(text, start);
  if (text[index] === "{") return readBracedValue(text, index);
  if (text[index] === '"') return readQuotedValue(text, index);
  return readBareValue(text, index, closing);
}

function findEntryEnd(text: string, start: number, opening: string, closing: string): number {
  let depth = 1;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === opening) depth += 1;
    if (char === closing) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

function parseBibtexBlock(text: string, blockNumber: number): BibtexParseResult {
  const entries: BibtexEntry[] = [];
  const errors: string[] = [];
  let index = 0;

  while (index < text.length) {
    const at = text.indexOf("@", index);
    if (at < 0) break;
    const typeToken = readIdentifier(text, skipWhitespace(text, at + 1));
    const type = typeToken.value.toLowerCase();
    let cursor = skipWhitespace(text, typeToken.next);
    const opening = text[cursor];
    if (!type || (opening !== "{" && opening !== "(")) {
      errors.push(`BibTeX block ${blockNumber}: malformed entry near offset ${at}.`);
      index = at + 1;
      continue;
    }

    const closing = opening === "{" ? "}" : ")";
    cursor += 1;
    if (["comment", "preamble", "string"].includes(type)) {
      index = findEntryEnd(text, cursor, opening, closing);
      continue;
    }

    const comma = text.indexOf(",", cursor);
    const closeBeforeComma = text.indexOf(closing, cursor);
    if (comma < 0 || (closeBeforeComma >= 0 && closeBeforeComma < comma)) {
      errors.push(`BibTeX block ${blockNumber}: entry @${type} is missing a citation key or comma.`);
      index = findEntryEnd(text, cursor, opening, closing);
      continue;
    }

    const key = text.slice(cursor, comma).trim();
    if (!key) {
      errors.push(`BibTeX block ${blockNumber}: entry @${type} has an empty citation key.`);
      index = findEntryEnd(text, comma + 1, opening, closing);
      continue;
    }

    cursor = comma + 1;
    const fields: Record<string, string> = {};
    let completed = false;
    while (cursor < text.length) {
      cursor = skipWhitespaceAndCommas(text, cursor);
      if (text[cursor] === closing) {
        cursor += 1;
        completed = true;
        break;
      }

      const fieldToken = readIdentifier(text, cursor);
      if (!fieldToken.value) break;
      cursor = skipWhitespace(text, fieldToken.next);
      if (text[cursor] !== "=") break;
      const parsed = readValue(text, cursor + 1, closing);
      if (!parsed) break;
      fields[fieldToken.value.toLowerCase()] = parsed.value;
      cursor = parsed.next;
    }

    if (!completed) {
      errors.push(`BibTeX block ${blockNumber}: entry "${key}" is not closed correctly.`);
      index = findEntryEnd(text, cursor, opening, closing);
      continue;
    }

    entries.push({ key, type, fields });
    index = cursor;
  }

  return { entries, errors };
}

export function parseBibtexEntries(content: string): BibtexParseResult {
  const entries: BibtexEntry[] = [];
  const errors: string[] = [];
  const fencedBlock = /^```bibtex\s*\r?\n([\s\S]*?)^```\s*$/gim;
  let match: RegExpExecArray | null;
  let blockNumber = 0;
  while ((match = fencedBlock.exec(content)) !== null) {
    blockNumber += 1;
    const parsed = parseBibtexBlock(match[1] ?? "", blockNumber);
    entries.push(...parsed.entries);
    errors.push(...parsed.errors);
  }
  return { entries, errors };
}

const VENUE_WITH_IN_TYPES = new Set(["inproceedings", "conference", "incollection", "inbook", "proceedings"]);

function normalizeEntryType(entryType: string): string {
  const type = entryType.toLowerCase();
  return type === "inproceeding" || type === "conference" ? "inproceedings" : type;
}

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return value === null || value === undefined ? "" : String(value);
}

function stripAffiliation(raw: string): string {
  return raw.replace(/\s*\([^)]*\)/g, "").trim();
}

function hasCjk(text: string): boolean {
  return /[\u3000-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(text);
}

function isCorporateAuthor(name: string): boolean {
  if (name.includes(",")) return false;
  return /\b(Inc\.|Ltd\.|LLC|Corp\.|Corporation|Company|Association|Press|Center)\b/i.test(name)
    || /^[\w .&'-]+\.$/.test(name)
    || (!/\s/.test(name) && /^[A-Z][a-zA-Z0-9&'-]*$/.test(name) && name.length > 2);
}

function isFamilyNamePart(segment: string): boolean {
  const words = segment.trim().split(/\s+/);
  return words.length <= 2 && !/\b[A-Z]\./.test(segment);
}

function parseAuthorChunk(chunk: string): string[] {
  if (!chunk.includes(",")) return [chunk];
  const segments = chunk.split(",").map((part) => part.trim()).filter(Boolean);
  if (segments.length <= 2) return [chunk];
  if (segments.length % 2 === 0 && segments.every((part, i) => i % 2 !== 0 || isFamilyNamePart(part))) {
    const authors: string[] = [];
    for (let index = 0; index < segments.length; index += 2) {
      authors.push(`${segments[index] ?? ""}, ${segments[index + 1] ?? ""}`);
    }
    return authors;
  }
  return segments;
}

export function parseAuthorList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(String).join(" and ") : stringifyValue(value);
  if (!raw.trim()) return [];
  return raw.split(/\s+and\s+/i).flatMap((chunk) => parseAuthorChunk(chunk.trim())).map(stripAffiliation).filter(Boolean);
}

function abbreviateWesternName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  const last = parts.pop() ?? "";
  return `${parts.map((part) => `${part[0] ?? ""}.`).join(" ")} ${last}`.trim();
}

function formatAuthorName(raw: string, abbreviate: boolean): string {
  const name = stripAffiliation(raw);
  if (!name || isCorporateAuthor(name)) return name;
  if (!name.includes(",")) return abbreviate ? abbreviateWesternName(name) : name;
  const comma = name.indexOf(",");
  const family = name.slice(0, comma).trim();
  const given = name.slice(comma + 1).trim();
  if (!given) return name;
  if (hasCjk(family) || hasCjk(given)) return abbreviate ? name : `${family} ${given}`;
  const normalized = `${given} ${family}`;
  return abbreviate ? abbreviateWesternName(normalized) : normalized;
}

export function stringifyAuthors(value: unknown, abbreviate: boolean): string {
  return parseAuthorList(value).map((author) => formatAuthorName(author, abbreviate)).filter(Boolean).join(" and ");
}

function extractLastName(raw: string): string {
  const name = stripAffiliation(raw);
  if (name.includes(",")) return name.split(",")[0]?.trim() ?? name;
  return name.split(/\s+/).pop() ?? name;
}

function getAlphaLabel(authors: string, year: string): string {
  const firstAuthor = authors.split(/\s+and\s+/)[0]?.trim() ?? "";
  return `${extractLastName(firstAuthor).slice(0, 3) || "ref"}${year.slice(-2)}`;
}

function cleanupLabel(label: string): string {
  return label.replace(/\s+\./g, ".").replace(/\(\s*\)/g, "").replace(/\s+,/g, ",")
    .replace(/,\s*\./g, ".").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
}

function joinParts(parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim() ?? "").filter(Boolean).join(", ");
}

function normalizePageRange(raw?: string): string {
  return raw?.trim().replace(/--/g, "–") ?? "";
}

function formatPages(raw?: string, chapter = false): string {
  const pages = normalizePageRange(raw);
  if (!pages) return "";
  if (chapter) return /^pages?\s/i.test(pages) ? pages : `pages ${pages}`;
  return /^p+p?\.?\s/i.test(pages) ? pages : `p. ${pages}`;
}

function withIn(value: string): string {
  return value.startsWith("In ") ? value : `In ${value}`;
}

function formatDefault(type: string, fields: Record<string, string>, year: string): string {
  const booktitle = fields.booktitle?.trim() ?? "";
  const journal = fields.journal?.trim() ?? "";
  const publisher = fields.publisher?.trim() ?? "";
  const other = fields.howpublished?.trim() || fields.url?.trim() || "";
  let venue: string;
  if (normalizeEntryType(type) === "article") venue = journal || booktitle || publisher || other;
  else if (VENUE_WITH_IN_TYPES.has(normalizeEntryType(type))) venue = booktitle || journal || publisher || other;
  else venue = booktitle ? withIn(booktitle) : journal || publisher || other;
  if (venue && VENUE_WITH_IN_TYPES.has(normalizeEntryType(type))) venue = withIn(venue);
  return joinParts([venue, year]);
}

export function formatBibliographyPublication(type: string, fields: Record<string, string>, year: string): string {
  switch (normalizeEntryType(type)) {
    case "article": {
      const volume = fields.volume?.trim();
      const number = fields.number?.trim();
      const pages = normalizePageRange(fields.pages);
      const detail = volume && number && pages ? `${volume}(${number}):${pages}`
        : volume && pages ? `${volume}:${pages}` : formatPages(fields.pages) || volume;
      return joinParts([fields.journal, detail, year]);
    }
    case "inproceedings":
      return joinParts([
        fields.booktitle ? withIn(fields.booktitle) : "",
        fields.series,
        formatPages(fields.pages),
        year,
        fields.publisher,
      ]) || formatDefault(type, fields, year);
    case "incollection":
    case "inbook":
      return joinParts([
        fields.booktitle ? withIn(fields.booktitle) : "",
        formatPages(fields.pages, true),
        fields.publisher,
        year,
      ]) || formatDefault(type, fields, year);
    case "book": {
      const volumeAndSeries = fields.volume && fields.series ? `volume ${fields.volume} of ${fields.series}`
        : fields.series || (fields.volume ? `volume ${fields.volume}` : "");
      const edition = fields.edition
        ? /edition$/i.test(fields.edition) ? fields.edition.toLowerCase() : `${fields.edition.toLowerCase()} edition`
        : "";
      return joinParts([volumeAndSeries, fields.publisher || fields.institution, edition, year])
        || formatDefault(type, fields, year);
    }
    case "misc":
      return joinParts([fields.howpublished || fields.publisher || fields.journal || fields.url,
        fields.url && (fields.howpublished || fields.publisher || fields.journal) ? fields.url : ""])
        || formatDefault(type, fields, year);
    default:
      return formatDefault(type, fields, year);
  }
}

export function renderBibliographyStyle(
  style: BibliographyStyle,
  values: Record<string, string>,
): string {
  const formats: Record<BibliographyStyle, string> = {
    plain: "[{label}] {authors}. {title}. {publication}.",
    abbrv: "[{label}] {abbrAuthors}. {title}. {publication}.",
    unsrt: "[{label}] {authors}. {title}. {publication}.",
    alpha: "[{label}] {authors}. {title}. {publication}.",
    ieeetr: '[{label}] {authors}, "{title}," {publication}.',
    acm: "[{label}] {authors}. {title}. {publication}.",
  };
  const data: Record<string, string> = {
    ...values,
    label: style === "alpha" ? getAlphaLabel(values.authors ?? "", values.year ?? "") : values.number ?? "",
  };
  return cleanupLabel(formats[style].replace(/\{(\w+)\}/g, (_match, key: string) => data[key] ?? ""));
}
