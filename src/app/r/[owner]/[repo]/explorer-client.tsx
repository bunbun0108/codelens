"use client"

import * as React from "react"
import type { Snapshot } from "../../../../shared/schemas/index"
import { Badge } from "../../../../components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../components/ui/popover"
import { GitCommit, AlertCircle } from "lucide-react"
import Link from "next/link"

export function ExplorerClient({ snapshot, initialFile }: { snapshot: Snapshot; initialFile?: string }) {
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
        className="flex h-14 shrink-0 items-center justify-between px-4 border-b"
        style={{ borderColor: "#3A745D", backgroundColor: "#393A4F" }}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="font-bold hover:opacity-80" style={{ color: "#BEEF8D" }}>CodeLens</Link>
          <span style={{ color: "#3A745D" }}>/</span>
          <div className="flex items-center gap-1.5 font-medium">
            <span>{snapshot.repo.owner}</span>
            <span style={{ color: "#3A745D" }}>/</span>
            <span>{snapshot.repo.name}</span>
          </div>
          
          {snapshot.repo.archived && (
            <Badge variant="secondary" style={{ backgroundColor: "#3A745D", color: "#AFFDF0", border: "none" }}>
              ARCHIVED
            </Badge>
          )}

          <Badge variant="outline" style={{ borderColor: "#3A745D", color: "#AFFDF0" }} className="ml-2">
            {snapshot.source.resolvedRefName}
          </Badge>

          <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
            <Badge variant="secondary" className="ml-1 text-[10px]" style={{ backgroundColor: "#3A745D", color: "#AFFDF0", border: "none" }}>
              <GitCommit className="mr-1 h-3 w-3 inline" />
              {shortSha}
            </Badge>
          </a>

          {snapshot.source.subpath && (
            <>
              <span style={{ color: "#3A745D" }}>/</span>
              <span className="text-sm">{snapshot.source.subpath}</span>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-4 text-xs">
          <div>{snapshot.stats.filesIncluded} files</div>
          <div>{(snapshot.stats.bytesIncluded / 1024).toFixed(1)} KB</div>
          
          <Popover>
            <PopoverTrigger 
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 text-xs"
              style={{ borderColor: "#3A745D", backgroundColor: "#241D01", color: "#BEEF8D" }}
            >
              <AlertCircle className="mr-2 h-3.5 w-3.5" />
              {totalExcluded} excluded
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

      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        {/* Left Panel - File Tree Placeholder */}
        <aside 
          className="w-72 shrink-0 rounded-md border flex flex-col items-center justify-center"
          style={{ backgroundColor: "#393A4F", borderColor: "#3A745D" }}
        >
          <div className="text-center opacity-60">
            <p className="font-medium mb-1" style={{ color: "#BEEF8D" }}>File Tree</p>
            <p className="text-xs">(Placeholder)</p>
          </div>
        </aside>

        {/* Right Panel - File Viewer Placeholder */}
        <main 
          className="flex-1 rounded-md border flex flex-col items-center justify-center"
          style={{ backgroundColor: "#393A4F", borderColor: "#3A745D" }}
        >
          <div className="text-center opacity-60">
            <p className="font-medium mb-1" style={{ color: "#BEEF8D" }}>File Viewer</p>
            <p className="text-xs">
              {initialFile ? `Selected: ${initialFile}` : "(Placeholder)"}
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
