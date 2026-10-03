"use client"

import * as React from "react"
import type { Snapshot, FileEntry, TreeNode } from "../../../../shared/schemas/index"
import { buildTree } from "../../../../shared/build-tree"
import { FileCode2, Folder, ChevronRight, ChevronDown, GitCommit, FileText, Download, Copy, Check, AlertCircle } from "lucide-react"
import { Button } from "../../../../components/ui/button"
import { ScrollArea } from "../../../../components/ui/scroll-area"
import { Skeleton } from "../../../../components/ui/skeleton"
import { Badge } from "../../../../components/ui/badge"

import Link from "next/link"

export function ExplorerClient({ snapshot }: { snapshot: Snapshot }) {
  const [selectedFile, setSelectedFile] = React.useState<FileEntry | null>(null)
  
  // Build the tree once
  const tree = React.useMemo(() => buildTree(snapshot.files, snapshot.source.subpath || ""), [snapshot.files, snapshot.source.subpath])

  return (
    <div className="flex h-screen w-full flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50 overflow-hidden">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-bold hover:underline">CodeLens</Link>
          <span className="text-neutral-400">/</span>
          <div className="flex items-center gap-1.5 font-medium">
            <span>{snapshot.repo.owner}</span>
            <span className="text-neutral-400">/</span>
            <span>{snapshot.repo.name}</span>
          </div>
          <Badge variant="secondary" className="ml-2 font-mono text-[10px]">
            <GitCommit className="mr-1 h-3 w-3 inline" />
            {snapshot.source.commitSha.substring(0, 7)}
          </Badge>
          {snapshot.source.subpath && (
            <Badge variant="outline" className="ml-1 text-xs">
              {snapshot.source.subpath}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <div>{snapshot.stats.filesIncluded} files</div>
          <div>{(snapshot.stats.bytesIncluded / 1024).toFixed(1)} KB</div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 border-r border-neutral-200 flex flex-col bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/20">
          <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 font-medium text-sm text-neutral-500">
            Files
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {tree.map(node => (
                <TreeNodeView 
                  key={node.path} 
                  node={node} 
                  level={0} 
                  onSelectFile={setSelectedFile}
                  selectedPath={selectedFile?.path}
                />
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-neutral-950">
          {selectedFile ? (
            <FileViewer snapshotId={snapshot.id} file={selectedFile} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-neutral-400 flex-col gap-4">
              <FileText className="h-12 w-12 opacity-20" />
              <p>Select a file from the sidebar to view its contents</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function TreeNodeView({ 
  node, 
  level, 
  onSelectFile,
  selectedPath
}: { 
  node: TreeNode; 
  level: number;
  onSelectFile: (f: FileEntry) => void;
  selectedPath: string | undefined;
}) {
  const [isOpen, setIsOpen] = React.useState(level < 2) // Auto-open top levels

  if (node.kind === "file") {
    const isSelected = selectedPath === node.path
    return (
      <button
        onClick={() => onSelectFile(node.entry)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 ${isSelected ? 'bg-neutral-200/80 dark:bg-neutral-800 font-medium' : 'text-neutral-600 dark:text-neutral-300'}`}
        style={{ paddingLeft: `${(level * 12) + 8}px` }}
      >
        <FileCode2 className="h-4 w-4 shrink-0 opacity-70 text-blue-500" />
        <span className="truncate">{node.name}</span>
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-sm text-left hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 text-neutral-700 dark:text-neutral-200 font-medium"
        style={{ paddingLeft: `${(level * 12) + 4}px` }}
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
        )}
        <Folder className="h-4 w-4 shrink-0 opacity-70 text-neutral-400" />
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen && (
        <div>
          {node.children.map(child => (
            <TreeNodeView 
              key={child.path} 
              node={child} 
              level={level + 1} 
              onSelectFile={onSelectFile}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileViewer({ snapshotId, file }: { snapshotId: string; file: FileEntry }) {
  const [content, setContent] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [html, setHtml] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    setContent(null)
    setHtml(null)

    fetch(`/api/snapshots/${snapshotId}/file?path=${encodeURIComponent(file.path)}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch file")
        return res.json()
      })
      .then(data => {
        if (!active) return
        setContent(data.content)
        setLoading(false)
        
        // Dynamic import shiki to highlight if it's text
        import("shiki").then(async ({ codeToHtml }) => {
          try {
            const lang = file.language?.toLowerCase() || "text"
            
            const highlighted = await codeToHtml(data.content, {
              lang,
              themes: {
                light: "github-light",
                dark: "github-dark"
              }
            }).catch(() => null)
            
            if (active && highlighted) setHtml(highlighted)
          } catch (e) {
            console.error("Shiki error:", e)
          }
        })
      })
      .catch(err => {
        if (active) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => { active = false }
  }, [snapshotId, file.path, file.language])

  const copyToClipboard = () => {
    if (content) {
      navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/20">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{file.name}</span>
          <span className="text-xs text-neutral-500 font-mono">
            {file.size} bytes • {file.language || "Unknown"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyToClipboard} disabled={!content} className="h-8 text-xs">
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" asChild className="h-8 text-xs">
            <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(content || "")}`} download={file.name}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download
            </a>
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1 w-full bg-[#f8f9fa] dark:bg-[#0d1117]">
        {loading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : error ? (
          <div className="p-6 text-red-500 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        ) : html ? (
          <div 
            className="p-4 text-sm font-mono [&>pre]:!bg-transparent [&>pre]:!m-0" 
            dangerouslySetInnerHTML={{ __html: html }} 
          />
        ) : (
          <pre className="p-4 text-sm font-mono text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
            {content}
          </pre>
        )}
      </ScrollArea>
    </div>
  )
}
