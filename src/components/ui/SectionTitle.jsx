// ============================================================
// SectionTitle — Reusable section header primitive
// Phase: Design Tokens Foundation Lite
//
// Pure presentational. Renders a consistent section title
// with optional subtitle, icon, and right-side action slot.
// ============================================================
import React from 'react'
import { COLORS } from '../../design/tokens'

/**
 * @param {string}          title
 * @param {string}          [subtitle]
 * @param {React.ReactNode} [icon]           - Lucide icon component
 * @param {React.ReactNode} [action]         - Right-side slot (buttons, badges)
 * @param {'caps'|'title'|'heading'} [variant='title']
 * @param {string}          [className]
 */
export default function SectionTitle({
  title,
  subtitle,
  icon: Icon,
  action,
  variant = 'title',
  className = '',
  style = {},
}) {
  const titleStyle = variant === 'caps'
    ? {
        fontSize:      '10px',
        fontWeight:    500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color:         COLORS.textMuted,
        fontFamily:    "'Inter', sans-serif",
      }
    : variant === 'heading'
    ? {
        fontSize:      '15px',
        fontWeight:    600,
        letterSpacing: '-0.02em',
        color:         COLORS.textPrimary,
        fontFamily:    "'Inter', sans-serif",
      }
    : {
        fontSize:      '13px',
        fontWeight:    600,
        letterSpacing: '-0.01em',
        color:         COLORS.textPrimary,
        fontFamily:    "'Inter', sans-serif",
      }

  return (
    <div
      className={`flex items-center justify-between ${className}`}
      style={style}
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon
            style={{ width: 14, height: 14, color: COLORS.textMuted, flexShrink: 0 }}
            strokeWidth={1.75}
          />
        )}
        <div>
          <div style={titleStyle}>{title}</div>
          {subtitle && (
            <div style={{
              fontSize:   '11px',
              color:      COLORS.textMuted,
              marginTop:  '1px',
              fontFamily: "'Inter', sans-serif",
            }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {action && (
        <div className="flex items-center gap-2">
          {action}
        </div>
      )}
    </div>
  )
}
