import { publish } from "@/server/realtime/publish"
import { getSingleton } from "@/server/engine/registry"
import { JudgeRegistry } from "./registry"

export function getJudgeRegistry(): JudgeRegistry {
  return getSingleton("judge_registry", () => new JudgeRegistry(publish))
}
