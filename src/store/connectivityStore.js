// ============================================================
// Connectivity Store — Offline First Bundle, Phase A
//
// Thin zustand wrapper around connectivityService so React
// components can subscribe via the usual store hook pattern used
// everywhere else in this app. Holds no business data.
// ============================================================
import { create } from 'zustand'
import { isOnline, subscribeConnectivity } from '../offline/connectivityService'

export const useConnectivityStore = create((set) => {
  subscribeConnectivity((online) => {
    set({ isOnline: online, changedAt: Date.now() })
  })

  return {
    isOnline: isOnline(),
    changedAt: Date.now(),
  }
})
