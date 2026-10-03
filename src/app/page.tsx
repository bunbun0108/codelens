import { UrlForm } from "../components/url-form"
import { Github, Code2, Zap, ShieldCheck } from "lucide-react"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 dark:bg-neutral-950">
      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 md:p-24">
        <div className="mx-auto w-full max-w-3xl space-y-8 text-center">
          <div className="space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-900 shadow-sm dark:bg-white">
              <Code2 className="h-8 w-8 text-white dark:text-neutral-900" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white sm:text-5xl md:text-6xl lg:text-7xl">
              CodeLens AI
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-xl">
              Ingest, filter, and explore any public GitHub repository instantly.
              Tailored for LLM context windows.
            </p>
          </div>

          <div className="mx-auto max-w-xl">
            <UrlForm />
          </div>

          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 pt-16 sm:grid-cols-3">
            <Feature
              icon={<Zap className="h-6 w-6" />}
              title="Instant Ingestion"
              description="No cloning, no database. Fetches directly via GitHub APIs with minimal latency."
            />
            <Feature
              icon={<ShieldCheck className="h-6 w-6" />}
              title="Smart Filtering"
              description="Automatically excludes lockfiles, binaries, and minified code."
            />
            <Feature
              icon={<Github className="h-6 w-6" />}
              title="Deep Links"
              description="Share specific branches, tags, or even deep directory subpaths effortlessly."
            />
          </div>
        </div>
      </main>
    </div>
  )
}

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center space-y-2 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/50 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-white">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-neutral-900 dark:text-white">{title}</h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
    </div>
  )
}
