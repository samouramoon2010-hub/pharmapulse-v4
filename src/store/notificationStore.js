import { create } from 'zustand'
export const useNotificationStore = create(() => ({
  notifications: [],
  unreadCount:   0,
  fetchNotifications: () => {},
}))
