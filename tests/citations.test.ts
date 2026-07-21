import { describe, expect, it } from "vitest";
import {
  collectProtectedRanges,
  createCitationDocumentIndex,
  isProtectedOffset,
} from "../src/citations";
import type { CiteSettings } from "../src/settings";

const latex: CiteSettings = {
  citationSyntax: "latex",
  referenceFolder: "References",
  bibliographyStyle: "plain",
};
const pandoc: CiteSettings = { ...latex, citationSyntax: "pandoc" };

describe("createCitationDocumentIndex", () => {
  it("numbers LaTeX citations and resets numbering after each bibliography", () => {
    const index = createCitationDocumentIndex(
      "First \\cite{a,b}; again \\cite{a}.\n\\bibliography\nNext \\cite{c}.",
      latex,
    );
    expect(index.citations.map((citation) => citation.numbers)).toEqual([[1, 2], [1], [1]]);
    expect(index.bibliographies[0]?.entries).toEqual([
      { key: "a", number: 1 },
      { key: "b", number: 2 },
    ]);
  });

  it("supports the documented Pandoc subset", () => {
    const index = createCitationDocumentIndex("See [@alpha; @beta] and [@alpha].", pandoc);
    expect(index.citations.map((citation) => citation.keys)).toEqual([
      ["alpha", "beta"],
      ["alpha"],
    ]);
  });

  it("does not parse frontmatter, code fences, inline code, or math", () => {
    const text = `---
sample: \\cite{frontmatter}
---
\`\\cite{inline}\`
\`\`\`tex
\\cite{fenced}
\`\`\`
$\\cite{math}$
Visible \\cite{kept}
`;
    const index = createCitationDocumentIndex(text, latex);
    expect(index.citations.map((citation) => citation.keys)).toEqual([["kept"]]);
  });
});

describe("collectProtectedRanges", () => {
  it("merges overlapping protected ranges", () => {
    const text = "`$x$` and visible";
    const ranges = collectProtectedRanges(text);
    expect(ranges).toHaveLength(1);
    expect(isProtectedOffset(text.indexOf("x"), ranges)).toBe(true);
  });

  it("protects an unfinished fenced code block while editing", () => {
    const text = "Before\n```tex\n\\cite{example}";
    const index = createCitationDocumentIndex(text, latex);
    expect(index.citations).toEqual([]);
  });
});
