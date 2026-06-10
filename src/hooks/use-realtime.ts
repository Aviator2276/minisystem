import { useEffect, useRef } from "react"
import type { ServerMessage } from "@/shared/realtime-messages"
import { getRealtimeClient } from "./realtime-client"

export function useRealtime(
  topics: string[],
  onMessage: (message: ServerMessage) => void
): void {
  const handler = useRef(onMessage)
  handler.current = onMessage
  const key = topics.join(",")

  useEffect(() => {
    if (typeof window === "undefined" || key === "") return
    const client = getRealtimeClient()
    const subscribed = key.split(",")
    const listener = (message: ServerMessage) => handler.current(message)
    client.addListener(listener)
    client.subscribe(subscribed)
    return () => {
      client.unsubscribe(subscribed)
      client.removeListener(listener)
    }
  }, [key])
}
