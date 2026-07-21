import {
  MarkdownPostProcessorContext,
  MarkdownView,
  Plugin,
  TFile,
} from "obsidian";
import { CitationResolver } from "./src/resolver";
import { buildEditorExtension, processReadingMode } from "./src/rendering";
import { hasCitation } from "./src/citations";
import { CiteSettingTab } from "./src/settings-tab";
import { sanitizeSettings, type CiteSettings } from "./src/settings";

export default class CitePlugin extends Plugin {
  settings!: CiteSettings;
  resolver!: CitationResolver;
  private sourceCache = new Map<string, { mtime: number; text: string }>();
  private reindexTimer: ReturnType<typeof setTimeout> | null = null;
  private settingTab!: CiteSettingTab;

  async onload(): Promise<void> {
    this.settings = sanitizeSettings(await this.loadData());
    this.resolver = new CitationResolver(this.app, () => this.settings);
    this.settingTab = new CiteSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      this.sourceCache.delete(file.path);
      if (this.resolver.isRelevantPath(file.path)) this.scheduleReferenceReindex();
    }));
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile && this.resolver.isRelevantPath(file.path)) {
        this.scheduleReferenceReindex();
      }
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      this.sourceCache.delete(file.path);
      if (this.resolver.isRelevantPath(file.path)) this.scheduleReferenceReindex();
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.sourceCache.delete(oldPath);
      if (file instanceof TFile) this.sourceCache.delete(file.path);
      if (this.resolver.isRelevantPath(oldPath) || this.resolver.isRelevantPath(file.path)) {
        this.scheduleReferenceReindex();
      }
    }));

    this.registerMarkdownPostProcessor(async (element, context) => {
      const renderedText = element.textContent ?? "";
      if (!hasCitation(renderedText, this.settings) && !renderedText.includes("\\bibliography")) return;
      const sourceText = await this.getSourceText(context.sourcePath);
      await this.processReadingMode(element, context, sourceText);
    });
    this.registerEditorExtension(buildEditorExtension(this.resolver, this.app, this.settings));
    this.register(() => {
      if (this.reindexTimer !== null) clearTimeout(this.reindexTimer);
    });

    const initialize = async (): Promise<void> => {
      await this.reindexReferences();
    };
    if (this.app.workspace.layoutReady) await initialize();
    else this.app.workspace.onLayoutReady(() => void initialize());
  }

  onunload(): void {
    this.sourceCache.clear();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  scheduleReferenceReindex(delay = 100): void {
    if (this.reindexTimer !== null) clearTimeout(this.reindexTimer);
    this.reindexTimer = setTimeout(() => {
      this.reindexTimer = null;
      void this.reindexReferences();
    }, delay);
  }

  async reindexReferences(): Promise<void> {
    const applied = await this.resolver.initialize();
    if (!applied) return;
    this.refreshOpenNotes();
    if (this.settingTab.containerEl.isConnected) this.settingTab.display();
  }

  refreshOpenNotes(): void {
    this.app.workspace.updateOptions();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView) leaf.view.previewMode?.rerender(true);
    }
  }

  private async getSourceText(sourcePath: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) return "";
    const cached = this.sourceCache.get(sourcePath);
    if (cached?.mtime === file.stat.mtime) return cached.text;
    const text = await this.app.vault.cachedRead(file);
    this.sourceCache.set(sourcePath, { mtime: file.stat.mtime, text });
    return text;
  }

  private async processReadingMode(
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
    sourceText: string,
  ): Promise<void> {
    await processReadingMode(
      this.app,
      this.resolver,
      this.settings,
      sourceText,
      element,
      context,
    );
  }
}
