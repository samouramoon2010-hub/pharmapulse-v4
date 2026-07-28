// ============================================================
// Personal AI Key Store (BYOK)
//
// Persists PersonalAiSettings to localStorage ONLY — never to
// Firestore, never to any backend, never transmitted anywhere except
// directly to the chosen provider's own API when the user asks a
// question. Scoped per browser profile, so each user's key only
// ever lives on their own device.
//
// No Firestore. No React. No network calls.
// ============================================================

import type { PersonalAiSettings } from './personalAiSettingsTypes'

const STORAGE_KEY = 'pharmapulse.personalAiSettings.v1'

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

/** Returns the saved personal AI settings, or null if none are stored / storage is unavailable. */
export function loadPersonalAiSettings(): PersonalAiSettings | null {
  try {
    const storage = getLocalStorage()
    if (!storage) return null
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.provider !== 'string' || typeof parsed.model !== 'string') return null
    return {
      provider: parsed.provider,
      model:    parsed.model,
      apiKey:   typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      enabled:  Boolean(parsed.enabled),
    }
  } catch {
    return null
  }
}

/** Saves personal AI settings to this browser only. Never throws. */
export function savePersonalAiSettings(settings: PersonalAiSettings): boolean {
  try {
    const storage = getLocalStorage()
    if (!storage) return false
    storage.setItem(STORAGE_KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

/** Removes the stored personal AI settings (and the key) from this browser. Never throws. */
export function clearPersonalAiSettings(): boolean {
  try {
    const storage = getLocalStorage()
    if (!storage) return false
    storage.removeItem(STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
