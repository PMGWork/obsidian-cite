import type { CompletionSource } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { buildCitationCompletionExtension } from "../src/completion";
import type { CitationResolver } from "../src/resolver";
import type { CiteSettings } from "../src/settings";

const settings: CiteSettings = {
  citationSyntax: "latex",
  referenceFolder: "References",
  bibliographyStyle: "plain",
};

describe("buildCitationCompletionExtension", () => {
  it("adds the Cite source without replacing an existing completion source", () => {
    const existingSource: CompletionSource = () => null;
    const resolver = {
      getAllKeys: () => [],
    } as unknown as CitationResolver;
    const state = EditorState.create({
      doc: "\\cite{",
      extensions: [
        EditorState.languageData.of(() => [{ autocomplete: existingSource }]),
        buildCitationCompletionExtension(resolver, settings),
      ],
    });

    const sources = state.languageDataAt<CompletionSource>("autocomplete", state.doc.length);
    expect(sources).toHaveLength(2);
    expect(sources).toContain(existingSource);
  });
});
