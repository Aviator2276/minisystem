import { db } from "@/db"
import { getSingleton } from "@/server/engine/registry"
import { publish } from "@/server/realtime/publish"
import { ViewRotator } from "./rotator"

export function getViewRotator(): ViewRotator {
  return getSingleton("view_rotator", () => new ViewRotator(db, publish))
}
