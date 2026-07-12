export interface Registry<T> {
  register(provider: T): void
  get(name: string): T
}

/** Creates an in-memory provider registry. `kind` is used in the not-found error message. */
export function createRegistry<T extends { readonly name: string }>(kind: string): Registry<T> {
  const providers = new Map<string, T>()
  return {
    register(provider) {
      providers.set(provider.name, provider)
    },
    get(name) {
      const provider = providers.get(name)
      if (!provider) throw new Error(`No ${kind} provider registered for "${name}"`)
      return provider
    },
  }
}
