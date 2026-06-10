import type { GameDefinition } from "./types"
import { stronghold } from "./stronghold"

// registry keyed by events.gameId; generic code never names game concepts
const games: Record<string, GameDefinition<unknown> | undefined> = {
  [stronghold.id]: stronghold as unknown as GameDefinition<unknown>,
}

export function getGame(gameId: string): GameDefinition<unknown> {
  const game = games[gameId]
  if (!game) throw new Error(`Unknown game: ${gameId}`)
  return game
}
