export type Alliance = "red" | "blue"

/**
 * Alliances in display order (left→right / top→bottom).
 *
 * `flip` comes from the event's `settings.flipAllianceSides` (toggled in the
 * control panel's Display screen card and broadcast as a `settings_update`
 * realtime message): `true` puts blue on the left / top, `false`/`undefined`
 * keeps red there. Everything that lays alliances out left-to-right (or
 * top-to-bottom) iterates this rather than hard-coding `["red", "blue"]`.
 */
export function allianceOrder(
  flip: boolean | undefined
): readonly [Alliance, Alliance] {
  return flip ? ["blue", "red"] : ["red", "blue"]
}
