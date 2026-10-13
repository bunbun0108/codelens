import type { BundledLanguage } from "shiki";

const EXTENSION_MAP: Record<string, BundledLanguage> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  py: "python",
  java: "java",
  go: "go",
  rs: "rust",
  cpp: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  mdx: "mdx",
  json: "json",
  vue: "vue",
  svelte: "svelte",
  kt: "kotlin",
  swift: "swift",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  prisma: "prisma",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  xml: "xml",
};

const FILENAME_MAP: Record<string, BundledLanguage> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
};

/**
 * Returns the BundledLanguage for Shiki highlighting, or null if plain text fallback should be used.
 */
export function getLanguageFromPath(filePath: string): BundledLanguage | null {
  if (!filePath) return null;

  const segments = filePath.split("/");
  const fileName = (segments[segments.length - 1] ?? "").toLowerCase();

  if (FILENAME_MAP[fileName]) {
    return FILENAME_MAP[fileName];
  }

  // Check prefix for Dockerfile.* (e.g. Dockerfile.dev)
  if (fileName.startsWith("dockerfile.")) {
    return "dockerfile";
  }

  const dotIdx = fileName.lastIndexOf(".");
  if (dotIdx === -1 || dotIdx === 0) {
    return null;
  }

  const ext = fileName.slice(dotIdx + 1);
  return EXTENSION_MAP[ext] ?? null;
}
