import { describe, expect, it } from "vitest";
import { copy, getInitialLocaleForPath } from "../src/App";

const cjkPattern = /[\u3400-\u9fff\uf900-\ufaff]/;

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => {
      if (key === "key" || key === "route") {
        return [];
      }

      return collectStrings(item);
    });
  }

  return [];
}

describe("website i18n boundaries", () => {
  it("keeps the English website copy free of Chinese characters", () => {
    expect(collectStrings(copy.en).filter((value) => cjkPattern.test(value))).toEqual([]);
  });

  it("keeps avoidable English product terms out of the Chinese website copy", () => {
    const avoidableEnglishTerms = [
      "app_pub",
      "API",
      "BYOK",
      "CNAME",
      "CRM",
      "Quickstart",
      "SaaS",
      "URL",
      "feature policy",
      "provider",
      "tokens",
      "wallet credits"
    ];
    const chineseCopy = collectStrings(copy.zh).join("\n");

    for (const term of avoidableEnglishTerms) {
      expect(chineseCopy).not.toContain(term);
    }
  });

  it("keeps Latin text in Chinese copy limited to the brand name and domain", () => {
    const allowedLatinRemoved = collectStrings(copy.zh)
      .join("\n")
      .replaceAll("ModelFaucet", "")
      .replaceAll("modelfaucet.aifund.com", "")
      .replace(/\d+(?:\.\d+)*/g, "");

    expect(allowedLatinRemoved.match(/[A-Za-z]+/g)).toEqual(null);
  });

  it("uses dedicated Chinese website routes", () => {
    expect(getInitialLocaleForPath("/modelfaucet/")).toBe("en");
    expect(getInitialLocaleForPath("/modelfaucet/demo/")).toBe("en");
    expect(getInitialLocaleForPath("/modelfaucet/zh/")).toBe("zh");
    expect(getInitialLocaleForPath("/modelfaucet/zh/demo/")).toBe("zh");
  });
});
