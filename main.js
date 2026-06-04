var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianCitePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_view = require("@codemirror/view");
var import_state = require("@codemirror/state");
var import_autocomplete = require("@codemirror/autocomplete");
var DEFAULT_SETTINGS = {
  citationSyntax: "latex",
  referenceFolder: "",
  bibliographyStyle: "plain"
};
var CITE_SOURCE = /\\cite\{([^}]+)\}/.source;
var PANDOC_CITE_SOURCE = /\[((?:@[^\]\s;]+(?:\s*;\s*)?)+)\]/.source;
var BIBLIOGRAPHY_SOURCE = /\\bibliography(?:\{[^}]*\})?/.source;
var refreshCiteDecorations = import_state.StateEffect.define();
function getEditorSourcePath(view) {
  var _a, _b;
  try {
    const info = view.state.field(import_obsidian.editorInfoField);
    return (_b = (_a = info == null ? void 0 : info.file) == null ? void 0 : _a.path) != null ? _b : "";
  } catch (e) {
    return "";
  }
}
var VENUE_WITH_IN_TYPES = /* @__PURE__ */ new Set([
  "inproceedings",
  "conference",
  "incollection",
  "inbook",
  "proceedings"
]);
function normalizeEntryType(entryType) {
  const type = entryType.toLowerCase();
  if (type === "inproceeding") return "inproceedings";
  if (type === "conference") return "inproceedings";
  return type;
}
function cleanBibtexValue(value) {
  return value.trim().replace(/^["{]+|["},]+$/g, "").replace(/[{}]/g, "").replace(/\\&/g, "&").replace(/\s+/g, " ").trim();
}
function extractBibtexEntries(content) {
  return [...content.matchAll(/```bibtex[\s\S]*?```/gi)].flatMap((block) => {
    const blockText = block[0];
    return [...blockText.matchAll(/@(\w+)\{([^,\s\r\n]+),([\s\S]*?)(?=\n\s*@\w+\{|```)/g)].map((entryMatch) => {
      const fields = {};
      const body = entryMatch[3];
      for (const fieldMatch of body.matchAll(/(\w+)\s*=\s*({[\s\S]*?}|"[\s\S]*?"|[^,\r\n]+)/g)) {
        fields[fieldMatch[1].toLowerCase()] = cleanBibtexValue(fieldMatch[2]);
      }
      return { key: entryMatch[2], type: entryMatch[1].toLowerCase(), fields };
    });
  });
}
function splitKeys(raw) {
  return raw.split(",").map((k) => k.trim()).filter(Boolean);
}
function splitCitationKeys(raw, settings) {
  if (settings.citationSyntax === "pandoc") {
    return raw.split(";").map((key) => key.trim().replace(/^@/, "")).filter(Boolean);
  }
  return splitKeys(raw);
}
function getCitationRegex(settings) {
  return new RegExp(
    settings.citationSyntax === "pandoc" ? PANDOC_CITE_SOURCE : CITE_SOURCE,
    "g"
  );
}
function hasCitation(text, settings) {
  if (settings.citationSyntax === "pandoc") return /\[@/.test(text);
  return text.includes("\\cite{");
}
function buildCitationMap(text, settings) {
  const map = /* @__PURE__ */ new Map();
  const regex = getCitationRegex(settings);
  let match;
  let counter = 1;
  while ((match = regex.exec(text)) !== null) {
    for (const key of splitCitationKeys(match[1], settings)) {
      if (!map.has(key)) map.set(key, counter++);
    }
  }
  return map;
}
function findPreviousBibliographyEnd(text, position) {
  const regex = new RegExp(BIBLIOGRAPHY_SOURCE, "g");
  let match;
  let end = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index >= position) break;
    end = match.index + match[0].length;
  }
  return end;
}
function findNextBibliographyStart(text, position) {
  const regex = new RegExp(BIBLIOGRAPHY_SOURCE, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > position) return match.index;
  }
  return text.length;
}
function buildCitationMapInRange(text, start, end, settings) {
  return buildCitationMap(text.slice(start, end), settings);
}
function buildCitationMapAt(text, position, settings) {
  return buildCitationMapInRange(
    text,
    findPreviousBibliographyEnd(text, position),
    findNextBibliographyStart(text, position),
    settings
  );
}
function buildBibliographyCitationMap(text, position, settings) {
  return buildCitationMapInRange(
    text,
    findPreviousBibliographyEnd(text, position),
    position,
    settings
  );
}
function getLineStartOffset(text, line) {
  if (line <= 0) return 0;
  let offset = 0;
  for (let currentLine = 0; currentLine < line; currentLine++) {
    const next = text.indexOf("\n", offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return offset;
}
function extractLastName(raw) {
  var _a;
  const name = raw.replace(/\s*\([^)]*\)/g, "").trim();
  if (name.includes(",")) return name.split(",")[0].trim();
  return (_a = name.split(/\s+/).pop()) != null ? _a : name;
}
function stringifyValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (value === null || value === void 0) return "";
  return String(value);
}
function stripAffiliation(raw) {
  return raw.replace(/\s*\([^)]*\)/g, "").trim();
}
function hasCjk(text) {
  return /[\u3000-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(text);
}
function isCorporateAuthor(name) {
  if (name.includes(",")) return false;
  if (/\b(Inc\.|Ltd\.|LLC|Corp\.|Corporation|Company|Association|Press|Center)\b/i.test(
    name
  )) {
    return true;
  }
  if (/^[\w .&'-]+\.$/.test(name)) return true;
  if (!/\s/.test(name) && /^[A-Z][a-zA-Z0-9&'-]*$/.test(name) && name.length > 2) {
    return true;
  }
  return false;
}
function isFamilyNamePart(segment) {
  const words = segment.trim().split(/\s+/);
  if (words.length > 2) return false;
  if (/\b[A-Z]\./.test(segment)) return false;
  return true;
}
function parseAuthorChunk(chunk) {
  if (!chunk.includes(",")) return [chunk];
  const segments = chunk.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 2) return [chunk];
  if (segments.length % 2 === 0 && segments.every((seg, i) => i % 2 === 0 ? isFamilyNamePart(seg) : seg.length > 0)) {
    const authors = [];
    for (let i = 0; i < segments.length; i += 2) {
      authors.push(`${segments[i]}, ${segments[i + 1]}`);
    }
    return authors;
  }
  return segments;
}
function parseAuthorList(value) {
  const raw = Array.isArray(value) ? value.map((item) => String(item)).join(" and ") : stringifyValue(value);
  if (!raw.trim()) return [];
  return raw.split(/\s+and\s+/i).flatMap((chunk) => parseAuthorChunk(chunk.trim())).map((author) => stripAffiliation(author)).filter(Boolean);
}
function abbreviateWesternName(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  const last = parts.pop();
  const initials = parts.map((part) => `${part[0]}.`).join(" ");
  return `${initials} ${last}`.trim();
}
function formatAuthorName(raw, abbreviate) {
  const name = stripAffiliation(raw);
  if (!name) return "";
  if (isCorporateAuthor(name)) return name;
  if (name.includes(",")) {
    const comma = name.indexOf(",");
    const family = name.slice(0, comma).trim();
    const given = name.slice(comma + 1).trim();
    if (!given) return name;
    if (hasCjk(family) || hasCjk(given)) {
      const jp = `${family} ${given}`;
      return abbreviate ? name : jp;
    }
    const normalized = `${given} ${family}`;
    return abbreviate ? abbreviateWesternName(normalized) : normalized;
  }
  return abbreviate ? abbreviateWesternName(name) : name;
}
function stringifyAuthors(value, abbreviate) {
  return parseAuthorList(value).map((author) => formatAuthorName(author, abbreviate)).filter(Boolean).join(" and ");
}
function getAlphaLabel(authors, year) {
  var _a, _b;
  const firstAuthor = (_b = (_a = authors.split(/\s+and\s+/)[0]) == null ? void 0 : _a.trim()) != null ? _b : "";
  const base = extractLastName(firstAuthor).slice(0, 3) || "ref";
  return `${base}${year.slice(-2)}`;
}
function cleanupBibliographyLabel(label) {
  return label.replace(/\s+\./g, ".").replace(/\(\s*\)/g, "").replace(/\s+,/g, ",").replace(/,\s*\./g, ".").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
}
function renderBibliographyFormat(format, values) {
  const rendered = format.replace(/\{(\w+)\}/g, (_match, key) => {
    var _a;
    return (_a = values[key]) != null ? _a : "";
  });
  return cleanupBibliographyLabel(rendered);
}
function joinPublicationParts(parts) {
  return parts.map((part) => part.trim()).filter(Boolean).join(", ");
}
function normalizePageRange(raw) {
  var _a;
  return (_a = raw == null ? void 0 : raw.trim().replace(/--/g, "\u2013")) != null ? _a : "";
}
function formatPages(raw) {
  const pages = normalizePageRange(raw);
  if (!pages) return "";
  if (/^p+p?\.?\s/i.test(pages)) return pages;
  return `p. ${pages}`;
}
function formatChapterPages(raw) {
  const pages = normalizePageRange(raw);
  if (!pages) return "";
  if (/^pages?\s/i.test(pages)) return pages;
  return `pages ${pages}`;
}
function formatEdition(raw) {
  var _a;
  const edition = (_a = raw == null ? void 0 : raw.trim()) != null ? _a : "";
  if (!edition) return "";
  if (/edition$/i.test(edition)) return edition.toLowerCase();
  return `${edition.toLowerCase()} edition`;
}
function formatYearWithMonth(month, year) {
  var _a;
  if (!year) return "";
  const raw = (_a = month == null ? void 0 : month.trim()) != null ? _a : "";
  if (!raw) return year;
  const index = parseInt(raw, 10) - 1;
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  if (index >= 0 && index < 12) return `${monthNames[index]} ${year}`;
  return year;
}
function withIn(container) {
  return container.startsWith("In ") ? container : `In ${container}`;
}
function formatBibliographyVenue(entryType, fields) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const type = normalizeEntryType(entryType);
  const booktitle = (_b = (_a = fields.booktitle) == null ? void 0 : _a.trim()) != null ? _b : "";
  const journal = (_d = (_c = fields.journal) == null ? void 0 : _c.trim()) != null ? _d : "";
  const publisher = (_f = (_e = fields.publisher) == null ? void 0 : _e.trim()) != null ? _f : "";
  const other = ((_g = fields.howpublished) == null ? void 0 : _g.trim()) || ((_h = fields.url) == null ? void 0 : _h.trim()) || "";
  if (type === "article") {
    return journal || booktitle || publisher || other;
  }
  if (VENUE_WITH_IN_TYPES.has(type)) {
    const container = booktitle || journal || publisher || other;
    return container ? withIn(container) : "";
  }
  if (booktitle) return withIn(booktitle);
  return journal || publisher || booktitle || other;
}
function formatInproceedingsPublication(fields, year) {
  var _a, _b, _c;
  const parts = [];
  const booktitle = (_a = fields.booktitle) == null ? void 0 : _a.trim();
  if (booktitle) parts.push(withIn(booktitle));
  const series = (_b = fields.series) == null ? void 0 : _b.trim();
  if (series) parts.push(series);
  const pages = formatPages(fields.pages);
  if (pages) parts.push(pages);
  if (year) parts.push(year);
  const publisher = (_c = fields.publisher) == null ? void 0 : _c.trim();
  if (publisher) parts.push(publisher);
  const formatted = joinPublicationParts(parts);
  return formatted || formatDefaultPublication("inproceedings", fields, year);
}
function formatIncollectionPublication(fields, year) {
  var _a, _b;
  const parts = [];
  const booktitle = (_a = fields.booktitle) == null ? void 0 : _a.trim();
  if (booktitle) parts.push(withIn(booktitle));
  const pages = formatChapterPages(fields.pages);
  if (pages) parts.push(pages);
  const publisher = (_b = fields.publisher) == null ? void 0 : _b.trim();
  if (publisher) parts.push(publisher);
  if (year) parts.push(year);
  const formatted = joinPublicationParts(parts);
  return formatted || formatDefaultPublication("incollection", fields, year);
}
function formatBookPublication(fields, year) {
  var _a, _b, _c, _d;
  const parts = [];
  const series = (_a = fields.series) == null ? void 0 : _a.trim();
  const volume = (_b = fields.volume) == null ? void 0 : _b.trim();
  if (volume && series) parts.push(`volume ${volume} of ${series}`);
  else if (series) parts.push(series);
  else if (volume) parts.push(`volume ${volume}`);
  const publisher = ((_c = fields.publisher) == null ? void 0 : _c.trim()) || ((_d = fields.institution) == null ? void 0 : _d.trim()) || "";
  if (publisher) parts.push(publisher);
  const edition = formatEdition(fields.edition);
  if (edition) parts.push(edition);
  const pubYear = formatYearWithMonth(fields.month, year);
  if (pubYear) parts.push(pubYear);
  const formatted = joinPublicationParts(parts);
  return formatted || formatDefaultPublication("book", fields, year);
}
function formatMiscPublication(fields, _year) {
  var _a, _b, _c, _d;
  const parts = [];
  const howpublished = (_a = fields.howpublished) == null ? void 0 : _a.trim();
  const publisher = (_b = fields.publisher) == null ? void 0 : _b.trim();
  const journal = (_c = fields.journal) == null ? void 0 : _c.trim();
  const url = (_d = fields.url) == null ? void 0 : _d.trim();
  const hasContainer = Boolean(howpublished || publisher || journal);
  if (howpublished) parts.push(howpublished);
  else if (publisher) parts.push(publisher);
  else if (journal) parts.push(journal);
  else if (url) parts.push(url);
  if (url && hasContainer) parts.push(url);
  const formatted = joinPublicationParts(parts);
  return formatted || formatDefaultPublication("misc", fields, _year);
}
function formatArticlePublication(fields, year) {
  var _a, _b, _c, _d;
  const parts = [];
  const journal = (_a = fields.journal) == null ? void 0 : _a.trim();
  if (journal) parts.push(journal);
  const volume = (_b = fields.volume) == null ? void 0 : _b.trim();
  const number = (_c = fields.number) == null ? void 0 : _c.trim();
  const pages = (_d = fields.pages) == null ? void 0 : _d.trim();
  const pageRange = normalizePageRange(pages);
  if (volume && number && pageRange) {
    parts.push(`${volume}(${number}):${pageRange}`);
  } else if (volume && pageRange) {
    parts.push(`${volume}:${pageRange}`);
  } else {
    const formattedPages = formatPages(pages);
    if (formattedPages) parts.push(formattedPages);
    else if (volume) parts.push(volume);
  }
  if (year) parts.push(year);
  return joinPublicationParts(parts);
}
function formatDefaultPublication(entryType, fields, year) {
  const venue = formatBibliographyVenue(entryType, fields);
  return joinPublicationParts([venue, year]);
}
function formatBibliographyPublication(entryType, fields, year) {
  switch (normalizeEntryType(entryType)) {
    case "inproceedings":
      return formatInproceedingsPublication(fields, year);
    case "book":
      return formatBookPublication(fields, year);
    case "incollection":
    case "inbook":
      return formatIncollectionPublication(fields, year);
    case "misc":
      return formatMiscPublication(fields, year);
    case "article":
      return formatArticlePublication(fields, year);
    default:
      return formatDefaultPublication(entryType, fields, year);
  }
}
function renderBibliographyStyle(style, values) {
  const styleValues = {
    ...values,
    label: style === "alpha" ? getAlphaLabel(values.authors, values.year) : values.number
  };
  const formats = {
    plain: "[{label}] {authors}. {title}. {publication}.",
    abbrv: "[{label}] {abbrAuthors}. {title}. {publication}.",
    unsrt: "[{label}] {authors}. {title}. {publication}.",
    alpha: "[{label}] {authors}. {title}. {publication}.",
    ieeetr: '[{label}] {authors}, "{title}," {publication}.',
    acm: "[{label}] {authors}. {title}. {publication}."
  };
  return renderBibliographyFormat(formats[style], styleValues);
}
var CitationResolver = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.citationKeyIndex = /* @__PURE__ */ new Map();
  }
  async initialize() {
    this.citationKeyIndex.clear();
    await Promise.all(
      this.getReferenceFiles().map((f) => this.indexFile(f))
    );
  }
  isInReferenceFolder(file) {
    const folder = this.settings.referenceFolder;
    if (!folder) return true;
    return file.path === `${folder}.md` || file.path.startsWith(`${folder}/`);
  }
  getReferenceFiles() {
    return this.app.vault.getMarkdownFiles().filter((file) => this.isInReferenceFolder(file));
  }
  async indexFile(file) {
    for (const [key, entry] of this.citationKeyIndex) {
      if (entry.path === file.path) this.citationKeyIndex.delete(key);
    }
    if (!this.isInReferenceFolder(file)) return;
    for (const entry of await this.extractCitationEntries(file)) {
      this.citationKeyIndex.set(entry.key, {
        path: file.path,
        type: entry.type,
        fields: entry.fields
      });
    }
  }
  async extractCitationEntries(file) {
    const content = await this.app.vault.cachedRead(file);
    return extractBibtexEntries(content);
  }
  removeFile(file) {
    this.removePath(file.path);
  }
  removePath(path) {
    for (const [key, entry] of this.citationKeyIndex) {
      if (entry.path === path) this.citationKeyIndex.delete(key);
    }
  }
  findNote(key) {
    const entry = this.citationKeyIndex.get(key);
    if (entry) {
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (file instanceof import_obsidian.TFile) return file;
    }
    return null;
  }
  getEntryFields(key) {
    var _a, _b;
    return (_b = (_a = this.citationKeyIndex.get(key)) == null ? void 0 : _a.fields) != null ? _b : null;
  }
  formatBibEntry(key, number, settings) {
    var _a, _b;
    const file = this.findNote(key);
    if (!file) return { label: `[${number}] ${key}`, filePath: null };
    const indexEntry = this.citationKeyIndex.get(key);
    const entryFields = (_a = indexEntry == null ? void 0 : indexEntry.fields) != null ? _a : null;
    const entryType = (_b = indexEntry == null ? void 0 : indexEntry.type) != null ? _b : "";
    const authorRaw = entryFields == null ? void 0 : entryFields.author;
    const yearRaw = entryFields == null ? void 0 : entryFields.year;
    const title = entryFields == null ? void 0 : entryFields.title;
    const year = yearRaw ? String(yearRaw).slice(0, 4) : "";
    const publication = formatBibliographyPublication(
      entryType,
      entryFields != null ? entryFields : {},
      year
    );
    const label = renderBibliographyStyle(settings.bibliographyStyle, {
      number: String(number),
      key,
      authors: stringifyAuthors(authorRaw, false),
      abbrAuthors: stringifyAuthors(authorRaw, true),
      year,
      title: stringifyValue(title),
      publication: stringifyValue(publication)
    });
    return { label: label || `[${number}] ${file.basename}`, filePath: file.path };
  }
  getAllKeys() {
    var _a, _b, _c, _d, _e, _f;
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    for (const [key, entry] of this.citationKeyIndex) {
      if (seen.has(key)) continue;
      seen.add(key);
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (!(file instanceof import_obsidian.TFile)) continue;
      const title = (_b = (_a = entry.fields) == null ? void 0 : _a.title) != null ? _b : file.basename;
      const author = (_d = (_c = entry.fields) == null ? void 0 : _c.author) != null ? _d : "";
      const year = (_f = (_e = entry.fields) == null ? void 0 : _e.year) != null ? _f : "";
      results.push({ key, title, detail: [author, year].filter(Boolean).join(", ") });
    }
    return results.sort((a, b) => a.key.localeCompare(b.key));
  }
};
function makeCiteCompletionSource(resolver, settings) {
  return (context) => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    let partial = "";
    if (settings.citationSyntax === "pandoc") {
      const match = before.match(/\[(?:@[^\]\s;]+;\s*)*@([^\]\s;]*)$/);
      if (!match) return null;
      partial = match[1];
    } else {
      const match = before.match(/\\cite\{([^}]*)$/);
      if (!match) return null;
      const inside = match[1];
      const lastComma = inside.lastIndexOf(",");
      partial = lastComma >= 0 ? inside.slice(lastComma + 1).replace(/^\s*/, "") : inside;
    }
    const from = context.pos - partial.length;
    const q = partial.toLowerCase();
    const options = resolver.getAllKeys().filter(({ key, title }) => {
      if (partial === "") return true;
      return key.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    }).map(({ key, title }) => {
      const keyLower = key.toLowerCase();
      const boost = keyLower.startsWith(q) ? 2 : keyLower.includes(q) ? 1 : 0;
      return {
        label: title,
        // displayed in dropdown
        apply: key,
        // inserted on selection
        type: "keyword",
        boost
      };
    });
    if (options.length === 0 && !context.explicit) return null;
    return { from, options, filter: false };
  };
}
function triggerHoverPreview(app, e, filePath, sourcePath) {
  app.workspace.trigger("hover-link", {
    event: e,
    source: "obsidian-cite",
    hoverParent: { hoverPopover: null },
    targetEl: e.currentTarget,
    linktext: filePath.replace(/\.md$/, ""),
    sourcePath
  });
}
function openCitationLink(app, e, linktext, sourcePath) {
  e.preventDefault();
  e.stopPropagation();
  app.workspace.openLinkText(linktext, sourcePath, import_obsidian.Keymap.isModEvent(e));
}
function bindCitationLink(app, a, filePath, sourcePath) {
  const linktext = filePath.replace(/\.md$/, "");
  a.setAttribute("data-href", linktext);
  a.setAttribute("href", linktext);
  a.addEventListener("mouseover", (e) => {
    triggerHoverPreview(app, e, filePath, sourcePath);
  });
  a.addEventListener("click", (e) => {
    openCitationLink(app, e, linktext, sourcePath);
  });
}
var CiteWidget = class extends import_view.WidgetType {
  constructor(app, entries, settings, sourcePath) {
    super();
    this.app = app;
    this.entries = entries;
    this.settings = settings;
    this.sourcePath = sourcePath;
  }
  eq(other) {
    return other.entries.length === this.entries.length && other.entries.every(
      (e, i) => e.key === this.entries[i].key && e.displayText === this.entries[i].displayText && e.filePath === this.entries[i].filePath
    );
  }
  // Let mouse events reach our anchor's handlers instead of being captured
  // by CM6 for cursor placement/selection.
  ignoreEvent() {
    return true;
  }
  toDOM() {
    const span = createSpan({ cls: "cite-inline" });
    span.append("[");
    const sep = ", ";
    this.entries.forEach((entry, i) => {
      if (i > 0) span.append(sep);
      if (entry.filePath) {
        const a = span.createEl("a", {
          text: entry.displayText,
          cls: "internal-link cite-link"
        });
        a.title = entry.key;
        bindCitationLink(this.app, a, entry.filePath, this.sourcePath);
      } else {
        span.createSpan({
          text: entry.displayText,
          cls: "cite-unresolved",
          attr: { title: `Unresolved: ${entry.key}` }
        });
      }
    });
    span.append("]");
    return span;
  }
};
function buildBibliographyEl(app, entries, sourcePath) {
  const container = createSpan({ cls: "cite-bibliography" });
  entries.forEach(({ label, filePath }, index) => {
    if (index > 0) container.append(document.createElement("br"));
    const row = container.createSpan({ cls: "cite-bibliography-item" });
    if (filePath) {
      const a = row.createEl("a", {
        text: label,
        cls: "internal-link cite-bibliography-link"
      });
      bindCitationLink(app, a, filePath, sourcePath);
    } else {
      row.createSpan({ text: label });
    }
  });
  return container;
}
var BibliographyWidget = class extends import_view.WidgetType {
  constructor(app, entries, sourcePath) {
    super();
    this.app = app;
    this.entries = entries;
    this.sourcePath = sourcePath;
  }
  eq(other) {
    return other.entries.length === this.entries.length && other.entries.every((e, i) => e.label === this.entries[i].label);
  }
  // Let mouse events reach our anchor's handlers instead of being captured
  // by CM6 for cursor placement/selection.
  ignoreEvent() {
    return true;
  }
  toDOM() {
    return buildBibliographyEl(this.app, this.entries, this.sourcePath);
  }
};
function buildDecorations(view, resolver, app, settings, sourcePath) {
  const { from: selFrom, to: selTo } = view.state.selection.main;
  const fullText = view.state.doc.toString();
  const pending = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match;
    const citeRegex = getCitationRegex(settings);
    while ((match = citeRegex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      if (selFrom <= end && selTo >= start) continue;
      const citationMap = buildCitationMapAt(fullText, start, settings);
      const entries = splitCitationKeys(match[1], settings).map((key) => {
        var _a, _b, _c, _d;
        return {
          key,
          number: (_a = citationMap.get(key)) != null ? _a : 1,
          displayText: String((_b = citationMap.get(key)) != null ? _b : 1),
          filePath: (_d = (_c = resolver.findNote(key)) == null ? void 0 : _c.path) != null ? _d : null
        };
      });
      pending.push({
        start,
        end,
        dec: import_view.Decoration.replace({
          widget: new CiteWidget(app, entries, settings, sourcePath)
        })
      });
    }
    const bibRegex = new RegExp(BIBLIOGRAPHY_SOURCE, "g");
    while ((match = bibRegex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      if (selFrom <= end && selTo >= start) continue;
      const citationMap = buildBibliographyCitationMap(fullText, start, settings);
      const orderedRefs = [...citationMap.entries()].sort(([, a], [, b]) => a - b).map(([key, number]) => ({
        number,
        ...resolver.formatBibEntry(key, number, settings)
      }));
      pending.push({
        start,
        end,
        dec: import_view.Decoration.replace({
          widget: new BibliographyWidget(app, orderedRefs, sourcePath)
        })
      });
    }
  }
  pending.sort((a, b) => a.start - b.start);
  const builder = new import_state.RangeSetBuilder();
  for (const { start, end, dec } of pending) builder.add(start, end, dec);
  return builder.finish();
}
var ObsidianCitePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.sourceCache = /* @__PURE__ */ new Map();
  }
  async onload() {
    await this.loadSettings();
    this.resolver = new CitationResolver(this.app, this.settings);
    this.addSettingTab(new CiteSettingTab(this.app, this));
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof import_obsidian.TFile && file.extension === "md") {
          this.resolver.indexFile(file);
          this.sourceCache.delete(file.path);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof import_obsidian.TFile && file.extension === "md") {
          this.resolver.indexFile(file);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof import_obsidian.TFile) {
          this.resolver.removeFile(file);
          this.sourceCache.delete(file.path);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof import_obsidian.TFile && file.extension === "md") {
          this.resolver.removePath(oldPath);
          this.sourceCache.delete(oldPath);
          this.resolver.indexFile(file);
        }
      })
    );
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      await this.processReadingMode(el, ctx);
    });
    this.registerEditorExtension(this.buildEditorExtension());
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
      var _a, _b;
      const view = leaf.view;
      (_a = view.previewMode) == null ? void 0 : _a.rerender(true);
      const cm = (_b = view.editor) == null ? void 0 : _b.cm;
      cm == null ? void 0 : cm.dispatch({ effects: refreshCiteDecorations.of(null) });
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
  async getSourceText(sourcePath) {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof import_obsidian.TFile)) return "";
    const cached = this.sourceCache.get(sourcePath);
    if (cached && cached.mtime === file.stat.mtime) return cached.text;
    const text = await this.app.vault.cachedRead(file);
    this.sourceCache.set(sourcePath, { mtime: file.stat.mtime, text });
    return text;
  }
  async processReadingMode(el, ctx) {
    var _a, _b, _c, _d;
    const hasCite = hasCitation((_a = el.textContent) != null ? _a : "", this.settings);
    const hasBib = (_b = el.textContent) == null ? void 0 : _b.includes("\\bibliography");
    if (!hasCite && !hasBib) return;
    const sourceText = await this.getSourceText(ctx.sourcePath);
    const section = ctx.getSectionInfo(el);
    const sectionOffset = section ? getLineStartOffset(sourceText, section.lineStart) : 0;
    if (hasBib) {
      let bibliographySearchFrom = sectionOffset;
      el.querySelectorAll("p").forEach((p) => {
        var _a2, _b2, _c2, _d2;
        if (/^\\bibliography(?:\{[^}]*\})?\s*$/.test((_b2 = (_a2 = p.textContent) == null ? void 0 : _a2.trim()) != null ? _b2 : "")) {
          const bibliographySource = (_d2 = (_c2 = p.textContent) == null ? void 0 : _c2.trim()) != null ? _d2 : "";
          const bibliographyIndex = sourceText.indexOf(
            bibliographySource,
            bibliographySearchFrom
          );
          const position = bibliographyIndex >= 0 ? bibliographyIndex : bibliographySearchFrom;
          if (bibliographyIndex >= 0) {
            bibliographySearchFrom = bibliographyIndex + bibliographySource.length;
          }
          const citationMap = buildBibliographyCitationMap(
            sourceText,
            position,
            this.settings
          );
          const orderedRefs = [...citationMap.entries()].sort(([, a], [, b]) => a - b).map(([key, number]) => ({
            number,
            ...this.resolver.formatBibEntry(key, number, this.settings)
          }));
          p.replaceWith(buildBibliographyEl(this.app, orderedRefs, ctx.sourcePath));
        }
      });
    }
    if (!hasCite) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const pending = [];
    let node;
    while (node = walker.nextNode()) {
      if (hasCitation((_c = node.textContent) != null ? _c : "", this.settings)) {
        pending.push(node);
      }
    }
    let sourceSearchFrom = sectionOffset;
    for (const textNode of pending) {
      const parent = textNode.parentNode;
      if (!parent) continue;
      const text = (_d = textNode.textContent) != null ? _d : "";
      const fragment = document.createDocumentFragment();
      const regex = getCitationRegex(this.settings);
      let lastIndex = 0;
      let match;
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
          var _a2;
          if (i > 0) span.append(sep);
          const number = (_a2 = citationMap.get(key)) != null ? _a2 : 1;
          const file = this.resolver.findNote(key);
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
  buildEditorExtension() {
    const resolver = this.resolver;
    const app = this.app;
    const settings = this.settings;
    return [
      (0, import_autocomplete.autocompletion)({
        override: [makeCiteCompletionSource(resolver, settings)],
        activateOnTyping: true,
        addToOptions: [
          {
            // Key shown as caption below the title
            render(completion) {
              const key = typeof completion.apply === "string" ? completion.apply : null;
              if (!key) return null;
              const el = document.createElement("span");
              el.className = "cite-completion-key";
              el.textContent = key;
              return el;
            },
            position: 55
            // after default label (50)
          },
          {
            // Separator between items
            render() {
              const el = document.createElement("hr");
              el.className = "cite-completion-separator";
              return el;
            },
            position: 90
          }
        ]
      }),
      import_view.ViewPlugin.fromClass(
        class {
          constructor(view) {
            this.decorations = buildDecorations(
              view,
              resolver,
              app,
              settings,
              getEditorSourcePath(view)
            );
          }
          update(update) {
            const needsRefresh = update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.some(
              (tr) => tr.effects.some((effect) => effect.is(refreshCiteDecorations))
            );
            if (needsRefresh) {
              this.decorations = buildDecorations(
                update.view,
                resolver,
                app,
                settings,
                getEditorSourcePath(update.view)
              );
            }
          }
        },
        { decorations: (v) => v.decorations }
      )
    ];
  }
};
var CiteSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Citation syntax").setDesc("Inline citation notation to parse and complete").addDropdown(
      (drop) => drop.addOption("latex", "\\cite{key}").addOption("pandoc", "[@key]").setValue(this.plugin.settings.citationSyntax).onChange(async (val) => {
        this.plugin.settings.citationSyntax = val;
        await this.plugin.saveSettings();
        this.plugin.refreshOpenNotes();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Reference folder").setDesc("Folder used to resolve citation keys").addText(
      (text) => text.setPlaceholder("papers").setValue(this.plugin.settings.referenceFolder).onChange(async (val) => {
        this.plugin.settings.referenceFolder = val.trim().replace(/^\/|\/$/g, "");
        await this.plugin.saveSettings();
        await this.plugin.reindexReferences();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Bibliography style").setDesc("BibTeX-style bibliography preset").addDropdown(
      (drop) => drop.addOption("plain", "plain").addOption("abbrv", "abbrv").addOption("unsrt", "unsrt").addOption("alpha", "alpha").addOption("ieeetr", "ieeetr").addOption("acm", "acm").setValue(this.plugin.settings.bibliographyStyle).onChange(async (val) => {
        this.plugin.settings.bibliographyStyle = val;
        await this.plugin.saveSettings();
        this.plugin.refreshOpenNotes();
      })
    );
  }
};
