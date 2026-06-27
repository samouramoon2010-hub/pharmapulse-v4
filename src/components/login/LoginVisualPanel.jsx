// ============================================================
// LoginVisualPanel — PR-1F Gate 2
//
// Renders the approved Login V3 reference artwork (see
// docs/production/LOGIN_V3_DESIGN_LOCK.md) as an optimized image asset
// instead of CSS/SVG. Purely decorative and isolated so it can be
// reused or swapped without touching the login form/auth logic.
// ============================================================
import React from 'react'

export default function LoginVisualPanel() {
  return (
    <div className="lgv3-visual" aria-hidden="true">
      <picture>
        <source media="(max-width: 1023px)" srcSet="/assets/login-v3-visual-mobile.webp" />
        <img
          src="/assets/login-v3-visual-desktop.webp"
          alt=""
          className="lgv3-visual-img"
          width={1106}
          height={1024}
        />
      </picture>
      <div className="lgv3-visual-overlay" />
    </div>
  )
}
