import type { BundledLanguage, ThemedToken } from "shiki";

export const HIGHLIGHT_MAX_LINES = 1500;
export const HIGHLIGHT_MAX_BYTES = 100 * 1024; // 100 KB

interface HighlighterInstance {
  codeToTokens: (
    code: string,
    options: {
      lang: BundledLanguage;
      themes: { dark: string; light: string };
    }
  ) => { tokens: ThemedToken[][] };
  loadLanguage: (lang: BundledLanguage) => Promise<void>;
  getLoadedLanguages: () => string[];
}

let highlighterInstance: HighlighterInstance | null = null;
let highlighterInitPromise: Promise<HighlighterInstance | null> | null = null;

const loadedLanguages = new Set<string>();
const loadingLanguages = new Map<string, Promise<boolean>>();

/**
 * Lazily loads Shiki singleton instance with dual themes (github-dark and github-light).
 * If dynamic import or initialization fails, resets the singleton so future attempts can retry.
 */
export async function getHighlighter(): Promise<HighlighterInstance | null> {
  if (highlighterInstance) return highlighterInstance;

  if (!highlighterInitPromise) {
    highlighterInitPromise = (async () => {
      try {
        const { createHighlighter } = await import("shiki");
        const instance = await createHighlighter({
          themes: ["github-dark", "github-light"],
          langs: [],
        });
        highlighterInstance = instance as unknown as HighlighterInstance;
        return highlighterInstance;
      } catch {
        // Reset on failure so later attempts can retry
        highlighterInitPromise = null;
        highlighterInstance = null;
        return null;
      }
    })();
  }

  return highlighterInitPromise;
}

/**
 * Ensures the specified language is loaded into Shiki.
 * Caches loadLanguage promises per language to prevent concurrent duplicate loads.
 * Resets cache on failure so future attempts can retry.
 */
export async function ensureLanguageLoaded(lang: BundledLanguage): Promise<boolean> {
  if (loadedLanguages.has(lang)) return true;

  const existingPromise = loadingLanguages.get(lang);
  if (existingPromise) {
    return existingPromise;
  }

  const loadPromise = (async (): Promise<boolean> => {
    try {
      const highlighter = await getHighlighter();
      if (!highlighter) return false;

      if (!highlighter.getLoadedLanguages().includes(lang)) {
        await highlighter.loadLanguage(lang);
      }
      loadedLanguages.add(lang);
      return true;
    } catch {
      // Remove from pending map so later attempts can retry
      loadingLanguages.delete(lang);
      return false;
    }
  })();

  loadingLanguages.set(lang, loadPromise);
  return loadPromise;
}

/**
 * Tokenizes code into an array of token lines with dual-theme CSS variables.
 * Returns null if language is not supported, file exceeds caps, or highlighting fails.
 */
export async function highlightCode(
  code: string,
  lang: BundledLanguage | null
): Promise<ThemedToken[][] | null> {
  if (!lang) return null;

  // Check line/byte thresholds
  if (code.length > HIGHLIGHT_MAX_BYTES) return null;

  try {
    const isLoaded = await ensureLanguageLoaded(lang);
    if (!isLoaded) return null;

    const highlighter = await getHighlighter();
    if (!highlighter) return null;

    const result = highlighter.codeToTokens(code, {
      lang,
      themes: {
        dark: "github-dark",
        light: "github-light",
      },
    });

    return result.tokens;
  } catch {
    return null;
  }
}
