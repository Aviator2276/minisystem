import { Link, useRouter } from "@tanstack/react-router"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { HomeIcon, KeyboardMusicIcon, RotateCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Shared themed shell for full-page error/not-found screens. Sharp corners and
 * theme tokens keep it consistent with the rest of the app; it renders inside
 * the root shell so it inherits the theme provider.
 */
function ErrorShell({
  code,
  title,
  description,
  detail,
  children,
}: {
  code: string
  title: string
  description: string
  detail?: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center text-foreground">
      <div className="flex items-center gap-2 text-muted-foreground">
        <KeyboardMusicIcon className="size-5" />
        <span className="text-sm font-semibold tracking-widest uppercase">
          MiniSystem
        </span>
      </div>

      <p className="text-7xl font-black tabular-nums sm:text-8xl">{code}</p>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="max-w-md text-muted-foreground">{description}</p>
      </div>

      {detail && (
        <pre className="max-w-md overflow-x-auto border border-border bg-muted px-4 py-3 text-left font-mono text-xs text-muted-foreground">
          {detail}
        </pre>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {children}
      </div>
    </main>
  )
}

/** Router-wide 404 page. */
export function NotFoundPage() {
  return (
    <ErrorShell
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or may have moved."
    >
      <Button asChild>
        <Link to="/">
          <HomeIcon className="size-4" />
          Back home
        </Link>
      </Button>
    </ErrorShell>
  )
}

/** Router-wide error boundary page. */
export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const message = error instanceof Error ? error.message : String(error)

  return (
    <ErrorShell
      code="Error"
      title="Something went wrong"
      description="An unexpected error interrupted this page. You can retry, or head back to the dashboard."
      detail={message}
    >
      <Button
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        <RotateCwIcon className="size-4" />
        Try again
      </Button>
      <Button asChild variant="outline">
        <Link to="/">
          <HomeIcon className="size-4" />
          Back home
        </Link>
      </Button>
    </ErrorShell>
  )
}
