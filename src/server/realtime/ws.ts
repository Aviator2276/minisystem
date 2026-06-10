import nodeAdapter from "crossws/adapters/node"
import type { NodeAdapter } from "crossws/adapters/node"
import type { Peer } from "crossws"
import { getSingleton } from "@/server/engine/registry"
import { SESSION_COOKIE, getSessionUser } from "@/server/auth/session"
import type { SessionUser } from "@/server/auth/session"
import { clientMessageSchema } from "@/shared/realtime-messages"
import type { Channel } from "@/shared/realtime-messages"

const peerUsers = new WeakMap<Peer, SessionUser | null>()

function cookieValue(
  header: string | null | undefined,
  name: string
): string | undefined {
  if (!header) return undefined
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return rest.join("=")
  }
  return undefined
}

function channelOf(topic: string): Channel | null {
  const match = /^event:[^:]+:(display|control|judge|public)$/.exec(topic)
  const channel = match?.[1]
  return channel ? (channel as Channel) : null
}

function mayJoin(user: SessionUser | null, topic: string): boolean {
  const channel = channelOf(topic)
  if (!channel) return false
  if (channel === "public") return true
  if (!user) return false
  if (channel === "control") return user.role === "admin"
  return true // display + judge: any authenticated user
}

export function getWsAdapter(): NodeAdapter {
  return getSingleton("ws_adapter", () =>
    nodeAdapter({
      hooks: {
        open(peer) {
          const token = cookieValue(
            peer.request.headers.get("cookie"),
            SESSION_COOKIE
          )
          peerUsers.set(peer, getSessionUser(token))
        },
        message(peer, message) {
          const parsed = clientMessageSchema.safeParse(message.json())
          if (!parsed.success) return
          const msg = parsed.data
          switch (msg.type) {
            case "subscribe": {
              const user = peerUsers.get(peer) ?? null
              for (const topic of msg.topics) {
                if (mayJoin(user, topic)) peer.subscribe(topic)
              }
              break
            }
            case "unsubscribe":
              for (const topic of msg.topics) peer.unsubscribe(topic)
              break
            case "ping":
              peer.send(
                JSON.stringify({
                  type: "pong",
                  sentAt: msg.sentAt,
                  serverNow: Date.now(),
                })
              )
              break
          }
        },
      },
    })
  )
}
