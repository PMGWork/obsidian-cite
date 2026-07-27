import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { createObsidianFragment } from "./dom";
import type { CitationResolver } from "./resolver";
import type { CiteSettings } from "./settings";

export function makeCitationCompletionSource(
  resolver: CitationResolver,
  settings: CiteSettings,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    let partial: string;
    if (settings.citationSyntax === "pandoc") {
      const match = before.match(/\[(?:@[^\]\s;]+;\s*)*@([^\]\s;]*)$/);
      if (!match) return null;
      partial = match[1] ?? "";
    } else {
      const match = before.match(/\\cite\{([^}]*)$/);
      if (!match) return null;
      const inside = match[1] ?? "";
      partial = inside.slice(inside.lastIndexOf(",") + 1).trimStart();
    }

    const query = partial.toLowerCase();
    const options: Completion[] = resolver.getAllKeys()
      .filter(({ key, title }) => !partial
        || key.toLowerCase().includes(query)
        || title.toLowerCase().includes(query))
      .map(({ key, title }) => ({
        label: title,
        apply: key,
        type: "keyword",
        boost: key.toLowerCase().startsWith(query) ? 2 : 1,
      }));
    if (options.length === 0 && !context.explicit) return null;
    return { from: context.pos - partial.length, options, filter: false };
  };
}

export function buildCitationCompletionExtension(
  resolver: CitationResolver,
  settings: CiteSettings,
): Extension {
  const citationSource = makeCitationCompletionSource(resolver, settings);

  return [
    EditorState.languageData.of(() => [{ autocomplete: citationSource }]),
    autocompletion({
      activateOnTyping: true,
      addToOptions: [
        {
          render(completion: Completion, _state, view) {
            if (typeof completion.apply !== "string") return null;
            return createObsidianFragment(view.dom.ownerDocument)
              .createSpan({ cls: "cite-completion-key", text: completion.apply });
          },
          position: 55,
        },
        {
          render(_completion, _state, view) {
            return createObsidianFragment(view.dom.ownerDocument)
              .createEl("hr", { cls: "cite-completion-separator" });
          },
          position: 90,
        },
      ],
    }),
  ];
}
