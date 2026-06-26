/**
 * Pure helpers for the "Auto rotate views" display behavior. The rotation is
 * driven server-side (the rotator persists `displayView` and broadcasts
 * `view_change` per slide) so the control panel, arena display, and TV all stay
 * in lock-step — but the math for *which* views rotate and how long each shows
 * lives here, colocated with its test.
 */

export type RotatableView = "lineup" | "rankings" | "schedule" | "bracket"

/** how long each rotated slide is shown (ms); rankings shows this long per page */
export const ROTATE_SLIDE_MS = 15_000
/** after a manual view pick, hold it this long before rotation resumes (ms) */
export const MANUAL_OVERRIDE_MS = 30_000
/** teams per rankings page (mirrors RANKINGS_PAGE_SIZE in use-rotating-page) */
export const ROTATION_RANKINGS_PAGE_SIZE = 10

export interface RotationContext {
  /** the lineup banner is pinned, so the lineup *view* drops out of the cycle */
  alwaysShowLineup: boolean
  isPlayoffs: boolean
  hasRankings: boolean
  hasSchedule: boolean
  hasBracket: boolean
}

/**
 * The ordered set of views the display cycles through. Lineup leads (unless the
 * lineup banner is pinned). During qualifications it's rankings then schedule;
 * during playoffs rankings is dropped (it no longer matters) in favor of the
 * schedule and the bracket. Views with no data to show are omitted so a slide
 * is never blank.
 */
export function rotationSet(ctx: RotationContext): RotatableView[] {
  const list: RotatableView[] = []
  if (!ctx.alwaysShowLineup) list.push("lineup")
  if (ctx.isPlayoffs) {
    if (ctx.hasSchedule) list.push("schedule")
    if (ctx.hasBracket) list.push("bracket")
  } else {
    if (ctx.hasRankings) list.push("rankings")
    if (ctx.hasSchedule) list.push("schedule")
  }
  return list
}

/**
 * The next view to show after `current`. Wraps around the set, and when
 * `current` isn't part of the set (e.g. the admin parked the display on "match"
 * or "camera") it jumps to the first rotatable view.
 */
export function nextRotationView(
  set: RotatableView[],
  current: string
): RotatableView | null {
  if (set.length === 0) return null
  const idx = set.indexOf(current as RotatableView)
  // idx === -1 → (-1 + 1) % len === 0 → first view
  return set[(idx + 1) % set.length]
}

/** how long to dwell on a slide; rankings stays long enough to page through all teams */
export function slideDwellMs(
  view: RotatableView,
  rankingTeamCount: number
): number {
  if (view !== "rankings") return ROTATE_SLIDE_MS
  const pages = Math.max(
    1,
    Math.ceil(rankingTeamCount / ROTATION_RANKINGS_PAGE_SIZE)
  )
  return pages * ROTATE_SLIDE_MS
}
