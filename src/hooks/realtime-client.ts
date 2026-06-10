// shared WebSocket client: one socket per tab, topic refcounting, reconnect
// with backoff, resubscribe on reconnect. The single client-side seam to swap
// transports (see src/server/realtime/publish.ts for the server seam).
import { REALTIME_PATH, serverMessageSchema } from "@/shared/realtime-messages"
import type { ServerMessage } from "@/shared/realtime-messages"

type Listener = (message: ServerMessage) => void

class RealtimeClient {
  private socket: WebSocket | null = null
  private listeners = new Set<Listener>()
  private topicCounts = new Map<string, number>()
  private reconnectDelay = 500
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private ensureSocket() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const socket = new WebSocket(
      `${protocol}//${window.location.host}${REALTIME_PATH}`
    )
    this.socket = socket

    socket.addEventListener("open", () => {
      this.reconnectDelay = 500
      const topics = [...this.topicCounts.keys()]
      if (topics.length > 0)
        socket.send(JSON.stringify({ type: "subscribe", topics }))
    })
    socket.addEventListener("message", (event) => {
      let json: unknown
      try {
        json = JSON.parse(event.data as string)
      } catch {
        return
      }
      const parsed = serverMessageSchema.safeParse(json)
      if (!parsed.success) return
      for (const listener of this.listeners) listener(parsed.data)
    })
    socket.addEventListener("close", () => {
      this.socket = null
      if (this.listeners.size === 0 && this.topicCounts.size === 0) return
      this.reconnectTimer ??= setTimeout(() => {
        this.reconnectTimer = null
        this.ensureSocket()
      }, this.reconnectDelay)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000)
    })
  }

  private sendWhenOpen(payload: object) {
    this.ensureSocket()
    const socket = this.socket
    if (!socket) return
    const data = JSON.stringify(payload)
    if (socket.readyState === WebSocket.OPEN) socket.send(data)
    else
      socket.addEventListener("open", () => socket.send(data), { once: true })
  }

  addListener(listener: Listener) {
    this.listeners.add(listener)
    this.ensureSocket()
  }

  removeListener(listener: Listener) {
    this.listeners.delete(listener)
  }

  subscribe(topics: string[]) {
    const fresh = topics.filter((t) => {
      const count = this.topicCounts.get(t) ?? 0
      this.topicCounts.set(t, count + 1)
      return count === 0
    })
    if (fresh.length > 0)
      this.sendWhenOpen({ type: "subscribe", topics: fresh })
  }

  unsubscribe(topics: string[]) {
    const stale = topics.filter((t) => {
      const count = (this.topicCounts.get(t) ?? 1) - 1
      if (count <= 0) {
        this.topicCounts.delete(t)
        return true
      }
      this.topicCounts.set(t, count)
      return false
    })
    if (stale.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "unsubscribe", topics: stale }))
    }
  }

  ping() {
    this.sendWhenOpen({ type: "ping", sentAt: Date.now() })
  }
}

let client: RealtimeClient | null = null

export function getRealtimeClient(): RealtimeClient {
  client ??= new RealtimeClient()
  return client
}
