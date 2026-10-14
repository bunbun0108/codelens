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

  // Build the canonical GitHub URL from route segments + query params.
  // The landing page sets ?ref= to the raw treeSegments joined with "/".
  // The ingestion service resolves slash-refs itself.
  const ref = typeof searchParams.ref === "string" ? searchParams.ref : "";
  const subpath = typeof searchParams.subpath === "string" ? searchParams.subpath : "";

  let targetUrl = `https://github.com/${owner}/${repo}`;
  if (ref) {
    // Append subpath after ref if present
    const treePath = subpath ? `${ref}/${subpath}` : ref;
    targetUrl += `/tree/${treePath}`;
  }

  let snapshot;
  try {
    snapshot = await ingestionService.ingestRepository(targetUrl)
  } catch (err: unknown) {
    if (err instanceof AppError && err.code === "REPO_NOT_FOUND") {
      notFound()
    }

    const message = err instanceof AppError ? err.message : "An unexpected error occurred."
    const code = err instanceof AppError ? err.code : "INTERNAL"

    return (
      <div
        className="flex h-screen w-full items-center justify-center p-6 bg-bg text-accent font-mono"
      >
        <div
          className="max-w-md w-full space-y-4 rounded-sm border border-line bg-surface p-6"
        >
          <div
            className="flex items-center gap-3 border-b border-line pb-4"
          >
            <AlertCircle className="h-6 w-6 text-accent-2" />
            <h2 className="text-lg font-semibold text-accent">
              Ingestion Failed
            </h2>
          </div>
          <div className="space-y-2 pt-2">
            <p className="text-sm text-accent opacity-90">
              {message}
            </p>
            <p className="text-xs font-mono text-line">
              Error code: {code}
            </p>
          </div>
          <div className="pt-4">
            <Link
              href="/"
              className="text-sm font-medium underline underline-offset-4 hover:opacity-80 text-accent-2"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Pass the selected file from query param through to the client
  const fileParam = typeof searchParams.file === "string" ? searchParams.file : undefined;
  return <ExplorerClient snapshot={snapshot} {...(fileParam !== undefined ? { initialFile: fileParam } : {})} />
}
