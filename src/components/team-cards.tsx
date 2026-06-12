import { cn } from "@/lib/utils"
import type { TeamCardState } from "@/shared/cards"

// taller than wide, like a referee's card
const SIZES = {
  sm: { card: "h-4 w-2.5", overlap: "-ml-1" },
  md: { card: "h-5 w-3", overlap: "-ml-1.5" },
  lg: { card: "h-8 w-5", overlap: "-ml-2.5" },
} as const

function describe(cards: TeamCardState): string {
  const parts: string[] = []
  if (cards.yellows) parts.push(`${cards.yellows} yellow`)
  if (cards.reds) parts.push(`${cards.reds} red`)
  if (cards.disqualified) parts.push("disqualified")
  return parts.join(" · ")
}

/**
 * Overlapping square-card graphic shown next to a team number. Yellows render
 * as yellow cards, reds as red cards; multiple cards overlap (one tucked
 * behind the next). See `@/shared/cards` for the escalation/DQ rules.
 */
export function TeamCards({
  cards,
  size = "md",
  className,
}: {
  cards: TeamCardState
  size?: keyof typeof SIZES
  className?: string
}) {
  if (cards.yellows + cards.reds === 0) return null
  const kinds: ("yellow" | "red")[] = [
    ...Array<"yellow">(cards.yellows).fill("yellow"),
    ...Array<"red">(cards.reds).fill("red"),
  ]
  const { card, overlap } = SIZES[size]

  return (
    <span
      className={cn("inline-flex shrink-0 items-center", className)}
      title={describe(cards)}
      aria-label={describe(cards)}
    >
      {kinds.map((kind, i) => (
        <span
          key={i}
          className={cn(
            "inline-block border border-black/40 shadow-sm",
            card,
            i > 0 && overlap
          )}
          style={{
            backgroundColor: kind === "yellow" ? "#facc15" : "#dc2626",
          }}
        />
      ))}
    </span>
  )
}
