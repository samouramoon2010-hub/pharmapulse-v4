// Legacy store — data comes from Firestore users collection
import { create } from 'zustand'
export const useTeamStore = create(() => ({ members: [],
  subscribeMembers: () => () => {}, subscribeAllMembers: () => () => {},
  createMember: async () => {}, updateMember: async () => {}, toggleMember: async () => {},
}))
