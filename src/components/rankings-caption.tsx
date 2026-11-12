import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { latestRankedMatch, matchLongLabel } from "@/shared/match-format"

/** the slice of a match row the caption needs (a subset of listMatches rows) */
interface CaptionMatch {
  type: string
  number: number
  bracketSlot?: string | null
  status: string
  scheduledOrder: number
}

/**
 * Subtle "last updated" line under a Rankings heading. Prefers a deterministic
 * "Updated after Qualification 12" derived from the newest posted qual (safe to
 * render during SSR); falls back to a wall-clock time, which is gated on a
 * `mounted` flag so the server/client clocks never mismatch on hydration.
 */
export function RankingsUpdatedCaption({
  matches,
  className,
}: {
  matches: readonly CaptionMatch[]
  className?: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const latest = latestRankedMatch(matches)
  let text: string | null = null
  if (latest) {
    text = `Updated after ${matchLongLabel(latest)}`
  } else if (mounted) {
    text = `Updated ${new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`
  }
  if (!text) return null

  return (
    <p className={cn("text-sm text-white/45 tabular-nums", className)}>{text}</p>
  )
}
