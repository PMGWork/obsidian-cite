import { describe, expect, it, vi } from "vitest";

import { App } from "obsidian";
import {
  CiteSettingTab,
  type CitePluginHost,
} from "../src/settings-tab";
import type { CiteSettings } from "../src/settings";

function makeHost() {
  const settings: CiteSettings = {
    citationSyntax: "latex",
    referenceFolder: "References",
    bibliographyStyle: "plain",
  };
  const saveSettings = vi.fn(async () => {});
  const refreshOpenNotes = vi.fn();
  const scheduleReferenceReindex = vi.fn();
  const host = {
    settings,
    resolver: {
      stats: {
        configured: true,
        files: 0,
        entries: 0,
        duplicateKeys: [],
        parseErrors: [],
      },
    },
    saveSettings,
    refreshOpenNotes,
    scheduleReferenceReindex,
  } as unknown as CitePluginHost;
  return {
    host,
    saveSettings,
    refreshOpenNotes,
    scheduleReferenceReindex,
  };
}

describe("CiteSettingTab", () => {
  it("provides searchable declarative controls for every saved setting", () => {
    const { host } = makeHost();
    const tab = new CiteSettingTab(new App(), host);

    const definitions = tab.getSettingDefinitions();

    expect(definitions.map((definition) =>
      "name" in definition ? definition.name : undefined)).toEqual([
      "Citation syntax",
      "Reference folder",
      "Bibliography style",
      "Reference index",
    ]);
    expect(definitions.slice(0, 3).map((definition) =>
      "control" in definition ? definition.control?.key : undefined)).toEqual([
      "citationSyntax",
      "referenceFolder",
      "bibliographyStyle",
    ]);
  });

  it("persists setting changes and triggers the matching refresh behavior", async () => {
    const {
      host,
      saveSettings,
      refreshOpenNotes,
      scheduleReferenceReindex,
    } = makeHost();
    const tab = new CiteSettingTab(new App(), host);

    await tab.setControlValue("citationSyntax", "pandoc");
    await tab.setControlValue("bibliographyStyle", "acm");
    await tab.setControlValue("referenceFolder", " /Papers//Library/ ");

    expect(host.settings).toEqual({
      citationSyntax: "pandoc",
      referenceFolder: "Papers/Library",
      bibliographyStyle: "acm",
    });
    expect(saveSettings).toHaveBeenCalledTimes(3);
    expect(refreshOpenNotes).toHaveBeenCalledTimes(2);
    expect(scheduleReferenceReindex).toHaveBeenCalledWith(350);
  });

  it("uses update when available and display as the legacy fallback", () => {
    const { host } = makeHost();
    const tab = new CiteSettingTab(new App(), host);
    const update = vi.fn();
    const display = vi.fn();
    (tab as unknown as { update?: () => void }).update = update;
    tab.display = display;

    tab.refresh();
    expect(update).toHaveBeenCalledOnce();
    expect(display).not.toHaveBeenCalled();

    (tab as unknown as { update?: () => void }).update = undefined;
    tab.refresh();
    expect(display).toHaveBeenCalledOnce();
  });
});
