// ============================================================
// AppCard — Reusable enterprise surface card primitive
// Phase: Design Tokens Foundation Lite
//
// Pure presentational. No business logic.
// Wraps content in a .card or .kpi-card surface with optional
// padding, header, and footer slots.
// ============================================================
import React from 'react'

/**
 * @param {object}  props
 * @param {string}  [props.className]
 * @param {string}  [props.padding='p-4']
 * @param {boolean} [props.hoverable=false]
 * @param {boolean} [props.compact=false]
 * @param {React.ReactNode} [props.header]
 * @param {React.ReactNode} [props.footer]
 * @param {React.ReactNode} props.children
 */
export default function AppCard({
  className  = '',
  padding    = 'p-4',
  hoverable  = false,
  compact    = false,
  header,
  footer,
  children,
  ...rest
}) {
  const base = compact ? 'card card-sm' : 'card card-p'
  const hoverClass = hoverable ? 'card-hover cursor-pointer' : ''
  const pad = padding === 'p-4' ? '' : padding  // card-p already adds p-4

  return (
    <div
      className={`${base} ${hoverClass} ${pad} ${className}`}
      {...rest}
    >
      {header && (
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-[var(--border-subtle)]">
          {header}
        </div>
      )}
      {children}
      {footer && (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
          {footer}
        </div>
      )}
    </div>
  )
}
