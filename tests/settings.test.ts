import { describe, expect, it } from "vitest";
import { normalizeReferenceFolder, sanitizeSettings } from "../src/settings";

describe("settings", () => {
  it("normalizes user-provided reference paths", () => {
    expect(normalizeReferenceFolder(" /References\\Papers/ ")).toBe("References/Papers");
  });

  it("preserves valid stored settings", () => {
    expect(sanitizeSettings({
      citationSyntax: "pandoc",
      referenceFolder: "References",
      bibliographyStyle: "ieeetr",
    })).toEqual({
      citationSyntax: "pandoc",
      referenceFolder: "References",
      bibliographyStyle: "ieeetr",
    });
  });

  it.each([
    ["jplain", "plain"],
    ["jabbrv", "abbrv"],
    ["junsrt", "unsrt"],
  ] as const)("normalizes the Japanese %s alias", (stored, expected) => {
    expect(sanitizeSettings({ bibliographyStyle: stored }).bibliographyStyle).toBe(expected);
  });

  it("repairs invalid stored settings", () => {
    expect(sanitizeSettings({
      citationSyntax: "unknown",
      referenceFolder: 42,
      bibliographyStyle: "csl",
    })).toEqual({
      citationSyntax: "latex",
      referenceFolder: "",
      bibliographyStyle: "plain",
    });
  });
});
