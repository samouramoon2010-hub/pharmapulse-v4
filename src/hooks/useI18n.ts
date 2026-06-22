// ============================================================
// useI18n — React hook for translation + language state
//
// Returns:
//   t(key)    — translate a dot-path key for the current language
//   lang      — current language code ('ar' | 'en')
//   isRtl     — true when lang === 'ar'
//   setLang   — change language (persisted via settingsStore)
//   dir       — 'rtl' | 'ltr'
//   langMeta  — { label, nativeName, dir, fontClass }
//
// No external i18n library. Zero new bundle weight.
// ============================================================
import { useCallback } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { translate, LANGUAGE_META, normaliseLang } from '../i18n/index'
import type { SupportedLang } from '../i18n/index'

export function useI18n() {
  const language   = useSettingsStore((s) => s.language as SupportedLang)
  const setLanguage = useSettingsStore((s) => s.setLanguage)

  const lang     = normaliseLang(language)
  const langMeta = LANGUAGE_META[lang]
  const isRtl    = langMeta.dir === 'rtl'

  const t = useCallback(
    (key: string): string => translate(lang, key),
    [lang],
  )

  return { t, lang, isRtl, dir: langMeta.dir, langMeta, setLang: setLanguage }
}
