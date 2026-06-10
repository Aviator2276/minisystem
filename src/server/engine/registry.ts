// process-wide singletons that survive dev-server module duplication/HMR
const registry = globalThis as unknown as Record<string, unknown>

export function getSingleton<T>(key: string, create: () => T): T {
  const fullKey = `__minisystem_${key}`
  if (!(fullKey in registry)) registry[fullKey] = create()
  return registry[fullKey] as T
}
