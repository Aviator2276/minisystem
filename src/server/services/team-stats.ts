import { asc, eq } from "drizzle-orm"
import { tables } from "@/db"
import type { Db } from "@/db"
import { computeRankings } from "./rankings"
import type { CachedAllianceScore } from "./scoring"
import { getSelectionState } from "./selection"

export interface RadarAxis {
  axis: string
  /** 0-100, normalized against the best alliance average in the event */
  value: number
  raw: number
}

export interface TeamScheduleRow {
  matchId: string
  label: string
  side: "red" | "blue"
  status: string
  ownPoints: number | null
  oppPoints: number | null
  result: "win" | "loss" | "tie" | null
}

interface CategoryTotals {
  auto: number
  teleop: number
  endgame: number
  boulders: number
  penaltyConceded: number
  played: number
}

export function getTeamDashboard(db: Db, teamId: string, eventId?: string) {
  const team = db
    .select()
    .from(tables.teams)
    .where(eq(tables.teams.id, teamId))
    .get()
  if (!team) throw new Error("Team not found")
  const participants = db
    .select()
    .from(tables.participants)
    .where(eq(tables.participants.teamId, teamId))
    .all()

  const memberships = db
    .select({
      eventId: tables.eventTeams.eventId,
      selectionStatus: tables.eventTeams.selectionStatus,
    })
    .from(tables.eventTeams)
    .where(eq(tables.eventTeams.teamId, teamId))
    .all()
  const events = memberships
    .map((m) =>
      db
        .select()
        .from(tables.events)
        .where(eq(tables.events.id, m.eventId))
        .get()
    )
    .filter((e) => e !== undefined)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  // default to the most "live" event: running stages beat setup beats complete
  const liveliness = (status: string) =>
    status === "complete" ? 2 : status === "setup" ? 1 : 0
  const byLiveliness = [...events].sort(
    (a, b) => liveliness(a.status) - liveliness(b.status)
  )
  const event =
    (eventId ? events.find((e) => e.id === eventId) : undefined) ??
    byLiveliness.at(0)

  if (!event) {
    return {
      team: {
        number: team.number,
        name: team.name,
        participants: participants.map((p) => p.name),
      },
      events: [],
      event: null,
    }
  }

  const matches = db
    .select()
    .from(tables.matches)
    .where(eq(tables.matches.eventId, event.id))
    .orderBy(asc(tables.matches.scheduledOrder))
    .all()

  // aggregate alliance-level category averages for every team in the event,
  // so the radar can be normalized against the event's best
  const perTeam = new Map<string, CategoryTotals>()
  const bump = (
    id: string | null,
    own: CachedAllianceScore | null,
    opp: CachedAllianceScore | null
  ) => {
    if (!id || !own) return
    const t = perTeam.get(id) ?? {
      auto: 0,
      teleop: 0,
      endgame: 0,
      boulders: 0,
      penaltyConceded: 0,
      played: 0,
    }
    t.auto += own.totals.auto
    t.teleop += own.totals.teleop
    t.endgame += own.totals.endgame
    t.boulders += own.totals.boulders
    t.penaltyConceded += opp?.totals.penalty ?? 0
    t.played += 1
    perTeam.set(id, t)
  }
  for (const match of matches) {
    if (match.status !== "posted") continue
    const red = match.redScore as CachedAllianceScore | null
    const blue = match.blueScore as CachedAllianceScore | null
    for (const id of [match.red1, match.red2, match.red3]) bump(id, red, blue)
    for (const id of [match.blue1, match.blue2, match.blue3])
      bump(id, blue, red)
  }

  const avg = (
    t: CategoryTotals | undefined,
    key: keyof Omit<CategoryTotals, "played">
  ) => (!t || t.played === 0 ? 0 : t[key] / t.played)
  const axes = [
    ["Auto", "auto"],
    ["Teleop", "teleop"],
    ["Endgame", "endgame"],
    ["Boulders", "boulders"],
  ] as const

  const mine = perTeam.get(teamId)
  const radar: RadarAxis[] = axes.map(([label, key]) => {
    const own = avg(mine, key)
    const best = Math.max(...[...perTeam.values()].map((t) => avg(t, key)), 0)
    return {
      axis: label,
      value: best === 0 ? 0 : Math.round((own / best) * 100),
      raw: own,
    }
  })
  // penalty avoidance: fewer conceded penalty points = higher score
  const ownPen = avg(mine, "penaltyConceded")
  const worstPen = Math.max(
    ...[...perTeam.values()].map((t) => avg(t, "penaltyConceded")),
    0
  )
  radar.push({
    axis: "Discipline",
    value: worstPen === 0 ? 100 : Math.round(100 - (ownPen / worstPen) * 100),
    raw: ownPen,
  })

  const schedule: TeamScheduleRow[] = matches
    .filter((m) =>
      [m.red1, m.red2, m.red3, m.blue1, m.blue2, m.blue3].includes(teamId)
    )
    .map((m) => {
      const side: "red" | "blue" = [m.red1, m.red2, m.red3].includes(teamId)
        ? "red"
        : "blue"
      const ownPoints = side === "red" ? m.redPoints : m.bluePoints
      const oppPoints = side === "red" ? m.bluePoints : m.redPoints
      let result: TeamScheduleRow["result"] = null
      if (m.status === "posted" && m.winner) {
        result = m.winner === "tie" ? "tie" : m.winner === side ? "win" : "loss"
      }
      return {
        matchId: m.id,
        label: `${m.type === "qualification" ? "Q" : "P"}${m.number}`,
        side,
        status: m.status,
        ownPoints,
        oppPoints,
        result,
      }
    })

  const rankings = computeRankings(db, event.id)
  const rankRow = rankings.find((r) => r.teamId === teamId) ?? null

  const selection = getSelectionState(db, event.id)
  const myAlliance =
    selection.alliances.find(
      (a) =>
        a.captain?.teamId === teamId || a.picks.some((p) => p.teamId === teamId)
    ) ?? null
  const invite =
    selection.pendingInvite?.team.teamId === teamId
      ? selection.pendingInvite
      : null

  return {
    team: {
      number: team.number,
      name: team.name,
      participants: participants.map((p) => p.name),
    },
    events: events.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      status: e.status,
    })),
    event: {
      id: event.id,
      slug: event.slug,
      name: event.name,
      status: event.status,
    },
    rank: rankRow
      ? {
          rank: rankRow.rank,
          of: rankings.length,
          wins: rankRow.wins,
          losses: rankRow.losses,
          ties: rankRow.ties,
          matchesPlayed: rankRow.matchesPlayed,
          avgRp:
            rankRow.matchesPlayed > 0 ? rankRow.rp / rankRow.matchesPlayed : 0,
        }
      : null,
    radar,
    schedule,
    selectionStatus:
      memberships.find((m) => m.eventId === event.id)?.selectionStatus ??
      "available",
    allianceNumber: myAlliance?.number ?? null,
    invite: invite ? { allianceNumber: invite.allianceNumber } : null,
  }
}
