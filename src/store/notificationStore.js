// ============================================================
// Notification Store — stub (Phase 2: connect to Firestore)
// API is complete so NotificationsPage builds without errors.
// ============================================================
import { create } from 'zustand'

export const useNotificationStore = create(() => ({
  notifications:       [],
  unreadCount:         0,
  fetchNotifications:  () => {},
  markRead:            () => {},
  markAllRead:         () => {},
}))
