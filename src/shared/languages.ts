/**
 * Language detection by extension and filename.
 * Returns a language ID string compatible with Shiki, or null if unknown.
 */

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  "": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".rb": "ruby",
  ".sql": "sql",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".md": "markdown",
  ".mdx": "mdx",
  ".rst": "restructuredtext",
  ".json": "json",
  ".jsonc": "jsonc",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".ini": "ini",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".fish": "fish",
  ".ps1": "powershell",
  ".vue": "vue",
  ".svelte": "svelte",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".swift": "swift",
  ".scala": "scala",
  ".prisma": "prisma",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".proto": "protobuf",
  ".xml": "xml",
  ".txt": "plaintext",
};

const FILENAME_TO_LANGUAGE: Record<string, string> = {
  Dockerfile: "dockerfile",
  "Dockerfile.dev": "dockerfile",
  "Dockerfile.prod": "dockerfile",
  Makefile: "makefile",
  ".gitignore": "gitignore",
  ".dockerignore": "gitignore",
  ".env.example": "dotenv",
  ".env.sample": "dotenv",
  ".env.template": "dotenv",
  ".editorconfig": "editorconfig",
  Procfile: "plaintext",
  ".eslintrc": "json",
  ".prettierrc": "json",
  "go.mod": "go",
  "go.sum": "go",
  LICENSE: "plaintext",
  README: "markdown",
};

/**
 * Detects the language of a file by its path.
 * Returns a Shiki-compatible language ID or null.
 */
export function detectLanguage(path: string): string | null {
  const name = path.split("/").pop() ?? path;

  // Check exact filename first
  const byFilename = FILENAME_TO_LANGUAGE[name];
  if (byFilename !== undefined) return byFilename;

  // Check for README.* and Dockerfile.* prefix patterns
  if (/^README(\..+)?$/i.test(name)) return "markdown";
  if (/^Dockerfile(\..+)?$/.test(name)) return "dockerfile";
  if (/^docker-compose.*\.ya?ml$/.test(name)) return "yaml";
  if (/^tsconfig.*\.json$/.test(name)) return "json";
  if (/^eslint\.config\..+$/.test(name)) return "javascript";

  // Check by extension
  const lastDot = name.lastIndexOf(".");
  if (lastDot > 0) {
    const ext = name.slice(lastDot).toLowerCase();
    const byExt = EXTENSION_TO_LANGUAGE[ext];
    if (byExt !== undefined) return byExt;
  }

  return null;
}
