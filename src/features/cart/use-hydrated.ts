import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * Returns `false` on the server and on the initial client render, then `true`
 * once the client has committed at least one render. Use this to gate any UI
 * derived from persisted client state (e.g. localStorage-backed stores) so
 * the server-rendered markup matches the initial client render and React
 * does not report a hydration mismatch.
 *
 * Implemented with `useSyncExternalStore`'s `getServerSnapshot` param, which
 * is the React-recommended way to express "differs between server and
 * client" without calling `setState` inside an effect body.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
