"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2 } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { parseGitHubUrl } from "../shared/github-url"

export function UrlForm() {
  const router = useRouter()
  const [url, setUrl] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!url.trim()) return

    try {
      const parsed = parseGitHubUrl(url)
      
      // Construct the canonical CodeLens route URL
      const route = `/r/${parsed.owner}/${parsed.repo}`
      
      // We don't reconstruct the full path, we let the ingest API resolve it,
      // but for the UI route, we just need to hit /r/[owner]/[repo] and pass the full URL
      // as a query param so the page knows what to ingest, OR we can encode it.
      // Wait, M1 Spec says: URL → resolved commit.
      // Actually, if we just navigate to /r/owner/repo?url=...
      
      setLoading(true)
      router.push(`${route}?url=${encodeURIComponent(url)}`)
    } catch (err: any) {
      setError(err.message || "Invalid GitHub URL")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <div className="relative flex w-full items-center">
        <div className="pointer-events-none absolute left-3 text-neutral-500">
          <Search className="h-5 w-5" />
        </div>
        <Input
          type="url"
          placeholder="https://github.com/owner/repo/tree/branch/path"
          className="h-14 pl-10 pr-24 text-base rounded-full shadow-sm"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
          disabled={loading}
          autoFocus
          required
        />
        <div className="absolute right-1.5">
          <Button 
            type="submit" 
            size="sm" 
            className="h-11 rounded-full px-6 font-semibold"
            disabled={loading || !url.trim()}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Explore"}
          </Button>
        </div>
      </div>
      {error && (
        <p className="text-sm font-medium text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  )
}
