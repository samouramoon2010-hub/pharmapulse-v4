// ============================================================
// Connectivity Service — Offline First Bundle, Phase A
//
// Thin wrapper around the browser's online/offline signal. This is
// the single source of truth for "are we online" used by the
// connectivity store, the offline banner, and the sync tracker.
//
// Deliberately does NOT touch Firestore's network state
// (enableNetwork/disableNetwork) — Firestore's own
// persistentLocalCache already manages its connection and queued
// writes independently. This service only observes the browser's
// network signal and notifies subscribers.
// ============================================================

export type ConnectivityListener = (isOnline: boolean) => void

const listeners = new Set<ConnectivityListener>()

function getInitialOnlineState(): boolean {
  // navigator.onLine is undefined in some non-browser test environments —
  // default to true (online) rather than false, so tests/SSR don't get
  // stuck assuming offline with no way to flip it.
  return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
    ? true
    : navigator.onLine
}

let currentlyOnline = getInitialOnlineState()
let initialized = false

function notify() {
  for (const listener of listeners) listener(currentlyOnline)
}

function handleOnline() {
  currentlyOnline = true
  notify()
}

function handleOffline() {
  currentlyOnline = false
  notify()
}

function ensureInitialized() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
}

/** Current online/offline state, read synchronously. */
export function isOnline(): boolean {
  return currentlyOnline
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function subscribeConnectivity(listener: ConnectivityListener): () => void {
  ensureInitialized()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test-only escape hatch — never called from app code. */
export function __setConnectivityForTesting(online: boolean) {
  currentlyOnline = online
  notify()
}
