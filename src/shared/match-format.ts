/** Short match code, e.g. Q3 / P5 / Pr2. */
export function matchShortLabel(match: {
  type: string
  number: number
}): string {
  const prefix =
    match.type === "qualification"
      ? "Q"
      : match.type === "practice"
        ? "Pr"
        : "P"
  return `${prefix}${match.number}`
}

/** Full match label, e.g. "Qualification 3" / "Practice 2". */
export function matchLongLabel(match: {
  type: string
  number: number
}): string {
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
