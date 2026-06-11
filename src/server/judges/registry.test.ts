import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ServerMessage } from "@/shared/realtime-messages"
import { JudgeRegistry } from "./registry"

let registry: JudgeRegistry
let published: Array<{ eventId: string; message: ServerMessage }>
const EVENT = "e1"

beforeEach(() => {
  vi.useFakeTimers()
  published = []
  registry = new JudgeRegistry((eventId, _to, message) =>
    published.push({ eventId, message })
  )
})

afterEach(() => vi.useRealTimers())

function judgesUpdates() {
  return published.filter((p) => p.message.type === "judges_update")
}

describe("JudgeRegistry", () => {
  it("counts active judges and tracks per-match submission", () => {
    registry.checkIn(EVENT, "a", "red")
    registry.checkIn(EVENT, "b", "blue")
    expect(registry.status(EVENT).active).toBe(2)

    registry.submit(EVENT, "a", "m1")
    const status = registry.status(EVENT)
    const submitted = status.judges.filter((j) => j.submittedMatchId === "m1")
    expect(submitted).toHaveLength(1)
    expect(submitted[0].alliance).toBe("red")
  })

  it("clears a submission when the judge resumes", () => {
    registry.checkIn(EVENT, "a", "red")
    registry.submit(EVENT, "a", "m1")
    registry.resume(EVENT, "a")
    expect(
      registry.status(EVENT).judges.every((j) => j.submittedMatchId === null)
    ).toBe(true)
  })

  it("prunes judges that stop heartbeating after the TTL", () => {
    registry.checkIn(EVENT, "a", "red")
    registry.checkIn(EVENT, "b", "blue")

    vi.advanceTimersByTime(5000)
    registry.heartbeat(EVENT, "a") // a stays alive, b goes quiet

    vi.advanceTimersByTime(8000) // a: 8s since beat, b: 13s since check-in
    const status = registry.status(EVENT)
    expect(status.active).toBe(1)
  })

  it("removes a judge that leaves", () => {
    registry.checkIn(EVENT, "a", "red")
    registry.leave(EVENT, "a")
    expect(registry.status(EVENT).active).toBe(0)
  })

  it("publishes to control only when the status changes", () => {
    registry.checkIn(EVENT, "a", "red")
    const afterCheckIn = judgesUpdates().length
    expect(afterCheckIn).toBeGreaterThan(0)
    expect(published.every((p) => p.eventId === EVENT)).toBe(true)

    // a heartbeat that changes nothing should not re-broadcast
    registry.heartbeat(EVENT, "a")
    expect(judgesUpdates().length).toBe(afterCheckIn)

    // a submission changes the status and broadcasts
    registry.submit(EVENT, "a", "m1")
    expect(judgesUpdates().length).toBe(afterCheckIn + 1)
  })
})
