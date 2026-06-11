import { describe, expect, it } from "vitest"
import {
  SelectionError,
  allianceCountFor,
  reduceSelection,
} from "./state-machine"
import type { SelectionActionInput } from "./state-machine"

// teams ranked t1 (best) .. t15
const ranked = Array.from({ length: 15 }, (_, i) => `t${i + 1}`)

const invite = (teamId: string): SelectionActionInput => ({
  type: "invite",
  teamId,
})
const accept: SelectionActionInput = { type: "accept" }
const decline: SelectionActionInput = { type: "decline" }
const undo: SelectionActionInput = { type: "undo" }

describe("alliance count", () => {
  it("scales with team count", () => {
    expect(allianceCountFor(15)).toBe(5)
    expect(allianceCountFor(9)).toBe(3)
    expect(allianceCountFor(24)).toBe(8)
    expect(allianceCountFor(11)).toBe(3) // 2 spare teams
  })
})

describe("selection state machine", () => {
  it("starts with alliance 1 picking, captains locked lazily", () => {
    const s = reduceSelection(ranked, [])
    expect(s.allianceCount).toBe(5)
    expect(s.currentAllianceNumber).toBe(1)
    expect(s.pickRound).toBe(1)
    expect(s.alliances[0].captainTeamId).toBe("t1")
    // lower captains are provisional (not locked) until their turn
    expect(s.alliances[4].captainTeamId).toBeNull()
    // provisional captains are invitable; t1 is locked and is not
    expect(s.available).not.toContain("t1")
    expect(s.available).toContain("t2")
  })

  it("snakes 1→N then N→1", () => {
    // every alliance invites the best non-captain team and it accepts
    let actions: SelectionActionInput[] = []
    const order: number[] = []
    for (let i = 0; i < 10; i++) {
      const s = reduceSelection(ranked, actions)
      order.push(s.currentAllianceNumber!)
      actions = [
        ...actions,
        invite(s.available[s.available.length - 1]),
        accept,
      ]
    }
    expect(order).toEqual([1, 2, 3, 4, 5, 5, 4, 3, 2, 1])
    expect(reduceSelection(ranked, actions).complete).toBe(true)
  })

  it("declined teams can never be invited again", () => {
    const actions = [invite("t10"), decline]
    const s = reduceSelection(ranked, actions)
    expect(s.declined).toEqual(["t10"])
    expect(s.available).not.toContain("t10")
    // alliance 1 keeps its turn
    expect(s.currentAllianceNumber).toBe(1)
    expect(() => reduceSelection(ranked, [...actions, invite("t10")])).toThrow(
      SelectionError
    )
  })

  it("declined teams stay captain-eligible", () => {
    // t6 would be the 6th pick; have it decline alliance 1, then t2..t5 get
    // picked by alliance 1..4? — simpler: t2 declines a1, then when alliance 2
    // comes up t2 is still its captain
    const actions = [invite("t2"), decline, invite("t10"), accept]
    const s = reduceSelection(ranked, actions)
    expect(s.currentAllianceNumber).toBe(2)
    expect(s.alliances[1].captainTeamId).toBe("t2")
  })

  it("captain backfill: accepting an invite shifts every provisional captain up", () => {
    // alliance 1 (captain t1) invites t2 — the provisional captain of alliance 2
    const s = reduceSelection(ranked, [invite("t2"), accept])
    expect(s.alliances[0].pickTeamIds).toEqual(["t2"])
    // t3 backfills alliance 2, t4→3, t5→4, t6→5 (locked as turns arrive)
    expect(s.alliances[1].captainTeamId).toBe("t3")
    const done = runGreedy(ranked, [invite("t2"), accept])
    expect(done.alliances.map((a) => a.captainTeamId)).toEqual([
      "t1",
      "t3",
      "t4",
      "t5",
      "t6",
    ])
  })

  it("locked captains cannot be invited", () => {
    expect(() => reduceSelection(ranked, [invite("t1")])).toThrow(/captain/)
  })

  it("undo cancels the previous action", () => {
    const s = reduceSelection(ranked, [invite("t9"), undo])
    expect(s.pendingInvite).toBeNull()
    const s2 = reduceSelection(ranked, [invite("t9"), accept, undo])
    expect(s2.pendingInvite).toEqual({ allianceNumber: 1, teamId: "t9" })
    expect(s2.alliances[0].pickTeamIds).toEqual([])
  })

  it("completes short-handed when a decline exhausts the pool", () => {
    // 15 teams = exactly 15 slots; t12 declining leaves one slot unfillable
    const s = runGreedy(ranked, [invite("t12"), decline])
    expect(s.complete).toBe(true)
    const onAlliances = new Set(
      s.alliances.flatMap((a) => [a.captainTeamId, ...a.pickTeamIds])
    )
    expect(onAlliances.size).toBe(14)
    expect(onAlliances.has("t12")).toBe(false)
    expect(s.backups).not.toContain("t12")
    // exactly one alliance is short one pick — the last snake slot (alliance 1)
    const short = s.alliances.filter((a) => a.pickTeamIds.length < 2)
    expect(short.map((a) => a.number)).toEqual([1])
  })

  it("15-team full scenario: decline + captain-accept backfill, restart-safe", () => {
    // alliance 1: invites t4 (provisional captain of a4) who accepts; t9 declines a2
    const seed: SelectionActionInput[] = [
      invite("t4"),
      accept, // a1 = t1 + t4 → captains become t1,t2,t3,t5,t6
      invite("t9"),
      decline, // t9 out forever
    ]
    const s = runGreedy(ranked, seed)
    expect(s.complete).toBe(true)
    expect(s.alliances.map((a) => a.captainTeamId)).toEqual([
      "t1",
      "t2",
      "t3",
      "t5",
      "t6",
    ])
    expect(s.alliances[0].pickTeamIds[0]).toBe("t4")
    expect(s.declined).toEqual(["t9"])
    expect(s.backups).not.toContain("t9")
    // t9's decline leaves alliance 1's final snake pick unfillable
    expect(s.alliances[0].pickTeamIds).toEqual(["t4"])
    // restart safety: state is a pure function of the log — same log, same state
    const replay = runGreedy(ranked, seed)
    expect(replay).toEqual(s)
  })

  it("rejects acting after completion and double invites", () => {
    const s = runGreedyActions(ranked, [])
    expect(() => reduceSelection(ranked, [...s, invite("t15")])).toThrow(
      /complete/
    )
    expect(() =>
      reduceSelection(ranked, [invite("t9"), invite("t10")])
    ).toThrow(/pending/)
  })

  it("works for 9 teams → 3 alliances", () => {
    const nine = ranked.slice(0, 9)
    const s = runGreedy(nine, [])
    expect(s.allianceCount).toBe(3)
    expect(s.complete).toBe(true)
    expect(s.backups).toEqual([]) // 9 teams, 9 slots, nobody left
  })
})

/** keeps inviting the lowest-ranked available team until selection completes */
function runGreedyActions(
  teams: string[],
  seed: SelectionActionInput[]
): SelectionActionInput[] {
  let actions = [...seed]
  for (let guard = 0; guard < 64; guard++) {
    const s = reduceSelection(teams, actions)
    if (s.complete) return actions
    actions = [
      ...actions,
      { type: "invite", teamId: s.available[s.available.length - 1] },
      accept,
    ]
  }
  throw new Error("did not complete")
}

function runGreedy(teams: string[], seed: SelectionActionInput[]) {
  return reduceSelection(teams, runGreedyActions(teams, seed))
}
