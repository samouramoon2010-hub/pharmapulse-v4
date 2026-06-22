// ============================================================
// themeStorage — Theme Engine Core (T1-A)
//
// Local-only preference storage for the active T1 theme id.
// Mirrors the existing app convention (settingsStore.js uses
// Zustand's `persist` middleware over localStorage) but stays
// dependency-free and SSR-safe, since the Theme Engine must work
// before any store/provider is mounted.
//
// No backend persistence. No Firestore. Reading/writing never
// throws — private browsing / quota-exceeded / SSR all degrade to
// a safe no-op so the in-memory theme state still works.
// ============================================================

export const THEME_STORAGE_KEY = 'pharmapulse-theme-t1'

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  } catch {
    return false
  }
}

/** Reads the stored theme id, or null if unavailable/unset/inaccessible. Never throws. */
export function loadStoredThemeId(): string | null {
  if (!hasLocalStorage()) return null
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Persists the theme id locally. No-op (never throws) when storage is unavailable. */
export function saveThemeId(id: string): void {
  if (!hasLocalStorage()) return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id)
  } catch {
    // private mode / quota exceeded — in-memory theme state still works
  }
}

/** Clears the stored preference (used by resetTheme()). Never throws. */
export function clearStoredThemeId(): void {
  if (!hasLocalStorage()) return
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
  } catch {
    // ignore
  }
}

// ============================================================
// Appearance preferences (Theme T2-H) — density/radius/font scale
//
// Stored separately from THEME_STORAGE_KEY (additive, not a
// replacement) under its own namespaced key, as a single small JSON
// object: { densityMode, radiusMode, fontScale }. Same SSR-safe,
// never-throws contract as the theme-id functions above. No
// Firestore, no backend persistence, no user-profile write.
// ============================================================

export const APPEARANCE_STORAGE_KEY = 'pharmapulse-appearance-t2'

export interface StoredAppearance {
  densityMode?: string
  radiusMode?: string
  fontScale?: string
}

/** Reads the stored appearance object, or null if unavailable/unset/inaccessible/corrupted. Never throws. */
export function loadStoredAppearance(): StoredAppearance | null {
  if (!hasLocalStorage()) return null
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as StoredAppearance
  } catch {
    return null
  }
}

/** Persists the appearance object locally. No-op (never throws) when storage is unavailable. */
export function saveAppearance(appearance: StoredAppearance): void {
  if (!hasLocalStorage()) return
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
  } catch {
    // private mode / quota exceeded — in-memory state still works
  }
}

/** Clears the stored appearance preferences (used by resetAppearance()). Never throws. */
export function clearStoredAppearance(): void {
  if (!hasLocalStorage()) return
  try {
    window.localStorage.removeItem(APPEARANCE_STORAGE_KEY)
  } catch {
    // ignore
  }
}
