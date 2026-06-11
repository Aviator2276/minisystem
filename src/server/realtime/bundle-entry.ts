// entry for the standalone realtime bundle (dist/ws/ws.mjs) used by
// server/index.mjs in production. The crossws adapter lives in a globalThis
// singleton, so the main server bundle's publish() reaches the same instance.
export { getWsAdapter } from "./ws"
export { publish } from "./publish"
export { bootstrap } from "@/server/bootstrap"
export { REALTIME_PATH } from "@/shared/realtime-messages"
