// ============================================================
// Heatmap — CSS Grid Heatmap Primitive
// Phase 4B-1B-γ: Interaction Layer
//
// Added in this phase:
//   1. KPI column sort (click header → asc → desc → reset)
//   2. Sticky header row + sticky branch-name column
//   3. Active row/column focus highlight (hover + click)
//   4. Full cell meta passed to onCellClick
//   5. Selected-cell detail panel below heatmap
//   6. Sort indicator on active column header
//
// Preserved from Phase β:
//   - Portal tooltip (fixed position, document.body)
//   - CSS Grid layout
//   - All empty-cell state rendering
//   - Legend bar
//   - maxRows trim with notice
//   - No Firestore, no Recharts, no Canvas
// ============================================================
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

// ── Achievement threshold config ──────────────────────────────
const THRESHOLDS = {
  outperform: 105,
  onTarget:    95,
  warning:     85,
}

const CELL_CFG = {
  outperform: { bg: 'rgba(34,197,94,0.18)',  border: 'rgba(34,197,94,0.30)',  fg: '#22c55e', label: '⬆', statusLabel: 'Outperform' },
  onTarget:   { bg: 'rgba(0,210,173,0.18)',  border: 'rgba(0,210,173,0.30)',  fg: '#00d2ad', label: '✓', statusLabel: 'On Target'  },
  warning:    { bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.30)', fg: '#f59e0b', label: '!', statusLabel: 'Warning'    },
  critical:   { bg: 'rgba(239,68,68,0.18)',  border: 'rgba(239,68,68,0.30)',  fg: '#ef4444', label: '✕', statusLabel: 'Critical'   },
}

const EMPTY_CFG = {
  NO_DATA:        { bg: 'rgba(71,85,105,0.08)',  border: 'rgba(71,85,105,0.18)',  fg: '#475569', label: '—',   striped: true,  statusLabel: 'No Data'         },
  ZERO_VALUE:     { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)',  fg: '#ef4444', label: '0',   striped: false, statusLabel: 'Zero Value'      },
  NOT_APPLICABLE: { bg: 'rgba(82,82,91,0.08)',   border: 'rgba(82,82,91,0.16)',   fg: '#52525b', label: 'N/A', striped: false, statusLabel: 'N/A'             },
  NOT_AGGREGATED: { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.20)', fg: '#818cf8', label: '…',   striped: true,  statusLabel: 'Not Aggregated'  },
}

function resolveCellStyle(cell) {
  if (cell.value === null || cell.emptyCellState) {
    return EMPTY_CFG[cell.emptyCellState] ?? EMPTY_CFG.NO_DATA
  }
  const v = cell.value
  if (v >= THRESHOLDS.outperform) return CELL_CFG.outperform
  if (v >= THRESHOLDS.onTarget)   return CELL_CFG.onTarget
  if (v >= THRESHOLDS.warning)    return CELL_CFG.warning
  return CELL_CFG.critical
}

const STRIPE_BG = `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5 0L0 5M6 4L4 6M1 0L0 1' stroke='rgba(255,255,255,0.07)' stroke-width='1'/%3E%3C/svg%3E")`

// ── Branch label formatter ────────────────────────────────────
// Produces "5074 - الأثير" when branchCode available,
// or just "الأثير" as fallback.
function formatBranchLabel(name, code) {
  if (code && code.trim()) return `${code} - ${name}`
  return name
}

// ── Portal Tooltip (unchanged from Phase β) ──────────────────

const TOOLTIP_OFFSET_X = 12
const TOOLTIP_OFFSET_Y = -12

function CellTooltip({ cell, cfg, anchorRect }) {
  const tooltipRef = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!anchorRect || !tooltipRef.current) return
    const ttRect = tooltipRef.current.getBoundingClientRect()
    const vw = window.innerWidth

    let left = anchorRect.left + anchorRect.width / 2 + TOOLTIP_OFFSET_X
    let top  = anchorRect.top + TOOLTIP_OFFSET_Y - ttRect.height

    if (left + ttRect.width > vw - 8) left = vw - ttRect.width - 8
    if (left < 8) left = 8
    if (top < 8) top = anchorRect.bottom + 8

    setPos({ top, left })
  }, [anchorRect])

  const branchName = formatBranchLabel(cell.meta?.branchName ?? cell.row, cell.meta?.branchCode)
  const kpiLabel   = cell.meta?.kpiLabel   ?? cell.col
  const actual     = cell.meta?.actual
  const target     = cell.meta?.target
  const hasTarget  = cell.meta?.hasTarget

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      style={{
        position: 'fixed',
        top:  pos.top,
        left: pos.left,
        zIndex: 9999,
        background: 'var(--bg-overlay, #222226)',
        border: '1px solid var(--border-default, rgba(255,255,255,0.09))',
        borderRadius: '8px', padding: '8px 12px',
        minWidth: '160px', maxWidth: '220px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
        pointerEvents: 'none',
        visibility: pos.top === 0 && pos.left === 0 ? 'hidden' : 'visible',
        transition: 'opacity 0.08s',
      }}
    >
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary, #fafafa)', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {branchName}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', marginBottom: '6px' }}>{kpiLabel}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>Achievement</span>
        <span style={{ fontSize: '12px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: cfg.fg }}>
          {cell.value !== null ? `${Math.round(cell.value)}%` : cfg.label}
        </span>
      </div>
      {actual !== null && actual !== undefined && (
        <div style={{ marginTop: '3px', fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>
          {hasTarget ? `${actual?.toLocaleString()} / ${target?.toLocaleString()}` : `${actual?.toLocaleString()} (no target)`}
        </div>
      )}
      <div style={{ marginTop: '5px', fontSize: '10px', fontWeight: 500, color: cfg.fg }}>{cfg.statusLabel}</div>
      <div style={{ marginTop: '4px', fontSize: '9px', color: 'var(--text-muted, #64748b)', fontStyle: 'italic' }}>
        Click to inspect branch metrics
      </div>
    </div>,
    document.body,
  )
}

// ── Legend ────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { key: 'outperform', ...CELL_CFG.outperform, label: '≥105%' },
  { key: 'onTarget',   ...CELL_CFG.onTarget,   label: '95–104%' },
  { key: 'warning',    ...CELL_CFG.warning,     label: '85–94%' },
  { key: 'critical',   ...CELL_CFG.critical,    label: '<85%'   },
  { key: 'noData',     ...EMPTY_CFG.NO_DATA,    label: 'No Data',        special: true },
  { key: 'notAgg',     ...EMPTY_CFG.NOT_AGGREGATED, label: 'Not Aggregated', special: true },
]

function Legend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }} aria-label="Heatmap color legend">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{
            width: 14, height: 14, borderRadius: '3px',
            backgroundColor: item.bg,
            backgroundImage: item.striped ? STRIPE_BG : 'none',
            border: `1px solid ${item.border}`, flexShrink: 0,
          }} aria-hidden="true" />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Selected-cell detail panel ────────────────────────────────

function SelectedCellPanel({ cell, onDismiss }) {
  if (!cell) return null
  const cfg        = resolveCellStyle(cell)
  const branchName  = formatBranchLabel(cell.meta?.branchName ?? cell.row, cell.meta?.branchCode)
  const kpiLabel    = cell.meta?.kpiLabel   ?? cell.col
  const actual      = cell.meta?.actual
  const target      = cell.meta?.target
  const hasTarget   = cell.meta?.hasTarget
  const riskLevel   = cell.meta?.riskLevel
  const branchScore = cell.meta?.branchScore

  return (
    <div
      data-testid="selected-cell-panel"
      style={{
        marginTop: '12px',
        padding: '12px 14px',
        borderRadius: '8px',
        background: 'var(--bg-elevated, #1c1c20)',
        border: `1px solid ${cfg.fg}22`,
        display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start',
      }}
    >
      {/* Identity */}
      <div style={{ flex: '1 1 180px' }}>
        <div style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '3px' }}>
          Selected
        </div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #fafafa)' }}>{branchName}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{kpiLabel}</div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {cell.value !== null && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: cfg.fg, lineHeight: 1 }}>
              {Math.round(cell.value)}%
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>Achievement</div>
          </div>
        )}
        {actual !== null && actual !== undefined && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary, #a1a1aa)', lineHeight: 1 }}>
              {actual?.toLocaleString()}
              {hasTarget && target !== null && ` / ${target?.toLocaleString()}`}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {hasTarget ? 'Actual / Target' : 'Actual'}
            </div>
          </div>
        )}
        {branchScore !== null && branchScore !== undefined && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', lineHeight: 1 }}>
              {branchScore}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>Branch Score</div>
          </div>
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 500, color: cfg.fg }}>{cfg.statusLabel}</div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>Status</div>
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        aria-label="Dismiss selected cell"
        data-testid="dismiss-selected-cell"
        style={{
          marginLeft: 'auto', background: 'transparent', border: 'none',
          cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px',
          lineHeight: 1, padding: '2px 4px', alignSelf: 'flex-start',
        }}
      >×</button>
    </div>
  )
}

// ── Single cell (with row/col focus awareness) ────────────────

function HeatmapCell({ cell, cellSize, onCellClick, isActiveRow, isActiveCol }) {
  const [hovered,    setHovered]    = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const cellRef = useRef(null)
  const cfg = resolveCellStyle(cell)

  const handleEnter = useCallback(() => {
    if (cellRef.current) setAnchorRect(cellRef.current.getBoundingClientRect())
    setHovered(true)
  }, [])

  const handleLeave = useCallback(() => {
    setHovered(false)
    setAnchorRect(null)
  }, [])

  // Focus highlight: active row/col dims non-active cells slightly
  const isFocused = isActiveRow || isActiveCol
  const dimmed    = (isActiveRow !== null || isActiveCol !== null) && !isFocused

  const displayValue = cell.value !== null ? `${Math.round(cell.value)}%` : cfg.label

  return (
    <div
      ref={cellRef}
      role="gridcell"
      aria-label={`${formatBranchLabel(cell.meta?.branchName ?? cell.row, cell.meta?.branchCode)}, ${cell.meta?.kpiLabel ?? cell.col}: ${cfg.statusLabel}${cell.value !== null ? ` ${Math.round(cell.value)}%` : ''}`}
      tabIndex={0}
      onClick={() => onCellClick?.(cell)}
      onKeyDown={(e) => e.key === 'Enter' && onCellClick?.(cell)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      data-row={cell.row}
      data-col={cell.col}
      style={{
        position: 'relative',
        width: cellSize, height: cellSize,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: cfg.bg,
        backgroundImage: cfg.striped ? STRIPE_BG : 'none',
        border: `1px solid ${isFocused ? cfg.fg + '55' : cfg.border}`,
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'opacity 0.1s, transform 0.1s, border-color 0.1s',
        opacity: dimmed ? 0.35 : hovered ? 0.9 : 1,
        transform: hovered ? 'scale(1.08)' : 'scale(1)',
        outline: hovered ? `2px solid ${cfg.fg}` : 'none',
        outlineOffset: '1px',
        zIndex: hovered ? 10 : isFocused ? 3 : 1,
        // Subtle row/col highlight ring
        boxShadow: isFocused && !hovered ? `0 0 0 1px ${cfg.fg}33` : 'none',
      }}
    >
      {cellSize >= 36 && (
        <span style={{
          fontSize: cellSize >= 48 ? '11px' : '9px',
          fontWeight: 600, color: cfg.fg,
          fontVariantNumeric: 'tabular-nums',
          userSelect: 'none', lineHeight: 1,
        }}>
          {displayValue}
        </span>
      )}

      {hovered && anchorRect && (
        <CellTooltip cell={cell} cfg={cfg} anchorRect={anchorRect} />
      )}
    </div>
  )
}

// ── Sort helpers ──────────────────────────────────────────────

// Sort direction cycle: null → 'asc' → 'desc' → null
function nextSortDir(current) {
  if (!current)       return 'asc'
  if (current === 'asc')  return 'desc'
  return null  // reset
}

// Get cell value for a given (rowKey, colKey) from the cellMap
function getCellValue(cellMap, rowKey, colKey) {
  return cellMap[`${rowKey}::${colKey}`]?.value ?? null
}

// Sort rowKeys by achievement for a given colKey.
// Null values always go last regardless of direction.
function sortRowsByCol(rowKeys, colKey, cellMap, direction) {
  if (!direction) return rowKeys  // no sort — return input order (never mutate)
  return [...rowKeys].sort((a, b) => {
    const va = getCellValue(cellMap, a, colKey)
    const vb = getCellValue(cellMap, b, colKey)
    // Nulls always last
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    return direction === 'asc' ? va - vb : vb - va
  })
}

// ── Main Heatmap component ────────────────────────────────────

/**
 * Heatmap — CSS Grid Heatmap with interaction layer
 *
 * @param matrix       - Canonical HeatmapMatrix from heatmapSelectors
 * @param title        - Optional section title
 * @param cellSize     - Cell width/height in px (default 42)
 * @param maxRows      - Clamp to N rows (default 20)
 * @param onCellClick  - Optional click handler, receives full cell + meta
 * @param showLegend   - Show legend bar (default true)
 * @param className    - Optional wrapper className
 */
export default function Heatmap({
  matrix,
  title,
  cellSize   = 42,
  maxRows    = 20,
  onCellClick,
  showLegend = true,
  className  = '',
}) {
  // ── Sort state — column key + direction (never mutates matrix) ─
  const [sortCol, setSortCol] = useState(null)    // colKey string | null
  const [sortDir, setSortDir] = useState(null)    // 'asc' | 'desc' | null

  // ── Focus state — active row/col for cross-highlight ──────────
  const [activeRow, setActiveRow] = useState(null)
  const [activeCol, setActiveCol] = useState(null)

  // ── Selected cell for detail panel ───────────────────────────
  const [selectedCell, setSelectedCell] = useState(null)

  // ── Empty matrix safe state ───────────────────────────────────
  if (!matrix || !matrix.rowKeys?.length || !matrix.colKeys?.length) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', background: 'var(--bg-hover)', borderRadius: '8px', border: '1px dashed var(--border-subtle)' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No heatmap data available</div>
      </div>
    )
  }

  // ── Build cell lookup map ─────────────────────────────────────
  const cellMap = useMemo(() => {
    const m = {}
    for (const cell of matrix.cells) m[`${cell.row}::${cell.col}`] = cell
    return m
  }, [matrix])

  // ── Apply row sort (pure — never mutates matrix.rowKeys) ──────
  const baseRowKeys   = matrix.rowKeys.slice(0, maxRows)
  const baseRowLabels = matrix.rowLabels.slice(0, maxRows)
  const trimmedCount  = matrix.rowKeys.length - baseRowKeys.length

  const sortedRowKeys = useMemo(
    () => sortRowsByCol(baseRowKeys, sortCol, cellMap, sortDir),
    [baseRowKeys, sortCol, sortDir, cellMap],
  )

  // Map sorted rowKey → original label and code
  const rowKeyToLabel = useMemo(() => {
    const m = {}
    matrix.rowKeys.forEach((k, i) => { m[k] = matrix.rowLabels[i] })
    return m
  }, [matrix])

  // Map rowKey → branchCode (extracted from the first cell in that row)
  const rowKeyToCode = useMemo(() => {
    const m = {}
    for (const cell of matrix.cells) {
      if (cell.meta?.branchCode && !(cell.row in m)) {
        m[cell.row] = cell.meta.branchCode
      }
    }
    return m
  }, [matrix])

  // ── Column header click → cycle sort ─────────────────────────
  const handleColHeaderClick = useCallback((colKey) => {
    setSortCol((prev) => {
      if (prev === colKey) {
        const next = nextSortDir(sortDir)
        setSortDir(next)
        if (!next) setSortCol(null)  // reset col when direction resets
        return next ? colKey : null
      } else {
        setSortDir('asc')
        return colKey
      }
    })
  }, [sortDir])

  // ── Cell click — set active focus + fire callback ─────────────
  const handleCellClick = useCallback((cell) => {
    setActiveRow(cell.row)
    setActiveCol(cell.col)
    setSelectedCell(cell)
    onCellClick?.(cell)
  }, [onCellClick])

  const dismissSelected = useCallback(() => {
    setSelectedCell(null)
    setActiveRow(null)
    setActiveCol(null)
  }, [])

  const ROW_LABEL_W = 130
  const HEADER_H    = 52
  const GAP         = 3
  const gridW       = ROW_LABEL_W + (cellSize + GAP) * matrix.colKeys.length

  return (
    <div className={className} style={{ width: '100%' }}>
      {title && (
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '8px' }}>
          {title}
        </div>
      )}

      {showLegend && <Legend />}

      {/* Scroll wrapper */}
      <div
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
        aria-label="Branch KPI achievement heatmap"
        role="grid"
      >
        <div style={{ minWidth: gridW, position: 'relative' }}>

          {/* ── Sticky column header row ── */}
          <div
            data-testid="heatmap-header-row"
            style={{
              display: 'grid',
              gridTemplateColumns: `${ROW_LABEL_W}px repeat(${matrix.colKeys.length}, ${cellSize}px)`,
              gap: `0 ${GAP}px`,
              marginBottom: `${GAP}px`,
              // Sticky: header stays visible during vertical scroll
              position: 'sticky', top: 0,
              background: 'var(--bg-surface, #141417)',
              zIndex: 20,
            }}
          >
            {/* Top-left corner spacer — sticky both axes */}
            <div style={{
              width: ROW_LABEL_W, height: HEADER_H,
              position: 'sticky', left: 0,
              background: 'var(--bg-surface, #141417)',
              zIndex: 25,
            }} />

            {/* KPI column headers */}
            {matrix.colKeys.map((key, ci) => {
              const isActiveSort = sortCol === key
              const label = matrix.colLabels[ci]
              const isActiveFocus = activeCol === key

              return (
                <div
                  key={key}
                  role="columnheader"
                  aria-sort={isActiveSort ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title={`${label} — click to sort`}
                  data-testid={`col-header-${key}`}
                  onClick={() => handleColHeaderClick(key)}
                  style={{
                    width: cellSize, height: HEADER_H,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'flex-end',
                    paddingBottom: '6px',
                    cursor: 'pointer',
                    borderBottom: isActiveSort
                      ? '2px solid var(--brand-500, #00d2ad)'
                      : '2px solid transparent',
                    opacity: isActiveFocus ? 1 : 0.85,
                    transition: 'opacity 0.1s, border-color 0.1s',
                  }}
                >
                  {/* Sort indicator */}
                  {isActiveSort && (
                    <span
                      data-testid={`sort-indicator-${key}`}
                      style={{ fontSize: '8px', color: 'var(--brand-400, #26e8b4)', marginBottom: '2px', lineHeight: 1 }}
                      aria-label={sortDir === 'asc' ? 'sorted ascending' : 'sorted descending'}
                    >
                      {sortDir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                  <div style={{
                    fontSize: cellSize >= 48 ? '10px' : '9px',
                    fontWeight: isActiveSort ? 700 : 600,
                    color: isActiveSort ? 'var(--brand-400, #26e8b4)' : 'var(--text-secondary)',
                    textAlign: 'center', lineHeight: 1.2,
                    transform: cellSize < 48 ? 'rotate(-55deg)' : 'none',
                    transformOrigin: 'bottom center',
                    whiteSpace: 'nowrap',
                    maxWidth: cellSize < 48 ? '70px' : undefined,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {label}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Data rows ── */}
          {sortedRowKeys.map((rowKey) => {
            const rowLabel     = rowKeyToLabel[rowKey] ?? rowKey
            const rowCode      = rowKeyToCode[rowKey]
            const rowDisplayLabel = formatBranchLabel(rowLabel, rowCode)
            const isActiveRowFocus = activeRow === rowKey

            return (
              <div
                key={rowKey}
                role="row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `${ROW_LABEL_W}px repeat(${matrix.colKeys.length}, ${cellSize}px)`,
                  gap: `0 ${GAP}px`,
                  marginBottom: `${GAP}px`,
                  alignItems: 'center',
                  // Subtle row background highlight when active
                  background: isActiveRowFocus ? 'rgba(0,210,173,0.03)' : 'transparent',
                  borderRadius: '3px',
                }}
              >
                {/* Branch label — sticky left */}
                <div
                  role="rowheader"
                  title={rowDisplayLabel}
                  data-testid={`row-header-${rowKey}`}
                  style={{
                    width: ROW_LABEL_W, height: cellSize,
                    display: 'flex', alignItems: 'center',
                    paddingRight: '10px',
                    // Sticky: stays visible during horizontal scroll
                    position: 'sticky', left: 0,
                    background: isActiveRowFocus
                      ? 'var(--bg-surface, #141417)'
                      : 'var(--bg-surface, #141417)',
                    zIndex: 5,
                    borderRight: isActiveRowFocus
                      ? '2px solid var(--brand-500, #00d2ad)'
                      : '2px solid transparent',
                    transition: 'border-color 0.1s',
                  }}
                >
                  <span style={{
                    fontSize: '11px',
                    fontWeight: isActiveRowFocus ? 600 : 500,
                    color: isActiveRowFocus ? 'var(--text-primary, #fafafa)' : 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', maxWidth: ROW_LABEL_W - 14,
                    transition: 'color 0.1s, font-weight 0.1s',
                  }}>
                    {rowDisplayLabel}
                  </span>
                </div>

                {/* Data cells */}
                {matrix.colKeys.map((colKey) => {
                  const cell = cellMap[`${rowKey}::${colKey}`]
                  const isRow = activeRow === rowKey
                  const isCol = activeCol === colKey
                  // null means no active focus set yet
                  const hasAnyFocus = activeRow !== null || activeCol !== null

                  const resolvedCell = cell ?? {
                    row: rowKey, col: colKey,
                    value: null, status: null,
                    emptyCellState: 'NOT_APPLICABLE',
                    meta: { branchName: rowDisplayLabel, kpiLabel: colKey },
                  }

                  return (
                    <HeatmapCell
                      key={colKey}
                      cell={resolvedCell}
                      cellSize={cellSize}
                      onCellClick={handleCellClick}
                      isActiveRow={hasAnyFocus ? isRow : null}
                      isActiveCol={hasAnyFocus ? isCol : null}
                    />
                  )
                })}
              </div>
            )
          })}

          {/* Trim notice */}
          {trimmedCount > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingTop: '6px', paddingLeft: `${ROW_LABEL_W + 4}px` }}>
              +{trimmedCount} more branch{trimmedCount > 1 ? 'es' : ''} — sort by risk or score to surface exceptions
            </div>
          )}
        </div>
      </div>

      {/* Selected-cell detail panel */}
      {selectedCell && (
        <SelectedCellPanel cell={selectedCell} onDismiss={dismissSelected} />
      )}
    </div>
  )
}
