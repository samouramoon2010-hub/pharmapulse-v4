// ============================================================
// useAutoLogout — logout after N minutes of inactivity
// ============================================================
import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'

const TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

export function useAutoLogout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const timer = useRef(null)

  const reset = () => {
    clearTimeout(timer.current)
    if (!user) return
    timer.current = setTimeout(async () => {
      await logout()
      navigate('/login?reason=timeout')
    }, TIMEOUT_MS)
  }

  useEffect(() => {
    if (!user) return
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer.current)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [user])
}
