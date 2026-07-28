import { getLanguage } from "obsidian";

export type CiteLocale = "en" | "ja" | "zh";

export const BIBLIOGRAPHY_STYLE_LABELS = {
  plain: "Plain / jplain",
  abbrv: "Abbreviated / jabbrv",
  unsrt: "Unsorted / junsrt",
  alpha: "Alphabetic label",
  ieeetr: "IEEE Transactions",
  acm: "ACM",
  siam: "SIAM",
  apalike: "APA-like",
} as const;

export interface CiteTranslations {
  citationSyntax: string;
  citationSyntaxDesc: string;
  referenceFolder: string;
  referenceFolderDesc: string;
  referenceFolderPlaceholder: string;
  bibliographyStyle: string;
  bibliographyStyleDesc: string;
  referenceIndex: string;
  referenceIndexDesc: string;
  referenceFolderRequired: string;
  reindex: string;
  files: (count: number) => string;
  entries: (count: number) => string;
  duplicateKeys: (count: number) => string;
  parseErrors: (count: number) => string;
  duplicateKeysWarning: (keys: string) => string;
  bibtexParseErrors: string;
  bibliographyStyles: typeof BIBLIOGRAPHY_STYLE_LABELS;
}

const TRANSLATIONS: Record<CiteLocale, CiteTranslations> = {
  en: {
    citationSyntax: "Citation syntax",
    citationSyntaxDesc: "Inline citation notation to parse and complete",
    referenceFolder: "Reference folder",
    referenceFolderDesc: "Folder containing notes with fenced BibTeX blocks. Leave empty to disable indexing.",
    referenceFolderPlaceholder: "References",
    bibliographyStyle: "Bibliography style",
    bibliographyStyleDesc: "Formatting and ordering used for citations and bibliography entries",
    referenceIndex: "Reference index",
    referenceIndexDesc: "Index status, duplicate keys, and BibTeX parse errors",
    referenceFolderRequired: "Choose a reference folder before citations can be resolved. Cite does not scan the entire vault.",
    reindex: "Reindex",
    files: (count) => `${count} files`,
    entries: (count) => `${count} entries`,
    duplicateKeys: (count) => `${count} duplicate keys`,
    parseErrors: (count) => `${count} parse errors`,
    duplicateKeysWarning: (keys) => `Duplicate keys (first path wins): ${keys}`,
    bibtexParseErrors: "BibTeX parse errors",
    bibliographyStyles: BIBLIOGRAPHY_STYLE_LABELS,
  },
  ja: {
    citationSyntax: "引用形式",
    citationSyntaxDesc: "解析および補完するインライン引用の記法",
    referenceFolder: "文献フォルダ",
    referenceFolderDesc: "BibTeXコードブロックを含むノートのフォルダ。空欄にすると索引を無効にします。",
    referenceFolderPlaceholder: "文献",
    bibliographyStyle: "文献一覧のスタイル",
    bibliographyStyleDesc: "引用と文献一覧の書式および並び順",
    referenceIndex: "文献索引",
    referenceIndexDesc: "索引の状態、重複キー、BibTeX解析エラー",
    referenceFolderRequired: "引用を解決するには文献フォルダを指定してください。CiteはVault全体を走査しません。",
    reindex: "索引を再作成",
    files: (count) => `${count}ファイル`,
    entries: (count) => `${count}件`,
    duplicateKeys: (count) => `重複キー${count}件`,
    parseErrors: (count) => `解析エラー${count}件`,
    duplicateKeysWarning: (keys) => `重複キー（パス順で最初の項目を使用）: ${keys}`,
    bibtexParseErrors: "BibTeX解析エラー",
    bibliographyStyles: BIBLIOGRAPHY_STYLE_LABELS,
  },
  zh: {
    citationSyntax: "引用语法",
    citationSyntaxDesc: "要解析和补全的行内引用格式",
    referenceFolder: "文献文件夹",
    referenceFolderDesc: "包含BibTeX代码块笔记的文件夹。留空可禁用索引。",
    referenceFolderPlaceholder: "文献",
    bibliographyStyle: "参考文献样式",
    bibliographyStyleDesc: "引用和参考文献条目的格式及排序方式",
    referenceIndex: "文献索引",
    referenceIndexDesc: "索引状态、重复键和BibTeX解析错误",
    referenceFolderRequired: "请先选择文献文件夹以解析引用。Cite不会扫描整个仓库。",
    reindex: "重建索引",
    files: (count) => `${count}个文件`,
    entries: (count) => `${count}条记录`,
    duplicateKeys: (count) => `${count}个重复键`,
    parseErrors: (count) => `${count}个解析错误`,
    duplicateKeysWarning: (keys) => `重复键（使用路径排序最前的条目）：${keys}`,
    bibtexParseErrors: "BibTeX解析错误",
    bibliographyStyles: BIBLIOGRAPHY_STYLE_LABELS,
  },
};

export function resolveLocale(language: string): CiteLocale {
  const normalized = language.toLowerCase().replace("_", "-");
  if (normalized === "ja" || normalized.startsWith("ja-")) return "ja";
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh";
  return "en";
}

export function getTranslations(language = getLanguage()): CiteTranslations {
  return TRANSLATIONS[resolveLocale(language)];
}
