"use client"

import * as React from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import type { Snapshot } from "../../../../shared/schemas/index"
import { Badge } from "../../../../components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../components/ui/popover"
import { GitCommit, AlertCircle, FolderTree, X } from "lucide-react"
import Link from "next/link"
import { TreeView } from "../../../../components/tree-view"
import { buildFileTree } from "../../../../lib/file-tree"
import { FileViewer } from "../../../../components/file-viewer"

export function ExplorerClient({ snapshot, initialFile }: { snapshot: Snapshot; initialFile?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const toggleButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const drawerRef = React.useRef<HTMLDivElement | null>(null);
  const filterInputRef = React.useRef<HTMLInputElement | null>(null);

  // Called when Enter is pressed on a file in the tree — focuses the viewer
  const handleViewerFocus = React.useCallback(() => {
    // Defer to next paint so the viewer scroll container is rendered/updated
    requestAnimationFrame(() => {
      const viewer = document.querySelector<HTMLDivElement>("div[role='region'][aria-label]");
      viewer?.focus();
    });
  }, []);

  // Called when Escape is pressed in the viewer — returns focus to the active tree item
  const handleFocusTree = React.useCallback(() => {
    // Focus the currently selected / focused treeitem
    const activeItem = document.querySelector<HTMLDivElement>("[role='treeitem'][tabindex='0']");
    if (activeItem) {
      activeItem.focus();
    } else {
      // Fallback: focus the filter input
      filterInputRef.current?.focus();
    }
  }, []);

  const selectedFile = searchParams.get("file") || initialFile || null;
  const tree = React.useMemo(() => buildFileTree(snapshot.files), [snapshot.files]);

  const handleSelect = React.useCallback((path: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("file", path);
    router.replace(`${pathname}?${params.toString()}`);
    setMobileDrawerOpen(false);
  }, [router, pathname, searchParams]);

  // Keyboard accessibility: Escape to close drawer
  React.useEffect(() => {
    if (!mobileDrawerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileDrawerOpen]);

  // Focus management: move focus into drawer on open, return to toggle on close
  const prevOpenRef = React.useRef(mobileDrawerOpen);
  React.useEffect(() => {
    if (mobileDrawerOpen && !prevOpenRef.current) {
      // Find first focusable element inside drawer or focus the drawer itself
      const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
        'input, button, [tabindex="0"]'
      );
      firstFocusable?.focus();
    } else if (!mobileDrawerOpen && prevOpenRef.current) {
      toggleButtonRef.current?.focus();
    }
    prevOpenRef.current = mobileDrawerOpen;
  }, [mobileDrawerOpen]);

  const shortSha = snapshot.source.commitSha.substring(0, 7)
  const totalExcluded = Object.values(snapshot.stats.excludedByReason).reduce((a, b) => a + b, 0)
  const commitUrl = `https://github.com/${snapshot.repo.owner}/${snapshot.repo.name}/commit/${snapshot.source.commitSha}`

  return (
    <div 
      className="flex h-screen w-full flex-col overflow-hidden" 
      style={{ 
        backgroundColor: "#241D01", 
        color: "#AFFDF0",
        fontFamily: "'JetBrains Mono', monospace" 
      }}
    >
      {/* Header */}
      <header 
        className="flex h-14 shrink-0 items-center justify-between px-3 sm:px-4 border-b"
        style={{ borderColor: "#3A745D", backgroundColor: "#393A4F" }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile tree drawer toggle button */}
          <button
            ref={toggleButtonRef}
            type="button"
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            aria-label="Toggle repository tree"
            aria-expanded={mobileDrawerOpen}
            className="sm:hidden inline-flex items-center justify-center p-1.5 rounded-md border text-accent hover:opacity-80 focus-visible:outline-none focus-visible:ring-1"
            style={{ borderColor: "#3A745D", backgroundColor: "#241D01", color: "#BEEF8D" }}
            id="mobile-tree-toggle"
          >
            <FolderTree className="h-4 w-4" />
          </button>

          <Link href="/" className="font-bold hover:opacity-80 shrink-0" style={{ color: "#BEEF8D" }}>CodeLens</Link>
          <span style={{ color: "#3A745D" }}>/</span>
          <div className="flex items-center gap-1.5 font-medium min-w-0 truncate">
            <span className="truncate">{snapshot.repo.owner}</span>
            <span style={{ color: "#3A745D" }}>/</span>
            <span className="truncate">{snapshot.repo.name}</span>
          </div>
          
          {snapshot.repo.archived && (
            <Badge variant="secondary" style={{ backgroundColor: "#3A745D", color: "#AFFDF0", border: "none" }}>
              ARCHIVED
            </Badge>
          )}

          <Badge variant="outline" style={{ borderColor: "#3A745D", color: "#AFFDF0" }} className="ml-2 hidden sm:inline-flex">
            {snapshot.source.resolvedRefName}
          </Badge>

          <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity hidden sm:inline-flex">
            <Badge variant="secondary" className="ml-1 text-[10px]" style={{ backgroundColor: "#3A745D", color: "#AFFDF0", border: "none" }}>
              <GitCommit className="mr-1 h-3 w-3 inline" />
              {shortSha}
            </Badge>
          </a>

          {snapshot.source.subpath && (
            <>
              <span style={{ color: "#3A745D" }}>/</span>
              <span className="text-sm hidden sm:inline">{snapshot.source.subpath}</span>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4 text-xs shrink-0">
          <div className="hidden sm:block">{snapshot.stats.filesIncluded} files</div>
          <div className="hidden sm:block">{(snapshot.stats.bytesIncluded / 1024).toFixed(1)} KB</div>
          
          <Popover>
            <PopoverTrigger 
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-2 sm:px-3 text-xs"
              style={{ borderColor: "#3A745D", backgroundColor: "#241D01", color: "#BEEF8D" }}
            >
              <AlertCircle className="mr-1 sm:mr-2 h-3.5 w-3.5" />
              <span>{totalExcluded}</span>
              <span className="hidden sm:inline">&nbsp;excluded</span>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-4 border" style={{ backgroundColor: "#393A4F", borderColor: "#3A745D", color: "#AFFDF0" }}>
              <div className="space-y-2">
                <h4 className="font-medium text-sm border-b pb-2" style={{ borderColor: "#3A745D" }}>Exclusion Reasons</h4>
                <div className="text-xs space-y-1 pt-1">
                  {Object.entries(snapshot.stats.excludedByReason).map(([reason, count]) => (
                    <div key={reason} className="flex justify-between">
                      <span className="capitalize">{reason}</span>
                      <span className="font-mono">{count}</span>
                    </div>
                  ))}
                  {totalExcluded === 0 && (
                    <div className="text-center opacity-70 pt-2">No files excluded</div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      {/* Main explorer body */}
      <div className="flex flex-1 overflow-hidden p-2 sm:p-4 gap-4 relative">
        {/* Mobile Backdrop */}
        {mobileDrawerOpen && (
          <div
            id="mobile-drawer-backdrop"
            onClick={() => setMobileDrawerOpen(false)}
            className="sm:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
            aria-hidden="true"
          />
        )}

        {/* Sidebar: Desktop fixed panel, Mobile slide-over drawer */}
        <aside 
          ref={drawerRef}
          aria-label="Repository file tree"
          className={`
            z-50 sm:z-auto
            fixed sm:static
            inset-y-0 left-0
            w-72 sm:w-72
            shrink-0 rounded-r-md sm:rounded-md border flex flex-col overflow-hidden shadow-xl sm:shadow-none
            transition-transform duration-200 ease-in-out
            ${mobileDrawerOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}
            ${mobileDrawerOpen ? "block" : "hidden sm:flex"}
          `}
          style={{ backgroundColor: "#393A4F", borderColor: "#3A745D" }}
        >
          {/* Mobile drawer header with close button */}
          <div className="sm:hidden flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "#3A745D" }}>
            <span className="text-xs font-semibold" style={{ color: "#BEEF8D" }}>Files</span>
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Close file tree"
              className="p-1 rounded hover:opacity-70 focus:outline-none"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <TreeView 
            tree={tree}
            selectedFile={selectedFile}
            onSelect={handleSelect}
            onViewerFocus={handleViewerFocus}
            filterInputRef={filterInputRef}
          />
        </aside>

        {/* Right Panel - File Viewer */}
        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          <FileViewer
            snapshotId={snapshot.id}
            selectedPath={selectedFile}
            onFocusTree={handleFocusTree}
          />
        </main>
      </div>
    </div>
  )
}
