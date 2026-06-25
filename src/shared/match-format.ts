/**
 * Grand-final matches get their own name: the single final is "Final" and a
 * best-of-3 series is "Final 1/2/3" (slots F1/F2/F3). Returns null for any
 * other slot so the caller falls back to the numbered playoff label.
 */
function finalLabel(
  slot: string | null | undefined,
  long: boolean
): string | null {
  if (!slot) return null
  if (slot === "F") return long ? "Final" : "F"
  const m = /^F([123])$/.exec(slot)
  if (m) return long ? `Final ${m[1]}` : slot
  return null
}

/** Short match code, e.g. Q3 / P5 / Pr2 / F1. */
export function matchShortLabel(match: {
  type: string
  number: number
  bracketSlot?: string | null
}): string {
  if (match.type === "playoff") {
    const f = finalLabel(match.bracketSlot, false)
    if (f) return f
  }
  const prefix =
    match.type === "qualification"
      ? "Q"
      : match.type === "practice"
        ? "Pr"
        : "P"
  return `${prefix}${match.number}`
}

/** Full match label, e.g. "Qualification 3" / "Practice 2" / "Final 2". */
export function matchLongLabel(match: {
  type: string
  number: number
  bracketSlot?: string | null
}): string {
  if (match.type === "playoff") {
    const f = finalLabel(match.bracketSlot, true)
    if (f) return f
  }
  const name =
    match.type === "qualification"
      ? "Qualification"
      : match.type === "practice"
        ? "Practice"
        : "Playoff"
  return `${name} ${match.number}`
}

// canonical display ordering: practice first, then quals, then playoffs
const MATCH_TYPE_RANK: Record<string, number> = {
  practice: 0,
  qualification: 1,
  playoff: 2,
}

/** Sort matches by type (practice → quals → playoffs), then play order. */
export function sortMatchesByType<
  T extends { type: string; scheduledOrder: number },
>(list: readonly T[]): T[] {
  const rank = (t: string) => MATCH_TYPE_RANK[t] ?? 99
  return [...list].sort(
    (a, b) => rank(a.type) - rank(b.type) || a.scheduledOrder - b.scheduledOrder
  )
}
