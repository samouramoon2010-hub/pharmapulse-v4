// Legacy store — use kpiStore instead  
import { create } from 'zustand'
export const useTargetStore = create(() => ({ targets: [],
  subscribeAllTargets: () => () => {}, createTarget: async () => {},
  updateTarget: async () => {}, deleteTarget: async () => {},
}))
