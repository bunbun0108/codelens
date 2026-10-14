import { describe, it, expect } from "vitest";

/**
 * Pure functions modeling the theme resolution and toggle logic
 * used in layout.tsx and explorer-client.tsx.
 */
export const THEME_STORAGE_KEY = "codelens-theme";

export function resolveInitialTheme(
  storedTheme: string | null,
  systemPrefersDark: boolean
): "dark" | "light" {
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }
  return systemPrefersDark ? "dark" : "light";
}

export function getNextTheme(currentIsDark: boolean): "dark" | "light" {
  return currentIsDark ? "light" : "dark";
}

describe("Theme resolution & toggle unit tests", () => {
  describe("resolveInitialTheme (system preference vs stored override)", () => {
    it("follows system preference (dark) when no stored preference exists", () => {
      const theme = resolveInitialTheme(null, true);
      expect(theme).toBe("dark");
    });

    it("follows system preference (light) when no stored preference exists", () => {
      const theme = resolveInitialTheme(null, false);
      expect(theme).toBe("light");
    });

    it("respects stored 'dark' preference even if system preference is light", () => {
      const theme = resolveInitialTheme("dark", false);
      expect(theme).toBe("dark");
    });

    it("respects stored 'light' preference even if system preference is dark", () => {
      const theme = resolveInitialTheme("light", true);
      expect(theme).toBe("light");
    });

    it("falls back to system preference if stored value is invalid/corrupt", () => {
      const theme = resolveInitialTheme("invalid_value", true);
      expect(theme).toBe("dark");
    });
  });

  describe("getNextTheme (manual toggle)", () => {
    it("switches from dark to light", () => {
      expect(getNextTheme(true)).toBe("light");
    });

    it("switches from light to dark", () => {
      expect(getNextTheme(false)).toBe("dark");
    });
  });

  describe("THEME_STORAGE_KEY constant", () => {
    it("uses 'codelens-theme' consistently across the app", () => {
      expect(THEME_STORAGE_KEY).toBe("codelens-theme");
    });
  });
});
