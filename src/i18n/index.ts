// ============================================================
// PharmaPulse i18n Foundation — Zero external dependency
// Uses zustand (already installed) for language state.
// Supports: Arabic (ar, rtl) and English (en, ltr).
// Default: Arabic.
//
// Design principles:
//   - No react-i18next, no i18next — keeps bundle flat
//   - Dot-path key access: t('nav.dashboard') → 'لوحة التحكم'
//   - Safe fallback: unknown key returns the key itself
//   - Language persisted via settingsStore (localStorage)
//   - document.dir and document.lang updated reactively
//   - Dynamic KPI labels are NOT translated here — they come
//     from KpiDefinition.labelAr / .label in the registry
//
// Usage:
//   const { t, lang, isRtl } = useI18n()
//   t('common.save')        → 'حفظ'   (when lang='ar')
//   t('common.save')        → 'Save'  (when lang='en')
// ============================================================

import ar from './locales/ar.json'
import en from './locales/en.json'

// ── Supported languages ────────────────────────────────────

export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const
export type  SupportedLang        = typeof SUPPORTED_LANGUAGES[number]

export const LANGUAGE_META: Record<SupportedLang, {
  label:     string
  nativeName:string
  dir:       'rtl' | 'ltr'
  fontClass: string
}> = {
  ar: { label: 'Arabic',  nativeName: 'العربية', dir: 'rtl', fontClass: 'font-arabic' },
  en: { label: 'English', nativeName: 'English', dir: 'ltr', fontClass: '' },
}

// ── Translation dictionaries ───────────────────────────────

const TRANSLATIONS: Record<SupportedLang, Record<string, unknown>> = { ar, en }

// ── Dot-path resolver ──────────────────────────────────────
// t('nav.dashboard') → walks obj['nav']['dashboard']
// Returns the key itself if path not found (safe fallback).

export function translate(lang: SupportedLang, key: string, fallbackLang: SupportedLang = 'ar'): string {
  const dict = TRANSLATIONS[lang] ?? TRANSLATIONS[fallbackLang]
  const parts = key.split('.')

  let node: unknown = dict
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return key
    node = (node as Record<string, unknown>)[part]
  }

  if (typeof node === 'string') return node
  // Fallback to other language before returning key
  if (lang !== fallbackLang) return translate(fallbackLang, key, fallbackLang)
  return key
}

// ── DOM side-effect — apply lang/dir to <html> ─────────────
// Called once on init and on every language change.

export function applyLanguage(lang: SupportedLang): void {
  const meta = LANGUAGE_META[lang] ?? LANGUAGE_META.ar
  document.documentElement.lang = lang
  document.documentElement.dir  = meta.dir
}

// ── Type helpers ───────────────────────────────────────────

export function isSupportedLang(value: unknown): value is SupportedLang {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLang)
}

export function normaliseLang(value: unknown): SupportedLang {
  return isSupportedLang(value) ? value : 'ar'
}
