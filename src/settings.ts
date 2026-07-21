import { normalizePath } from "obsidian";

export type CitationSyntax = "latex" | "pandoc";
export type BibliographyStyle =
  | "plain"
  | "abbrv"
  | "unsrt"
  | "alpha"
  | "ieeetr"
  | "acm";

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
]);

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
  const bibliographyStyle = typeof stored.bibliographyStyle === "string" &&
    BIBLIOGRAPHY_STYLES.has(stored.bibliographyStyle as BibliographyStyle)
    ? stored.bibliographyStyle as BibliographyStyle
    : DEFAULT_SETTINGS.bibliographyStyle;
  const referenceFolder = typeof stored.referenceFolder === "string"
    ? normalizeReferenceFolder(stored.referenceFolder)
    : DEFAULT_SETTINGS.referenceFolder;

  return { citationSyntax, referenceFolder, bibliographyStyle };
}
