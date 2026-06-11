export type Alliance = "red" | "blue"

/**
 * Flips which physical side each alliance is shown on across the whole app
 * (scoreboard, results, lineup, judge, control panel, TV, public, etc.).
 *
 * Return `true` to put blue on the left / top; `false` (default) keeps red on
 * the left / top. Everything that lays alliances out left-to-right (or
 * top-to-bottom) iterates {@link ALLIANCE_ORDER} rather than hard-coding
 * `["red", "blue"]`. (A function keeps the type `boolean` so the rest of the
 * codebase stays branchable.)
 */
function flipAllianceSides(): boolean {
  return false
}

export const FLIP_ALLIANCE_SIDES = flipAllianceSides()

/** Alliances in display order (left→right / top→bottom). */
export const ALLIANCE_ORDER: readonly [Alliance, Alliance] = FLIP_ALLIANCE_SIDES
  ? ["blue", "red"]
  : ["red", "blue"]
