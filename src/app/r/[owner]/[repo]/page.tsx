import { Metadata } from "next"
import { notFound } from "next/navigation"
import { ingestionService } from "../../../../server/container"
import { ExplorerClient } from "./explorer-client"
import { AppError } from "../../../../shared/types/errors"
import { AlertCircle } from "lucide-react"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Explorer - CodeLens AI",
}

interface PageProps {
  params: Promise<{ owner: string; repo: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function RepoPage(props: PageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  
  const owner = params.owner
  const repo = params.repo
  
  // URL comes from search query, or defaults to the root repo
  const urlParam = searchParams.url
  const targetUrl = typeof urlParam === "string" 
    ? urlParam 
    : `https://github.com/${owner}/${repo}`

  let snapshot;
  try {
    snapshot = await ingestionService.ingestRepository(targetUrl)
  } catch (err: unknown) {
    if (err instanceof AppError && err.code === "REPO_NOT_FOUND") {
      notFound()
    }
    
    // For other errors, render a friendly error state
    const message = err instanceof AppError ? err.message : "An unexpected error occurred."
    const code = err instanceof AppError ? err.code : "INTERNAL"
    
    return (
      <div className="flex h-screen w-full items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <div className="max-w-md w-full space-y-4 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
          <div className="flex items-center gap-3 border-b border-red-200 pb-4 dark:border-red-900/50">
            <AlertCircle className="h-6 w-6" />
            <h2 className="text-lg font-semibold">Ingestion Failed</h2>
          </div>
          <div className="space-y-2 pt-2">
            <p className="text-sm opacity-90">{message}</p>
            <p className="text-xs font-mono opacity-70">Error code: {code}</p>
          </div>
          <div className="pt-4">
            <Link href="/" className="text-sm font-medium underline underline-offset-4 hover:opacity-80">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <ExplorerClient snapshot={snapshot} />
}
