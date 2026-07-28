import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
} from "obsidian";
import type { CitationResolver } from "./resolver";
import { getTranslations, type CiteTranslations } from "./i18n";
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

type CiteSettingKey = keyof CiteSettings;

function configureIndexStatus(
  setting: Setting,
  plugin: CitePluginHost,
  t: CiteTranslations,
): void {
  const stats = plugin.resolver.stats;
  setting.setName(t.referenceIndex);
  if (!plugin.settings.referenceFolder) {
    setting.setDesc(t.referenceFolderRequired);
  } else {
    const details = [
      t.files(stats.files),
      t.entries(stats.entries),
      t.duplicateKeys(stats.duplicateKeys.length),
      t.parseErrors(stats.parseErrors.length),
    ].join(" · ");
    setting.setDesc(details);
  }
  setting.addButton((button) => button
    .setButtonText(t.reindex)
    .onClick(async () => {
      button.setDisabled(true);
      await plugin.reindexReferences();
      button.setDisabled(false);
    }));

  if (stats.duplicateKeys.length > 0) {
    setting.descEl.createEl("p", {
      cls: "cite-settings-warning",
      text: t.duplicateKeysWarning(stats.duplicateKeys.join(", ")),
    });
  }
  if (stats.parseErrors.length > 0) {
    const details = setting.descEl.createEl("details", { cls: "cite-settings-errors" });
    details.createEl("summary", { text: t.bibtexParseErrors });
    const list = details.createEl("ul");
    for (const error of stats.parseErrors) list.createEl("li", { text: error });
  }
}

function addIndexStatus(container: HTMLElement, plugin: CitePluginHost): void {
  configureIndexStatus(new Setting(container), plugin, getTranslations());
}

export class CiteSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: CitePluginHost) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<CiteSettingKey>[] {
    const t = getTranslations();
    return [
      {
        name: t.citationSyntax,
        desc: t.citationSyntaxDesc,
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
        name: t.referenceFolder,
        desc: t.referenceFolderDesc,
        control: {
          type: "text",
          key: "referenceFolder",
          placeholder: t.referenceFolderPlaceholder,
        },
      },
      {
        name: t.bibliographyStyle,
        desc: t.bibliographyStyleDesc,
        control: {
          type: "dropdown",
          key: "bibliographyStyle",
          options: t.bibliographyStyles,
        },
      },
      {
        name: t.referenceIndex,
        desc: t.referenceIndexDesc,
        render: (setting) => configureIndexStatus(setting, this.plugin, t),
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
      if (typeof value !== "string" || !(value in getTranslations().bibliographyStyles)) return;
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
    const t = getTranslations();
    containerEl.empty();

    new Setting(containerEl)
      .setName(t.citationSyntax)
      .setDesc(t.citationSyntaxDesc)
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
      .setName(t.referenceFolder)
      .setDesc(t.referenceFolderDesc)
      .addText((text) => text
        .setPlaceholder(t.referenceFolderPlaceholder)
        .setValue(this.plugin.settings.referenceFolder)
        .onChange(async (value) => {
          this.plugin.settings.referenceFolder = normalizeReferenceFolder(value);
          await this.plugin.saveSettings();
          this.plugin.scheduleReferenceReindex(350);
        }));

    new Setting(containerEl)
      .setName(t.bibliographyStyle)
      .setDesc(t.bibliographyStyleDesc)
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(t.bibliographyStyles)) {
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
