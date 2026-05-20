// ============================================================
// Settings Store — persisted in localStorage
// ============================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULTS = {
  theme: 'dark',               // 'dark' | 'light'
  language: 'ar',              // 'ar' | 'en'
  compactMode: false,
  autoUpdate: true,
  notifications: {
    kpiReminder: true,
    targetAlert: true,
    weeklyReport: false,
    branchAlerts: true,
  },
}

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setTheme: (theme) => {
        set({ theme })
        document.documentElement.classList.toggle('light', theme === 'light')
      },

      setLanguage: (language) => set({ language }),

      setCompactMode: (compactMode) => set({ compactMode }),

      setAutoUpdate: (autoUpdate) => set({ autoUpdate }),

      setNotification: (key, value) =>
        set((s) => ({ notifications: { ...s.notifications, [key]: value } })),

      resetToDefaults: () => set(DEFAULTS),
    }),
    {
      name: 'pharma-settings',
    }
  )
)
