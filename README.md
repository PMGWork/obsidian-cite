# Cite

[日本語](README_ja.md) | [简体中文](README_zh.md)

Cite renders LaTeX- or Pandoc-style citations in Obsidian and links them to reference notes containing BibTeX. It works in Live Preview and Reading view, provides citation-key completion, and can render a lightweight bibliography.

> Cite 0.1.0 requires Obsidian 1.12.7 or later. Desktop, iOS, and Android are supported.

## Features

- Render `\cite{key}` or `[@key]` as numbered internal links.
- Complete citation keys by key or title while typing.
- Generate a bibliography at `\bibliography`.
- Resolve one or more BibTeX entries from each reference note.
- Reindex automatically when reference notes are created, edited, moved, or deleted.
- Keep code, frontmatter, and math examples unchanged.

## Setup

1. Open **Settings → Cite** and choose a **Reference folder**. Cite does not scan the whole vault when this setting is empty.
2. Add a fenced `bibtex` block to a Markdown note in that folder:

   ```bibtex
   @article{doe2026,
     author  = {Doe, Jane and Yamada, Taro},
     title   = {An Example Paper},
     journal = {Journal of Examples},
     year    = {2026},
     volume  = {4},
     number  = {2},
     pages   = {10--20}
   }
   ```

3. Type a citation in another note:

   ```text
   Prior work discusses this problem \cite{doe2026}.
   ```

4. Add `\bibliography` on its own paragraph where the bibliography should appear.

Choose **Pandoc** in settings to use `[@doe2026]` and `[@doe2026; @smith2025]`. Locators, prefixes, suffixes, and suppressed-author Pandoc citations are not supported in this release.

## BibTeX support

Cite supports common `article`, `book`, `inproceedings`/`conference`, `incollection`, `inbook`, `proceedings`, `misc`, and fallback entry types. Braced and quoted values may span lines and contain nested braces. Multiple entries can be placed in one block.

The parser intentionally does not evaluate BibTeX string macros, `#` concatenation, `crossref` inheritance, or LaTeX text-formatting commands. Unsupported constructs remain local to the reference note and never trigger network access.

Bibliography presets are lightweight, readable approximations. **Plain**, **Abbreviated**, **Unsorted**, **Alphabetic label**, **IEEE-like**, and **ACM-like** are not full BibTeX or CSL implementations and should not be used when publication-exact formatting is required. Duplicate citation keys are resolved deterministically: the entry in the alphabetically first note path wins, and duplicates are shown in settings.

## Installation

### Community plugins

After Cite is accepted into the Obsidian Community directory, search for **Cite** under **Settings → Community plugins**.

### BRAT or manual beta

For beta testing, add `PMGWork/obsidian-cite` in BRAT. For a manual installation, download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub release and place them in `.obsidian/plugins/cite/`.

## Privacy and security

Cite works entirely inside the vault. It does not make network requests, collect telemetry, show ads, require an account, or access files outside the configured reference folder except for rendering citations in the note currently being viewed.

## Development

```sh
npm ci
npm run dev
```

Run the complete release check with `npm run check`. Production `main.js` is generated locally and attached to GitHub Releases; it is intentionally not committed.

## License

[MIT](LICENSE)
