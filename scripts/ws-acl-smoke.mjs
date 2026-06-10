// ACL check: an unauthenticated client subscribing to the admin-only control
// topic must NOT receive control publishes, while public ones arrive.
const base = process.argv[2] ?? "http://localhost:3100"
const wsUrl = base.replace(/^http/, "ws") + "/_ws"

const socket = new WebSocket(wsUrl)
const received = []
socket.addEventListener("open", () => {
  socket.send(JSON.stringify({ type: "subscribe", topics: ["event:debug:control", "event:debug:public"] }))
})
socket.addEventListener("message", (e) => received.push(JSON.parse(e.data)))

await new Promise((r) => setTimeout(r, 500))
await fetch(`${base}/__debug-publish?eventId=debug&channel=control&message=secret`)
await fetch(`${base}/__debug-publish?eventId=debug&channel=public&message=open`)
await new Promise((r) => setTimeout(r, 1000))
socket.close()

const messages = received.map((m) => m.message)
if (messages.includes("secret")) throw new Error(`ACL FAIL: unauthenticated client received control message`)
if (!messages.includes("open")) throw new Error(`expected public message, got ${JSON.stringify(messages)}`)
console.log(`received: ${JSON.stringify(messages)}`)
console.log("WS ACL PASS")
