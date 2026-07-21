import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { CitationResolver } from "./resolver";
import {
  normalizeReferenceFolder,
  type BibliographyStyle,
  type CitationSyntax,
  type CiteSettings,
} from "./settings";

export interface CitePluginHost extends Plugin {
  settings: CiteSettings;
  resolver: CitationResolver;
  saveSettings(): Promise<void>;
  refreshOpenNotes(): void;
  scheduleReferenceReindex(delay?: number): void;
  reindexReferences(): Promise<void>;
}

function addIndexStatus(container: HTMLElement, plugin: CitePluginHost): void {
  const stats = plugin.resolver.stats;
  const setting = new Setting(container).setName("Reference index");
  if (!plugin.settings.referenceFolder) {
    setting.setDesc("Choose a reference folder before citations can be resolved. Cite does not scan the entire vault.");
  } else {
    const details = [
      `${stats.files} files`,
      `${stats.entries} entries`,
      `${stats.duplicateKeys.length} duplicate keys`,
      `${stats.parseErrors.length} parse errors`,
    ].join(" · ");
    setting.setDesc(details);
  }
  setting.addButton((button) => button
    .setButtonText("Reindex")
    .onClick(async () => {
      button.setDisabled(true);
      await plugin.reindexReferences();
      button.setDisabled(false);
    }));

  if (stats.duplicateKeys.length > 0) {
    container.createEl("p", {
      cls: "cite-settings-warning",
      text: `Duplicate keys (first path wins): ${stats.duplicateKeys.join(", ")}`,
    });
  }
  if (stats.parseErrors.length > 0) {
    const details = container.createEl("details", { cls: "cite-settings-errors" });
    details.createEl("summary", { text: "BibTeX parse errors" });
    const list = details.createEl("ul");
    for (const error of stats.parseErrors) list.createEl("li", { text: error });
  }
}

export class CiteSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CitePluginHost) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Citation syntax")
      .setDesc("Inline citation notation to parse and complete")
      .addDropdown((dropdown) => dropdown
        .addOption("latex", "\\cite{key}")
        .addOption("pandoc", "[@key]")
        .setValue(this.plugin.settings.citationSyntax)
        .onChange(async (value) => {
          this.plugin.settings.citationSyntax = value as CitationSyntax;
          await this.plugin.saveSettings();
          this.plugin.refreshOpenNotes();
        }));

    new Setting(containerEl)
      .setName("Reference folder")
      .setDesc("Folder containing notes with fenced BibTeX blocks. Leave empty to disable indexing.")
      .addText((text) => text
        .setPlaceholder("References")
        .setValue(this.plugin.settings.referenceFolder)
        .onChange(async (value) => {
          this.plugin.settings.referenceFolder = normalizeReferenceFolder(value);
          await this.plugin.saveSettings();
          this.plugin.scheduleReferenceReindex(350);
        }));

    const labels: Record<BibliographyStyle, string> = {
      plain: "Plain (lightweight)",
      abbrv: "Abbreviated (lightweight)",
      unsrt: "Unsorted (lightweight)",
      alpha: "Alphabetic label (lightweight)",
      ieeetr: "IEEE-like",
      acm: "ACM-like",
    };
    new Setting(containerEl)
      .setName("Bibliography style")
      .setDesc("Lightweight formatting preset; these are not full BibTeX or CSL implementations")
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(labels)) dropdown.addOption(value, label);
        return dropdown
          .setValue(this.plugin.settings.bibliographyStyle)
          .onChange(async (value) => {
            this.plugin.settings.bibliographyStyle = value as BibliographyStyle;
            await this.plugin.saveSettings();
            this.plugin.refreshOpenNotes();
          });
      });

    addIndexStatus(containerEl, this.plugin);
  }
}
