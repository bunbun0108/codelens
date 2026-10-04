import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";

export function Viewer({ snapshotId, filePath }: { snapshotId: string; filePath: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadFile = async () => {
      try {
        setLoading(true);
        setError(null);
        setHtml(null);

        const res = await fetch(`/api/snapshots/${snapshotId}/file?path=${encodeURIComponent(filePath)}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`File fetch failed: ${res.status} ${text}`);
        }
        
        const code = await res.text();
        if (!active) return;
        setContent(code);
        
        // Render with shiki
        const out = await codeToHtml(code, {
          lang: getLangFromPath(filePath),
          theme: "dark-plus",
        });
        
        if (!active) return;
        setHtml(out);
      } catch (err: any) {
        if (active) {
          setError(err.message || "Failed to load file");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadFile();

    return () => { active = false; };
  }, [snapshotId, filePath]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <span className="text-accent-2 animate-pulse">Loading {filePath}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-bg">
        <div className="text-accent-2 p-6 border border-line">
          <div className="font-bold mb-2">Error loading {filePath}</div>
          <pre className="whitespace-pre-wrap">{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-bg p-4 code-viewer text-sm">
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="text-accent">{content}</pre>
      )}
    </div>
  );
}

function getLangFromPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js": case "jsx": return "javascript";
    case "ts": case "tsx": return "typescript";
    case "json": return "json";
    case "html": return "html";
    case "css": return "css";
    case "md": return "markdown";
    case "py": return "python";
    case "go": return "go";
    case "rs": return "rust";
    case "sh": return "bash";
    case "yml": case "yaml": return "yaml";
    case "toml": return "toml";
    default: return "text";
  }
}
