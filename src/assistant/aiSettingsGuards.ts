// ============================================================
// AI Settings — Guards (Phase 8A)
//
// Role-based access control for AI settings. Mirrors the existing
// Profile Studio guard pattern (persistenceGuards.ts) — pure
// functions, never throw, never touch Firestore.
//
// Only admin may change provider/model/limits. Every authenticated
// role may read whether the assistant is enabled (so the UI can show
// the provider status badge without requiring admin access).
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import type { ProfileStudioRole } from '../profileStudio/persistenceTypes'

/** True when the role may view AI settings. All authenticated roles can. Never throws. */
export function canViewAiSettings(role: ProfileStudioRole): boolean {
  try {
    return !!role
  } catch {
    return false
  }
}

/** True when the role may change AI settings (provider, model, limits). Admin only. Never throws. */
export function canEditAiSettings(role: ProfileStudioRole): boolean {
  try {
    return role === 'admin'
  } catch {
    return false
  }
}

/** True when the role may use the AI-enhanced assistant at all. Same universal read access as the deterministic assistant. Never throws. */
export function canUseAiAssistant(role: ProfileStudioRole): boolean {
  try {
    return !!role
  } catch {
    return false
  }
}
