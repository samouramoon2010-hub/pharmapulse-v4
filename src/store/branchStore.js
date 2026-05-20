// Legacy store — use pharmacyStore instead
import { create } from 'zustand'
export const useBranchStore = create(() => ({ branches: [], loading: false,
  subscribeBranches: () => () => {},
  createBranch: async () => {}, updateBranch: async () => {},
  toggleBranch: async () => {}, deleteBranch: async () => {},
}))
