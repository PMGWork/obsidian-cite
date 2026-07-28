import { describe, expect, it } from "vitest";
import {
  formatBibliographyPublication,
  getBibliographyLabel,
  parseAuthorList,
  parseBibtexEntries,
  renderBibliographyStyle,
  stringifyAuthors,
} from "../src/bibtex";

describe("parseBibtexEntries", () => {
  it("parses nested braces, quoted values, multiline fields, and multiple entries", () => {
    const result = parseBibtexEntries(`
\`\`\`bibtex
@article{doe2025,
  author = {Doe, Jane and {Research Team}},
  title = {A {Deeply {Nested}} Title},
  journal = "Journal of Tests",
  year = 2025,
  pages = {10--20}
}

@inproceedings{yamada2024,
  author = {山田, 太郎 and Smith, Alice},
  title = "A multiline
    title",
  booktitle = {Proceedings of Testing},
  year = {2024}
}
\`\`\`
`);

    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      key: "doe2025",
      type: "article",
      fields: {
        title: "A Deeply Nested Title",
        journal: "Journal of Tests",
        year: "2025",
        pages: "10--20",
      },
    });
    expect(result.entries[1]?.fields.title).toBe("A multiline title");
  });

  it("reports malformed entries without discarding valid entries in another block", () => {
    const result = parseBibtexEntries(`
\`\`\`bibtex
@article{broken, title = {Never closes}
\`\`\`
\`\`\`bibtex
@book{valid, title = {Valid}, year = {2026}}
\`\`\`
`);
    expect(result.errors).toHaveLength(1);
    expect(result.entries.map((entry) => entry.key)).toEqual(["valid"]);
  });

  it("ignores BibTeX string, preamble, and comment directives", () => {
    const result = parseBibtexEntries(`
\`\`\`bibtex
@string{journal = "Example"}
@preamble{"ignored"}
@comment{ignored}
@misc{kept, title = {Kept}}
\`\`\`
`);
    expect(result.entries.map((entry) => entry.key)).toEqual(["kept"]);
  });

  it("accepts percent comments between fields", () => {
    const result = parseBibtexEntries(`
\`\`\`bibtex
@article{commented,
  title = {A title}, % an end-of-line comment
  % a full-line comment
  year = {2026}
}
\`\`\`
`);
    expect(result.errors).toEqual([]);
    expect(result.entries[0]?.fields.year).toBe("2026");
  });
});

describe("author formatting", () => {
  it("supports western, CJK, and corporate authors", () => {
    expect(parseAuthorList("Doe, Jane and 山田, 太郎 and Example Association")).toEqual([
      "Doe, Jane",
      "山田, 太郎",
      "Example Association",
    ]);
    expect(stringifyAuthors("Doe, Jane and 山田, 太郎", false)).toBe("Jane Doe and 山田 太郎");
    expect(stringifyAuthors("Doe, Jane", true)).toBe("J. Doe");
  });
});

describe("bibliography formatting", () => {
  it.each([
    ["article", { journal: "Journal", volume: "2", number: "3", pages: "4--8" }, "Journal, 2(3):4–8, 2025"],
    ["inproceedings", { booktitle: "Conference", pages: "1--2" }, "In Conference, p. 1–2, 2025"],
    ["book", { publisher: "Press", edition: "2nd" }, "Press, 2nd edition, 2025"],
    ["incollection", { booktitle: "Collection", pages: "5--9", publisher: "Press" }, "In Collection, pages 5–9, Press, 2025"],
    ["misc", { howpublished: "Online", url: "https://example.com" }, "Online, https://example.com"],
    ["techreport", { institution: "Lab" }, "2025"],
  ])("formats %s entries", (type, fields, expected) => {
    expect(formatBibliographyPublication(type, fields, "2025")).toBe(expected);
  });

  it.each(["plain", "abbrv", "unsrt", "alpha", "ieeetr", "acm", "siam", "apalike"] as const)(
    "renders the %s preset",
    (style) => {
      const rendered = renderBibliographyStyle(style, {
        number: "1",
        authors: "Jane Doe",
        abbrAuthors: "J. Doe",
        title: "A title",
        publication: "Journal, 2025",
        year: "2025",
      });
      expect(rendered).toContain("A title");
      expect(rendered).not.toContain("  ");
    },
  );

  it("creates BibTeX-compatible alpha and author-year labels", () => {
    expect(getBibliographyLabel("alpha", {
      authors: "Masaki Kashiwara and Toshiyuki Nakashima",
      year: "1994",
    })).toBe("KN94");
    expect(getBibliographyLabel("alpha", {
      authors: "Serge Lang",
      year: "2002",
    })).toBe("Lan02");
    expect(getBibliographyLabel("apalike", {
      authors: "Jane Doe and John Smith",
      year: "2025",
    })).toBe("Doe & Smith, 2025");
  });
});
