# Manual release checklist

Run this checklist against the production build before publishing a release.

## Platforms

- [ ] Obsidian 1.12.7 or later on desktop.
- [ ] Obsidian 1.12.7 or later on iOS.
- [ ] Obsidian 1.12.7 or later on Android.

## Editing and rendering

- [ ] LaTeX citations render and link correctly in Live Preview and Reading view.
- [ ] Pandoc citations render and link correctly in Live Preview and Reading view.
- [ ] Source mode retains the literal source and offers citation-key completion.
- [ ] Multiple citations retain their numbering before a bibliography and reset after it.
- [ ] Hover previews and modifier-click navigation work on desktop.
- [ ] Citation links work in a desktop pop-out window.
- [ ] Inline code, fenced code, frontmatter, inline math, and display math remain unchanged.

## Index lifecycle

- [ ] An empty reference-folder setting performs no vault-wide reads.
- [ ] Creating, modifying, moving, and deleting a reference note refreshes open citations.
- [ ] Changing the reference folder repeatedly settles on the final folder.
- [ ] Duplicate keys and malformed BibTeX are reported in settings without breaking valid entries.
- [ ] Settings persist across plugin disable/enable and application restart.

## Distribution

- [ ] `npm ci` and `npm run check` succeed from a fresh clone.
- [ ] BRAT installs the release using the `cite` plugin folder.
- [ ] The release contains `main.js`, `manifest.json`, and `styles.css`.
- [ ] A fresh install and an update from the previous beta both load without console errors.
