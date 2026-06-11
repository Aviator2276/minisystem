/**
 * Alliance selection as a pure reduction over an append-only action log.
 * State is never stored — it is re-derived from (rank order, actions) on every
 * read, which makes the process restart-safe and trivially undoable.
 *
 * Rules (MiniFRC):
 * - N alliances, N = floor(teams / 3) unless overridden.
 * - Captains are the top-N ranked teams, assigned lazily: a captain slot is
 *   only locked when its alliance comes up to pick. Until then the team is a
 *   provisional captain and may be invited by a higher alliance — accepting
 *   backfills every provisional captain slot below from the next-ranked team.
 * - Picks snake 1→N, then N→1 (two picks per alliance).
 * - A team that declines an invitation can never be invited again (it can
 *   still earn a captain slot, and keeps its ranking).
 * - When every alliance has 3 teams, the next N eligible ranked teams become
 *   backup bots, best-ranked first.
 */

export type SelectionActionInput =
  | { type: "invite"; teamId: string }
  | { type: "accept" }
  | { type: "decline" }
  | { type: "undo" }

export interface SelectionAlliance {
  number: number
  captainTeamId: string | null
  pickTeamIds: string[]
}

export interface SelectionState {
  allianceCount: number
  alliances: SelectionAlliance[]
  declined: string[]
  pendingInvite: { allianceNumber: number; teamId: string } | null
  /** alliance currently on the clock (null once complete) */
  currentAllianceNumber: number | null
  pickRound: 1 | 2 | null
  backups: string[]
  complete: boolean
  /** teams currently invitable, in rank order */
  available: string[]
}

export function allianceCountFor(teamCount: number): number {
  return Math.max(1, Math.floor(teamCount / 3))
}

export class SelectionError extends Error {}

/** removes actions cancelled by "undo" (each undo cancels the previous action) */
export function effectiveActions(
  actions: SelectionActionInput[]
): SelectionActionInput[] {
  const out: SelectionActionInput[] = []
  for (const action of actions) {
    if (action.type === "undo") out.pop()
    else out.push(action)
  }
  return out
}

export function reduceSelection(
  rankedTeamIds: string[],
  actions: SelectionActionInput[],
  allianceCount = allianceCountFor(rankedTeamIds.length)
): SelectionState {
  const n = allianceCount
  const captains: (string | null)[] = Array.from({ length: n }, () => null)
  const picks: string[][] = Array.from({ length: n }, () => [])
  const picked = new Set<string>()
  const declined = new Set<string>()
  let pendingInvite: { allianceNumber: number; teamId: string } | null = null

  // snake: each entry is the alliance number making that pick
  const slots = [
    ...Array.from({ length: n }, (_, i) => i + 1),
    ...Array.from({ length: n }, (_, i) => n - i),
  ]
  let slotIndex = 0

  const isCaptain = (teamId: string) => captains.includes(teamId)

  function nextEligibleCaptain(): string | null {
    for (const teamId of rankedTeamIds) {
      if (picked.has(teamId)) continue
      if (isCaptain(teamId)) continue
      return teamId // declined teams remain captain-eligible
    }
    return null
  }

  function lockCaptainsThrough(allianceNumber: number) {
    for (let k = 0; k < allianceNumber; k++) {
      captains[k] ??= nextEligibleCaptain()
    }
  }

  for (const action of effectiveActions(actions)) {
    if (slotIndex >= slots.length)
      throw new SelectionError("Selection is already complete")
    const current = slots[slotIndex]
    lockCaptainsThrough(current)

    switch (action.type) {
      case "invite": {
        if (pendingInvite)
          throw new SelectionError("An invitation is already pending")
        const teamId = action.teamId
        if (picked.has(teamId))
          throw new SelectionError("Team is already on an alliance")
        if (declined.has(teamId))
          throw new SelectionError(
            "Team declined earlier and cannot be invited"
          )
        if (isCaptain(teamId))
          throw new SelectionError("Team is a locked alliance captain")
        if (!rankedTeamIds.includes(teamId))
          throw new SelectionError("Team is not in this event")
        pendingInvite = { allianceNumber: current, teamId }
        break
      }
      case "accept": {
        if (!pendingInvite) throw new SelectionError("No invitation to accept")
        picks[pendingInvite.allianceNumber - 1].push(pendingInvite.teamId)
        picked.add(pendingInvite.teamId)
        pendingInvite = null
        slotIndex += 1
        break
      }
      case "decline": {
        if (!pendingInvite) throw new SelectionError("No invitation to decline")
        declined.add(pendingInvite.teamId)
        pendingInvite = null
        // the alliance keeps its turn and invites someone else
        break
      }
      case "undo":
        throw new SelectionError(
          "unreachable: undo is resolved by effectiveActions"
        )
    }
  }

  // declines can exhaust the pool (e.g. exactly 3N teams + a decline): skip
  // pick slots nobody can fill so selection completes with a short alliance
  // instead of deadlocking
  while (slotIndex < slots.length && pendingInvite === null) {
    lockCaptainsThrough(slots[slotIndex])
    const anyEligible = rankedTeamIds.some(
      (teamId) =>
        !picked.has(teamId) && !declined.has(teamId) && !isCaptain(teamId)
    )
    if (anyEligible) break
    slotIndex += 1
  }

  const complete = slotIndex >= slots.length
  if (complete) lockCaptainsThrough(n)
  else lockCaptainsThrough(slots[slotIndex])

  const backups: string[] = []
  if (complete) {
    for (const teamId of rankedTeamIds) {
      if (backups.length >= n) break
      if (picked.has(teamId) || isCaptain(teamId) || declined.has(teamId))
        continue
      backups.push(teamId)
    }
  }

  const available = rankedTeamIds.filter(
    (teamId) =>
      !picked.has(teamId) &&
      !declined.has(teamId) &&
      !isCaptain(teamId) &&
      pendingInvite?.teamId !== teamId
  )

  return {
    allianceCount: n,
    alliances: captains.map((captainTeamId, i) => ({
      number: i + 1,
      captainTeamId,
      pickTeamIds: picks[i],
    })),
    declined: [...declined],
    pendingInvite,
    currentAllianceNumber: complete ? null : slots[slotIndex],
    pickRound: complete ? null : slotIndex < n ? 1 : 2,
    backups,
    complete,
    available,
  }
}
