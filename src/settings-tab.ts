import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
} from "obsidian";
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

const BIBLIOGRAPHY_STYLE_LABELS: Record<BibliographyStyle, string> = {
  plain: "Plain (lightweight)",
  abbrv: "Abbreviated (lightweight)",
  unsrt: "Unsorted (lightweight)",
  alpha: "Alphabetic label (lightweight)",
  ieeetr: "IEEE-like",
  acm: "ACM-like",
};

type CiteSettingKey = keyof CiteSettings;

function configureIndexStatus(setting: Setting, plugin: CitePluginHost): void {
  const stats = plugin.resolver.stats;
  setting.setName("Reference index");
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
    setting.descEl.createEl("p", {
      cls: "cite-settings-warning",
      text: `Duplicate keys (first path wins): ${stats.duplicateKeys.join(", ")}`,
    });
  }
  if (stats.parseErrors.length > 0) {
    const details = setting.descEl.createEl("details", { cls: "cite-settings-errors" });
    details.createEl("summary", { text: "BibTeX parse errors" });
    const list = details.createEl("ul");
    for (const error of stats.parseErrors) list.createEl("li", { text: error });
  }
}

function addIndexStatus(container: HTMLElement, plugin: CitePluginHost): void {
  configureIndexStatus(new Setting(container), plugin);
}

export class CiteSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CitePluginHost) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<CiteSettingKey>[] {
    return [
      {
        name: "Citation syntax",
        desc: "Inline citation notation to parse and complete",
        control: {
          type: "dropdown",
          key: "citationSyntax",
          options: {
            latex: "\\cite{key}",
            pandoc: "[@key]",
          },
        },
      },
      {
        name: "Reference folder",
        desc: "Folder containing notes with fenced BibTeX blocks. Leave empty to disable indexing.",
        control: {
          type: "text",
          key: "referenceFolder",
          placeholder: "References",
        },
      },
      {
        name: "Bibliography style",
        desc: "Lightweight formatting preset; these are not full BibTeX or CSL implementations",
        control: {
          type: "dropdown",
          key: "bibliographyStyle",
          options: BIBLIOGRAPHY_STYLE_LABELS,
        },
      },
      {
        name: "Reference index",
        desc: "Index status, duplicate keys, and BibTeX parse errors",
        render: (setting) => configureIndexStatus(setting, this.plugin),
      },
    ];
  }

  getControlValue(key: string): unknown {
    if (key === "citationSyntax"
      || key === "referenceFolder"
      || key === "bibliographyStyle") {
      return this.plugin.settings[key];
    }
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "citationSyntax") {
      if (value !== "latex" && value !== "pandoc") return;
      this.plugin.settings.citationSyntax = value;
      await this.plugin.saveSettings();
      this.plugin.refreshOpenNotes();
      return;
    }
    if (key === "referenceFolder") {
      if (typeof value !== "string") return;
      this.plugin.settings.referenceFolder = normalizeReferenceFolder(value);
      await this.plugin.saveSettings();
      this.plugin.scheduleReferenceReindex(350);
      return;
    }
    if (key === "bibliographyStyle") {
      if (typeof value !== "string" || !(value in BIBLIOGRAPHY_STYLE_LABELS)) return;
      this.plugin.settings.bibliographyStyle = value as BibliographyStyle;
      await this.plugin.saveSettings();
      this.plugin.refreshOpenNotes();
    }
  }

  refresh(): void {
    const update = (this as { update?: () => void }).update;
    if (typeof update === "function") update.call(this);
    else this.display();
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

    new Setting(containerEl)
      .setName("Bibliography style")
      .setDesc("Lightweight formatting preset; these are not full BibTeX or CSL implementations")
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(BIBLIOGRAPHY_STYLE_LABELS)) {
          dropdown.addOption(value, label);
        }
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
