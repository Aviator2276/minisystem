import { useEffect, useRef, useState } from "react"
import type { ServerMessage } from "@/shared/realtime-messages"
import { getRealtimeClient } from "./realtime-client"

const SAMPLES = 5

/**
 * Estimates the offset between the server clock and this device via ping/pong
 * round-trips (median of 5). `now()` returns the estimated server epoch ms;
 * countdown UIs render absolute `phaseEndsAt` deadlines against it.
 */
export function useServerClock(): {
  offset: number
  ready: boolean
  now: () => number
} {
  const [offset, setOffset] = useState(0)
  const [ready, setReady] = useState(false)
  const samples = useRef<number[]>([])

  useEffect(() => {
    if (typeof window === "undefined") return
    const client = getRealtimeClient()

    const listener = (message: ServerMessage) => {
      if (message.type !== "pong") return
      const rtt = Date.now() - message.sentAt
      samples.current.push(message.serverNow + rtt / 2 - Date.now())
      if (samples.current.length >= SAMPLES) {
        const sorted = [...samples.current].sort((a, b) => a - b)
        setOffset(sorted[Math.floor(sorted.length / 2)])
        setReady(true)
      }
    }
    client.addListener(listener)

    samples.current = []
    let sent = 0
    const interval = setInterval(() => {
      client.ping()
      if (++sent >= SAMPLES) clearInterval(interval)
    }, 200)

    return () => {
      clearInterval(interval)
      client.removeListener(listener)
    }
  }, [])

  return { offset, ready, now: () => Date.now() + offset }
}
