// P8 smoke test: two WS clients subscribe to event:debug:public, an HTTP
// trigger publishes, both clients must receive it; also checks ping/pong.
// Usage: node scripts/ws-smoke.mjs [baseUrl]
const base = process.argv[2] ?? "http://localhost:3000"
const wsUrl = base.replace(/^http/, "ws") + "/_ws"

function client(name) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const received = []
    let pongOk = false
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "subscribe", topics: ["event:debug:public"] }))
      socket.send(JSON.stringify({ type: "ping", sentAt: Date.now() }))
    })
    socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === "pong") pongOk = true
      if (msg.type === "toast") received.push(msg.message)
      if (pongOk && received.length > 0) {
        socket.close()
        resolve({ name, pongOk, received })
      }
    })
    socket.addEventListener("error", (e) => reject(new Error(`${name}: ${e.message ?? "ws error"}`)))
    setTimeout(() => reject(new Error(`${name}: timeout (pong=${pongOk}, toasts=${received.length})`)), 8000)
  })
}

const clients = Promise.all([client("A"), client("B")])
await new Promise((r) => setTimeout(r, 500)) // let both subscribe
const res = await fetch(`${base}/__debug-publish?eventId=debug&message=smoke-${Date.now()}`)
if (!res.ok) throw new Error(`publish trigger failed: ${res.status}`)
const results = await clients
for (const r of results) {
  console.log(`client ${r.name}: pong=${r.pongOk} received=${JSON.stringify(r.received)}`)
}
console.log("WS SMOKE PASS")
