import { describe, expect, it } from "vitest";

import { getTranslations, resolveLocale } from "../src/i18n";

describe("localization", () => {
  it("selects Japanese and Chinese variants and falls back to English", () => {
    expect(resolveLocale("ja")).toBe("ja");
    expect(resolveLocale("ja-JP")).toBe("ja");
    expect(resolveLocale("zh-cn")).toBe("zh");
    expect(resolveLocale("zh_TW")).toBe("zh");
    expect(resolveLocale("fr")).toBe("en");
  });

  it("provides localized setting labels and dynamic index status", () => {
    const japanese = getTranslations("ja");
    const chinese = getTranslations("zh-CN");

    expect(japanese.referenceFolder).toBe("文献フォルダ");
    expect(japanese.files(3)).toBe("3ファイル");
    expect(chinese.bibliographyStyle).toBe("参考文献样式");
    expect(chinese.parseErrors(2)).toBe("2个解析错误");
  });
});
