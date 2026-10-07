import type { StorageAdapter } from './types'

const web = (name: 'localStorage' | 'sessionStorage'): StorageAdapter => ({
  get: (k) => {
    try {
      return globalThis[name]?.getItem(k) ?? null
    } catch {
      return null
    }
  },
  // May throw QuotaExceededError; persist handles it.
  set: (k, v) => globalThis[name]?.setItem(k, v),
  remove: (k) => {
    try {
      globalThis[name]?.removeItem(k)
    } catch {}
  },
})

/** Default. Survives refresh and browser restart. Readable by any script on your origin. */
export const localStorageAdapter = (): StorageAdapter => web('localStorage')

/** Survives refresh, cleared when the tab closes. */
export const sessionStorageAdapter = (): StorageAdapter => web('sessionStorage')

/** In-memory only (tests, SSR, `persist={false}`). */
export const memoryStorage = (): StorageAdapter => {
  const m = new Map<string, string>()
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      m.set(k, v)
    },
    remove: (k) => {
      m.delete(k)
    },
  }
}
