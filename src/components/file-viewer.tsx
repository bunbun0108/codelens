"use client";

import * as React from "react";
import {
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  FileCode,
  RotateCcw,
  FileText,
} from "lucide-react";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import { getLanguageFromPath } from "../lib/language-map";
import {
  parseLineHash,
  clampLineRange,
  formatLineHash,
  type LineRange,
} from "../lib/hash-range";
import {
  highlightCode,
  HIGHLIGHT_MAX_LINES,
  HIGHLIGHT_MAX_BYTES,
} from "../lib/highlighter";
import { getCachedFile, setCachedFile } from "../lib/file-cache";
import type { FileContent } from "../shared/schemas/index";
import type { ThemedToken } from "shiki";

// ── LineRow Component ────────────────────────────────────────────────────────

interface LineRowProps {
  lineNum: number;
  tokens: ThemedToken[] | undefined;
  text: string;
  isHighlighted: boolean;
  onLineClick: (lineNum: number, event: React.MouseEvent) => void;
}

export const LineRow = React.memo(function LineRow({
  lineNum,
  tokens,
  text,
  isHighlighted,
  onLineClick,
}: LineRowProps) {
  return (
    <div
      id={`L${lineNum}`}
      className={cn(
        "flex leading-6 font-mono text-xs transition-colors hover:bg-surface/50",
        isHighlighted && "bg-line/25 border-l-2 border-accent"
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => onLineClick(lineNum, e)}
        className="w-12 pr-4 text-right select-none opacity-40 hover:opacity-100 hover:text-accent cursor-pointer shrink-0 font-mono text-xs focus:outline-none"
        aria-hidden="true"
      >
        {lineNum}
      </button>
      <div className="flex-1 whitespace-pre pl-2 overflow-visible">
        {tokens ? (
          tokens.map((token, idx) => (
            <span key={idx} style={{ color: token.color }}>
              {token.content}
            </span>
          ))
        ) : (
          <span>{text}</span>
        )}
      </div>
    </div>
  );
});

// ── Hash Store Subscription ──────────────────────────────────────────────────

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getHashSnapshot() {
  return typeof window !== "undefined" ? window.location.hash : "";
}

function getHashServerSnapshot() {
  return "";
}

// ── FileViewer Component ─────────────────────────────────────────────────────

interface FileViewerProps {
  snapshotId: string;
  selectedPath: string | null;
  /** Called when Escape is pressed inside the viewer — returns focus to the tree */
  onFocusTree?: () => void;
}

type ViewerState =
  | { status: "loading" }
  | { status: "loaded"; data: FileContent }
  | {
      status: "error";
      code: string;
      message: string;
      retryable: boolean;
    };

export function FileViewer({ snapshotId, selectedPath, onFocusTree }: FileViewerProps) {
  const [state, setState] = React.useState<ViewerState>(() => {
    if (selectedPath) {
      const cached = getCachedFile(snapshotId, selectedPath);
      if (cached) return { status: "loaded", data: cached };
    }
    return { status: "loading" };
  });

  const [copyStatus, setCopyStatus] = React.useState<"idle" | "copied" | "failed">("idle");
  const [tokensByLine, setTokensByLine] = React.useState<ThemedToken[][] | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);
  const prevPathRef = React.useRef<string | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const isInitialMountRef = React.useRef(true);

  // Normalize content into lines
  const lines = React.useMemo(() => {
    if (state.status !== "loaded" || !selectedPath) return [];
    const normalized = state.data.content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    return normalized.endsWith("\n")
      ? normalized.slice(0, -1).split("\n")
      : normalized.split("\n");
  }, [state, selectedPath]);

  // Subscribe to URL hash changes
  const currentHash = React.useSyncExternalStore(
    subscribeToHash,
    getHashSnapshot,
    getHashServerSnapshot
  );

  // Track whether hash change came from user click to avoid auto-scrolling on click
  const userClickedLineRef = React.useRef(false);
  const lastScrolledKeyRef = React.useRef<string | null>(null);

  // Derived active line range
  const activeRange = React.useMemo(() => {
    if (lines.length === 0) return null;
    const parsed = parseLineHash(currentHash);
    return clampLineRange(parsed, lines.length);
  }, [currentHash, lines.length]);

  // Scroll to active line range:
  // - Only when state is "loaded" and DOM nodes are rendered
  // - Once per file load or external hash change (back/forward navigation)
  // - Not on internal hash changes triggered by user line clicks
  React.useEffect(() => {
    if (state.status !== "loaded" || !selectedPath || !activeRange) {
      return;
    }

    if (userClickedLineRef.current) {
      userClickedLineRef.current = false;
      return;
    }

    const scrollKey = `${selectedPath}:${activeRange.start}`;
    if (lastScrolledKeyRef.current === scrollKey) {
      return;
    }

    let rafId: number | null = null;
    rafId = requestAnimationFrame(() => {
      const target = document.getElementById(`L${activeRange.start}`);
      if (target) {
        lastScrolledKeyRef.current = scrollKey;
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [state.status, selectedPath, activeRange]);

  // Reset lastScrolledKeyRef when selectedPath changes
  React.useEffect(() => {
    lastScrolledKeyRef.current = null;
  }, [selectedPath]);

  // Fetch file content with caching and race condition protection
  const fetchFile = React.useCallback(
    async (path: string) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Check LRU cache
      const cached = getCachedFile(snapshotId, path);
      if (cached) {
        setState({ status: "loaded", data: cached });
        return;
      }

      setState({ status: "loading" });

      try {
        const res = await fetch(
          `/api/snapshots/${encodeURIComponent(snapshotId)}/file?path=${encodeURIComponent(path)}`,
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return;

        const json = await res.json();
        if (controller.signal.aborted) return;

        if (!res.ok) {
          const err = json?.error ?? {};
          setState({
            status: "error",
            code: err.code || "UNKNOWN",
            message: err.message || "Failed to load file.",
            retryable: Boolean(err.retryable),
          });
          return;
        }

        // Cache successful response only
        setCachedFile(snapshotId, path, json as FileContent);
        setState({ status: "loaded", data: json as FileContent });
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          code: "NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Network error occurred.",
          retryable: true,
        });
      }
    },
    [snapshotId]
  );

  // Selection change effect
  React.useEffect(() => {
    if (!selectedPath) {
      abortControllerRef.current?.abort();
      prevPathRef.current = null;
      return;
    }

    // Clear hash if navigating to a different file (unless initial mount)
    if (!isInitialMountRef.current && typeof window !== "undefined") {
      if (prevPathRef.current && prevPathRef.current !== selectedPath && window.location.hash) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
      }
    }
    isInitialMountRef.current = false;
    prevPathRef.current = selectedPath;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFile(selectedPath);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [selectedPath, fetchFile]);

  // Cleanup abort controller on unmount
  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Determine if syntax highlighting should be skipped
  const highlightSkipped = React.useMemo(() => {
    if (state.status !== "loaded") return false;
    const lang = getLanguageFromPath(state.data.path);
    if (!lang) return false;
    return (
      lines.length > HIGHLIGHT_MAX_LINES ||
      state.data.content.length > HIGHLIGHT_MAX_BYTES
    );
  }, [state, lines.length]);

  // Syntax highlighting effect (runs when file content changes)
  React.useEffect(() => {
    if (state.status !== "loaded") {
      return;
    }

    const content = state.data.content;
    const path = state.data.path;
    const lang = getLanguageFromPath(path);

    if (!lang || highlightSkipped) {
      return;
    }

    let cancelled = false;

    highlightCode(content, lang).then((tokens) => {
      if (!cancelled && tokens) {
        setTokensByLine(tokens);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [state, highlightSkipped]);

  // Handle clicking line numbers
  const handleLineClick = React.useCallback(
    (lineNum: number, event: React.MouseEvent) => {
      if (typeof window === "undefined" || lines.length === 0) return;

      let newRange: LineRange;
      if (event.shiftKey && activeRange) {
        const start = Math.min(activeRange.start, lineNum);
        const end = Math.max(activeRange.start, lineNum);
        newRange = { start, end };
      } else {
        newRange = { start: lineNum, end: lineNum };
      }

      const clamped = clampLineRange(newRange, lines.length);
      if (clamped) {
        userClickedLineRef.current = true;
        window.location.hash = formatLineHash(clamped);
      }
    },
    [activeRange, lines.length]
  );

  // Copy file content handler
  const handleCopy = React.useCallback(async () => {
    if (state.status !== "loaded") return;
    try {
      await navigator.clipboard.writeText(state.data.content);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("failed");
      setTimeout(() => setCopyStatus("idle"), 3000);
    }
  }, [state]);

  // ── Render States ──────────────────────────────────────────────────────────

  // 1. Empty State
  if (!selectedPath) {
    return (
      <div className="flex-1 rounded-md border flex flex-col items-center justify-center p-6 text-center bg-surface border-line">
        <FileCode className="h-10 w-10 mb-3 opacity-40 text-accent" />
        <h3 className="text-sm font-semibold text-accent-2 mb-1">
          No File Selected
        </h3>
        <p className="text-xs text-accent/60 max-w-sm">
          Select a file from the repository tree on the left to inspect its
          contents.
        </p>
      </div>
    );
  }

  // 2. Loading State (Skeleton)
  if (state.status === "loading") {
    return (
      <div className="flex-1 rounded-md border flex flex-col overflow-hidden bg-surface border-line">
        <div className="h-11 border-b border-line px-4 flex items-center justify-between bg-bg/50 animate-pulse">
          <div className="h-4 w-48 bg-line/30 rounded" />
          <div className="h-4 w-24 bg-line/30 rounded" />
        </div>
        <div className="flex-1 p-4 space-y-2.5 overflow-hidden animate-pulse">
          <div className="h-3.5 w-3/4 bg-line/20 rounded" />
          <div className="h-3.5 w-1/2 bg-line/20 rounded" />
          <div className="h-3.5 w-5/6 bg-line/20 rounded" />
          <div className="h-3.5 w-2/3 bg-line/20 rounded" />
          <div className="h-3.5 w-4/5 bg-line/20 rounded" />
          <div className="h-3.5 w-1/3 bg-line/20 rounded" />
        </div>
      </div>
    );
  }

  // 3. Error State
  if (state.status === "error") {
    const isRetryable = state.retryable;
    let title = "Failed to load file";
    let desc = state.message;

    if (state.code === "FILE_NOT_TEXT") {
      title = "Binary or Non-UTF-8 File";
      desc =
        "This file appears to be binary or contains non-UTF-8 sequences and cannot be displayed as text.";
    } else if (state.code === "FILE_TOO_LARGE") {
      title = "File Exceeds Size Cap";
      desc =
        "This file exceeds the maximum displayable size limit (256 KB) and cannot be loaded.";
    } else if (state.code === "FILE_NOT_FOUND") {
      title = "File Not Found";
      desc = "The requested file does not exist in this snapshot manifest.";
    }

    return (
      <div className="flex-1 rounded-md border flex flex-col items-center justify-center p-6 text-center bg-surface border-line">
        <AlertCircle className="h-10 w-10 mb-3 text-destructive" />
        <h3 className="text-sm font-semibold text-accent mb-1">{title}</h3>
        <p className="text-xs text-accent/70 max-w-md mb-4">{desc}</p>
        {isRetryable && selectedPath && (
          <button
            type="button"
            onClick={() => fetchFile(selectedPath)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-line bg-bg text-accent hover:bg-line/20 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-line"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // 4. Loaded State
  const fileData = state.data;
  const pathSegments = fileData.path.split("/");
  const sizeKb = (fileData.size / 1024).toFixed(1);

  return (
    <div className="flex-1 rounded-md border flex flex-col overflow-hidden bg-surface border-line">
      {/* Header Bar */}
      <div className="h-11 shrink-0 border-b border-line px-4 flex items-center justify-between bg-bg/60 text-xs">
        {/* Breadcrumb path */}
        <div className="flex items-center gap-1.5 font-mono overflow-hidden text-ellipsis whitespace-nowrap mr-3">
          <FileText className="h-3.5 w-3.5 text-accent shrink-0 mr-1" />
          {pathSegments.map((segment, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="text-line">/</span>}
              <span
                className={cn(
                  idx === pathSegments.length - 1
                    ? "text-accent-2 font-medium"
                    : "text-accent/70"
                )}
              >
                {segment}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Metadata info and Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {highlightSkipped && (
            <span
              className="text-[11px] text-accent/50 inline-block"
              title="Syntax highlighting disabled for large file"
            >
              Highlighting skipped
            </span>
          )}

          {fileData.language && (
            <Badge
              variant="outline"
              className="border-line text-accent text-[11px] px-1.5 py-0"
            >
              {fileData.language}
            </Badge>
          )}

          <span className="text-accent/60 text-[11px] font-mono">
            {lines.length} lines
          </span>

          <span className="text-accent/60 text-[11px] font-mono">
            {sizeKb} KB
          </span>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-line bg-surface text-accent hover:bg-line/20 hover:text-accent-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-line ml-1"
            title="Copy file contents"
          >
            {copyStatus === "copied" ? (
              <>
                <Check className="h-3 w-3 text-accent-2" />
                <span className="text-[11px] text-accent-2">Copied!</span>
              </>
            ) : copyStatus === "failed" ? (
              <>
                <AlertTriangle className="h-3 w-3 text-destructive" />
                <span className="text-[11px] text-destructive">Copy failed</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Canvas Scroll Area */}
      <div
        ref={scrollContainerRef}
        tabIndex={0}
        role="region"
        aria-label={`File content: ${fileData.path}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onFocusTree?.();
          }
        }}
        className="flex-1 overflow-x-auto overflow-y-auto focus:outline-none focus-visible:ring-1 focus-visible:ring-line py-3 code-viewer [tab-size:2]"
        style={{ tabSize: 2 }}
      >
        <div className="min-w-full inline-block">
          {lines.map((lineText, idx) => {
            const lineNum = idx + 1;
            const isHighlighted = Boolean(
              activeRange &&
                lineNum >= activeRange.start &&
                lineNum <= activeRange.end
            );

            return (
              <LineRow
                key={lineNum}
                lineNum={lineNum}
                tokens={tokensByLine ? tokensByLine[idx] : undefined}
                text={lineText}
                isHighlighted={isHighlighted}
                onLineClick={handleLineClick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
