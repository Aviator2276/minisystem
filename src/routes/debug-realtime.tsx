import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { Button } from "@/components/ui/button"
import { useRealtime } from "@/hooks/use-realtime"
import { useServerClock } from "@/hooks/use-server-clock"
import { topicFor } from "@/shared/realtime-messages"
import { debugPublish } from "@/server/functions/realtime-debug"

export const Route = createFileRoute("/debug-realtime")({
  component: DebugRealtime,
})

// throwaway P8 verification panel: open two tabs, publish in one, observe both
function DebugRealtime() {
  const [eventId, setEventId] = useState("debug")
  const [log, setLog] = useState<string[]>([])
  const clock = useServerClock()
  const publish = useServerFn(debugPublish)

  useRealtime([topicFor(eventId, "public")], (message) => {
    setLog((prev) =>
      [`${new Date().toISOString()} ${JSON.stringify(message)}`, ...prev].slice(
        0,
        50
      )
    )
  })

  return (
    <main className="container mx-auto flex flex-col gap-4 p-6 font-mono text-xs">
      <h1 className="font-medium">Realtime debug</h1>
      <p>
        clock offset:{" "}
        {clock.ready ? `${clock.offset.toFixed(1)}ms` : "measuring…"} · server
        now: {new Date(clock.now()).toISOString()}
      </p>
      <div className="flex items-center gap-2">
        <input
          className="border border-input bg-transparent px-2 py-1"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          aria-label="event id"
        />
        <Button
          onClick={() =>
            publish({ data: { eventId, message: `hello @ ${Date.now()}` } })
          }
        >
          Publish test message
        </Button>
      </div>
      <ol className="flex flex-col gap-1">
        {log.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </main>
  )
}
