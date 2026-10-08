// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatDate, formatNumber, getLanguagePreference, getLocale,
  LANGUAGES, LANGUAGE_STORAGE_KEY, languageReady, resolveLocale,
  setLanguagePreference, t, useLocale,
} from "./index";
import { searchSettings, settingsSectionLabel } from "../../features/settings/model/settings";
import { LanguageSettings } from "../../features/settings/ui/LanguageSettings";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(async () => { await setLanguagePreference("en"); localStorage.clear(); });
describe("application language", () => {
  it("resolves regional and unsupported system languages", () => {
    expect(resolveLocale(["tr-TR", "en-US"])).toBe("tr");
    expect(resolveLocale(["pt-BR"])).toBe("pt");
    expect(resolveLocale(["zh-Hans-CN"])).toBe("zh-CN");
    expect(resolveLocale(["ko-KR", "ja-JP"])).toBe("ja");
    expect(resolveLocale(["xx"])).toBe("en");
  });
  it("loads every bundled catalog and persists the selected language", async () => {
    await languageReady;
    for (const language of LANGUAGES) {
      await setLanguagePreference(language.value);
      expect(getLocale()).toBe(language.value);
      expect(document.documentElement.lang).toBe(language.value);
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(language.value);
      expect(t("General").length).toBeGreaterThan(0);
    }
    await setLanguagePreference("tr");
    expect(t("Settings")).toBe("Ayarlar");
    expect(settingsSectionLabel("general")).toBe("Genel");
    expect(searchSettings("dil")[0]?.settingId).toBe("interface-language");
  });
  it("preserves values, braces and unknown provider text", async () => {
    await setLanguagePreference("tr");
    const value = "C:\\work\\{p1} <script> literal";
    expect(t("Ask · {p0}", { p0: value })).toContain(value);
    expect(t("An unknown provider message")).toBe("An unknown provider message");
    expect(t("Ask · {p0}")).toContain("{p0}");
    expect(formatNumber(1234.5)).toBe(new Intl.NumberFormat("tr").format(1234.5));
    expect(formatDate(new Date(2026, 9, 8), {month: "long"})).toBe("Ekim");
  });
  it("updates another window's language preference", async () => {
    await setLanguagePreference("en");
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "tr");
    window.dispatchEvent(new StorageEvent("storage", {key: LANGUAGE_STORAGE_KEY, newValue: "tr"}));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getLanguagePreference()).toBe("tr");
    expect(getLocale()).toBe("tr");
  });
  it("changes labels without remounting an edited input", async () => {
    await setLanguagePreference("en");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let mounted = 0;
    function Draft() {
      useLocale();
      const [draft] = useState(() => { mounted++; return "My unsent draft"; });
      return createElement("div", null, createElement("input", {defaultValue: draft}), createElement("button", null, t("Cancel")), createElement(LanguageSettings));
    }
    try {
      await act(async () => root.render(createElement(Draft)));
      const input = container.querySelector("input")!;
      input.value = "Türkçe taslak {p0}";
      await act(async () => { await setLanguagePreference("tr"); });
      expect(container.querySelector("input")).toBe(input);
      expect(input.value).toBe("Türkçe taslak {p0}");
      expect(container.textContent).toContain("İptal");
      expect(container.querySelector('[data-setting-id="interface-language"]')).not.toBeNull();
      expect(mounted).toBe(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
