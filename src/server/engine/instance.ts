import { db } from "@/db"
import { publish } from "@/server/realtime/publish"
import { MatchEngine } from "./match-engine"
import { getSingleton } from "./registry"

export function getMatchEngine(): MatchEngine {
  return getSingleton("match_engine", () => new MatchEngine(db, publish))
}
