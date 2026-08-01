/**
 * Small typed wrapper around localStorage.
 *
 * Direct access is unsafe during server rendering and throws in private-mode
 * browsers when the quota is exceeded, so every call is guarded here.
 */

const PREFIX = 'codescope_'

export const StorageKeys = {
  /** Pre-0.2 single-thread history. Read once, then migrated and removed. */
  messages: `${PREFIX}messages`,
  repoPath: `${PREFIX}repo_path`,
  conversations: `${PREFIX}conversations`,
  activeConversation: `${PREFIX}active_conversation`,
} as const

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled; persistence is best-effort.
  }
}

export function readString(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function writeString(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore: see writeJson.
  }
}

export function removeKey(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore: see writeJson.
  }
}
