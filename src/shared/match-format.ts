/** Short match code, e.g. Q3 / P5 / Pr2. */
export function matchShortLabel(match: { type: string; number: number }): string {
  const prefix =
    match.type === "qualification" ? "Q" : match.type === "practice" ? "Pr" : "P"
  return `${prefix}${match.number}`
}

/** Full match label, e.g. "Qualification 3" / "Practice 2". */
export function matchLongLabel(match: { type: string; number: number }): string {
  const name =
    match.type === "qualification"
      ? "Qualification"
      : match.type === "practice"
        ? "Practice"
        : "Playoff"
  return `${name} ${match.number}`
}
