// ============================================================
// usePermission — check permissions easily in components
// ============================================================
import { useAuthStore } from '../store/authStore'
import { can, ROLES } from '../constants'

export function usePermission() {
  const { userProfile } = useAuthStore()
  const role = userProfile?.role

  return {
    role,
    isAdmin:        role === ROLES.ADMIN,
    isManager:      role === ROLES.MANAGER,
    isPharmacist:   role === ROLES.PHARMACIST,
    can:            (permission) => can(role, permission),
    isAtLeast:      (minRole) => {
      const order = [ROLES.PHARMACIST, ROLES.MANAGER, ROLES.ADMIN]
      return order.indexOf(role) >= order.indexOf(minRole)
    },
  }
}
