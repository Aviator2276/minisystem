import { useCallback, useEffect, useRef, useState } from "react"
import type { ServerMessage } from "@/shared/realtime-messages"
import { getRealtimeClient } from "./realtime-client"
import type { ConnectionStatus } from "./realtime-client"

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

/**
 * Live WebSocket connection state plus a manual reconnect. Defaults to "open"
 * so SSR / pre-mount renders stay quiet (gate UI on a mounted flag if needed).
 */
export function useRealtimeStatus(): {
  status: ConnectionStatus
  reconnect: () => void
} {
  const [status, setStatus] = useState<ConnectionStatus>("open")

  useEffect(() => {
    const client = getRealtimeClient()
    setStatus(client.getStatus())
    return client.onStatus(setStatus)
  }, [])

  const reconnect = useCallback(() => getRealtimeClient().reconnect(), [])
  return { status, reconnect }
}
