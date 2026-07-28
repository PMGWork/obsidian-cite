import { normalizePath } from "obsidian";

export type CitationSyntax = "latex" | "pandoc";
export type BibliographyStyle =
  | "plain"
  | "abbrv"
  | "unsrt"
  | "alpha"
  | "ieeetr"
  | "acm"
  | "siam"
  | "apalike";

export interface CiteSettings {
  citationSyntax: CitationSyntax;
  referenceFolder: string;
  bibliographyStyle: BibliographyStyle;
}

export const DEFAULT_SETTINGS: CiteSettings = {
  citationSyntax: "latex",
  referenceFolder: "",
  bibliographyStyle: "plain",
};

const CITATION_SYNTAXES = new Set<CitationSyntax>(["latex", "pandoc"]);
const BIBLIOGRAPHY_STYLES = new Set<BibliographyStyle>([
  "plain",
  "abbrv",
  "unsrt",
  "alpha",
  "ieeetr",
  "acm",
  "siam",
  "apalike",
]);
const BIBLIOGRAPHY_STYLE_ALIASES: Record<string, BibliographyStyle> = {
  jplain: "plain",
  jabbrv: "abbrv",
  junsrt: "unsrt",
};

export function normalizeReferenceFolder(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? normalizePath(trimmed) : "";
}

export function sanitizeSettings(value: unknown): CiteSettings {
  const stored = value && typeof value === "object"
    ? value as Partial<Record<keyof CiteSettings, unknown>>
    : {};

  const citationSyntax = typeof stored.citationSyntax === "string" &&
    CITATION_SYNTAXES.has(stored.citationSyntax as CitationSyntax)
    ? stored.citationSyntax as CitationSyntax
    : DEFAULT_SETTINGS.citationSyntax;
  const storedBibliographyStyle = typeof stored.bibliographyStyle === "string"
    ? BIBLIOGRAPHY_STYLE_ALIASES[stored.bibliographyStyle] ?? stored.bibliographyStyle
    : "";
  const bibliographyStyle = BIBLIOGRAPHY_STYLES.has(storedBibliographyStyle as BibliographyStyle)
    ? storedBibliographyStyle as BibliographyStyle
    : DEFAULT_SETTINGS.bibliographyStyle;
  const referenceFolder = typeof stored.referenceFolder === "string"
    ? normalizeReferenceFolder(stored.referenceFolder)
    : DEFAULT_SETTINGS.referenceFolder;

  return { citationSyntax, referenceFolder, bibliographyStyle };
}
