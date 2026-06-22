// ============================================================
// Evaluation Registry Page — ER-1
// Admin-only. Full basket/element/threshold configuration.
// No scoring. No evaluation execution. No ranking.
// ============================================================
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import {
  ClipboardCheck, Plus, Pencil, Archive, Copy, Trash2, AlertOctagon,
  Loader2, Save, X, AlertCircle, CheckCircle2, ChevronDown,
  ChevronUp, Layers, Sliders, Sparkles,
} from 'lucide-react'
import { useAuthStore }    from '../../store/authStore'
import { useToastStore }   from '../../components/ui/Toast'
import { useEvaluationRegistryStore } from '../../store/evaluationRegistryStore'
import {
  upsertBasket, removeBasket, reorderBaskets,
  createSmarts2026DraftProfile,
  archiveDraftProfiles, findDuplicateDraftGroups,
} from '../../services/evaluationRegistryService'
import DataTable, { RowActions } from '../../components/ui/DataTable'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { DEFAULT_KPI_REGISTRY, getActiveKpis } from '../../engine/kpiRegistry'
import { getProductionEvaluationKpis } from '../../engine/kpiRegistry/kpiMetaResolver'
import { subscribeKpiRegistry } from '../../services/kpiRegistryService'
import type {
  EvaluationProfile, EvaluationBasket, BasketElement, ThresholdRule, ThresholdBand,
} from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import {
  DEFAULT_THRESHOLD_RULE, FIVE_BAND_THRESHOLD_RULE,
  validateEvaluationProfile, validateThresholdRule, isProfileImmutable,
  checkProfileKpiCompatibility,
} from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import F from '../../components/admin/evaluation/EvaluationFormField'

const INP: React.CSSProperties = {
  width: '100%', height: '32px', padding: '0 9px', fontSize: '12px',
  borderRadius: '6px', border: '1px solid var(--border-default)',
  background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none',
}

// ── Page-scoped fix for native <select> options in dark/pharma themes ────
// Native <option> elements do not inherit background/color from their parent
// <select> in all browsers — they need explicit CSS. Scoped to
// .eval-registry-select to avoid affecting any other page.
const EVAL_REGISTRY_SELECT_STYLE = `
  .eval-registry-select {
    background-color: var(--input-bg);
    color:            var(--text-primary);
    border:           1px solid var(--border-default);
  }
  .eval-registry-select option {
    background-color: var(--input-bg);
    color:            var(--text-primary);
  }
  [data-theme="light"] .eval-registry-select,
  [data-theme="pharma-light"] .eval-registry-select {
    background-color: #FFFFFF;
    color:            #1E2A3A;
  }
  [data-theme="light"] .eval-registry-select option,
  [data-theme="pharma-light"] .eval-registry-select option {
    background-color: #FFFFFF;
    color:            #1E2A3A;
  }
`

const STATUS_COLORS: Record<string, string> = {
  draft: '#fbbf24', published: '#22c55e', archived: '#6b7280',
}

// ── Threshold Rule Editor ─────────────────────────────────────

function ThresholdEditor({
  rule, onChange, readOnly = false,
}: {
  rule: ThresholdRule
  onChange: (r: ThresholdRule) => void
  readOnly?: boolean
}) {
  const [bands, setBands] = useState<ThresholdBand[]>(rule.bands)
  const validation = useMemo(() => validateThresholdRule({ ...rule, bands }), [rule, bands])

  const emit = (newBands: ThresholdBand[]) => {
    setBands(newBands)
    onChange({ ...rule, bands: newBands })
  }

  const add = () => {
    const last = bands[bands.length - 1]
    const newMin = last ? last.max : 100
    emit([...bands, { min: newMin, max: newMin + 10, label: 'New Band', score: bands.length + 1, color: '#6b7280' }])
  }

  const update = (i: number, field: keyof ThresholdBand, val: string | number) => {
    const next = bands.map((b, idx) => idx === i ? { ...b, [field]: val } : b)
    emit(next)
  }

  const remove = (i: number) => emit(bands.filter((_, idx) => idx !== i))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Threshold Bands</span>
        {!readOnly && (
          <button onClick={add} style={{
            height: '24px', padding: '0 10px', fontSize: '10px', borderRadius: '5px',
            background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <Plus style={{ width: 10, height: 10 }} /> Add Band
          </button>
        )}
      </div>

      {!validation.valid && (
        <div style={{ fontSize: '10px', color: '#f87171', marginBottom: '6px' }}>
          {validation.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '60px 60px 1fr 50px 50px auto', gap: '4px', marginBottom: '4px' }}>
        {['Min %', 'Max %', 'Label', 'Score', 'Color', ''].map((h, i) => (
          <div key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</div>
        ))}
      </div>

      {bands.map((b, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 60px 1fr 50px 50px auto', gap: '4px', marginBottom: '4px' }}>
          <input type="number" value={b.min} disabled={readOnly}
            onChange={(e) => update(i, 'min', Number(e.target.value))}
            style={{ ...INP, height: '28px', fontSize: '11px' }} />
          <input type="number" value={b.max} disabled={readOnly}
            onChange={(e) => update(i, 'max', Number(e.target.value))}
            style={{ ...INP, height: '28px', fontSize: '11px' }} />
          <input type="text" value={b.label} disabled={readOnly}
            onChange={(e) => update(i, 'label', e.target.value)}
            style={{ ...INP, height: '28px', fontSize: '11px' }} />
          <input type="number" value={b.score} disabled={readOnly}
            onChange={(e) => update(i, 'score', Number(e.target.value))}
            style={{ ...INP, height: '28px', fontSize: '11px' }} />
          <input type="color" value={b.color ?? '#6b7280'} disabled={readOnly}
            onChange={(e) => update(i, 'color', e.target.value)}
            style={{ width: '100%', height: '28px', padding: '1px 2px', border: '1px solid var(--border-default)', borderRadius: '6px', background: 'var(--bg-input)', cursor: readOnly ? 'not-allowed' : 'pointer' }} />
          {!readOnly && (
            <button onClick={() => remove(i)} style={{ height: '28px', width: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}>
              <Trash2 style={{ width: 12, height: 12 }} />
            </button>
          )}
          {readOnly && <div />}
        </div>
      ))}
    </div>
  )
}

// ── Element Editor ────────────────────────────────────────────

function ElementEditor({
  elements, kpiOptions, onChange, readOnly = false,
}: {
  elements:   BasketElement[]
  kpiOptions: { key: string; label: string }[]
  onChange:   (elements: BasketElement[]) => void
  readOnly?:  boolean
}) {
  const totalWeight = elements.reduce((s, e) => s + (Number(e.weight) || 0), 0)
  const balanced    = Math.abs(totalWeight - 1.0) <= 0.01

  // ER-1.5: compute which keys are already used so the UI can warn / block duplicates
  const usedKeys = new Set(elements.map((e) => e.kpiKey))

  const add = () => {
    // Pick the first KPI option that is not already in use; fall back to first option
    const firstFree = kpiOptions.find((k) => !usedKeys.has(k.key))
    onChange([
      ...elements,
      { kpiKey: firstFree?.key ?? kpiOptions[0]?.key ?? '', weight: 0, required: true },
    ])
  }

  const update = (i: number, field: keyof BasketElement, val: unknown) => {
    // ER-1.5: when changing kpiKey, warn if the new key is already used in another element
    if (field === 'kpiKey') {
      const otherKeys = elements.filter((_, idx) => idx !== i).map((e) => e.kpiKey)
      if (otherKeys.includes(val as string)) {
        // Still allow the change (service-layer + publish validation will catch it)
        // but the duplicate indicator below will highlight it
      }
    }
    onChange(elements.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  }

  const remove = (i: number) => onChange(elements.filter((_, idx) => idx !== i))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>KPI Elements</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: balanced ? '#22c55e' : '#f87171' }}>
            Σ weights = {totalWeight.toFixed(2)}{!balanced && ' (must = 1.00)'}
          </span>
          {/* ER-1.5: duplicate indicator */}
          {elements.length !== new Set(elements.map(e => e.kpiKey)).size && (
            <span style={{ fontSize: '10px', color: '#ef4444' }}>⚠ Duplicate KPI keys</span>
          )}
          {!readOnly && (
            <button onClick={add} style={{
              height: '24px', padding: '0 10px', fontSize: '10px', borderRadius: '5px',
              background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <Plus style={{ width: 10, height: 10 }} /> Add
            </button>
          )}
        </div>
      </div>

      {elements.length === 0 && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px 0' }}>No elements yet. Add a KPI element.</div>
      )}

      {elements.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px auto', gap: '6px', marginBottom: '2px' }}>
          {['KPI', 'Weight', 'Required', 'Cap %', ''].map((h) => (
            <div key={h} style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>
      )}

      {elements.map((el, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px auto',
          gap: '6px', marginBottom: '6px', alignItems: 'center',
        }}>
          <select value={el.kpiKey} disabled={readOnly}
            onChange={(e) => update(i, 'kpiKey', e.target.value)}
            className="eval-registry-select"
            style={{ ...INP, height: '30px' }}>
            {kpiOptions.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <input type="number" placeholder="Weight" step="0.01" min="0" max="1"
            value={el.weight} disabled={readOnly}
            onChange={(e) => update(i, 'weight', Number(e.target.value))}
            style={{ ...INP, height: '30px', textAlign: 'right' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', cursor: readOnly ? 'default' : 'pointer' }}>
            <input type="checkbox" checked={el.required} disabled={readOnly}
              onChange={(e) => update(i, 'required', e.target.checked)} />
            Required
          </label>
          <input
            type="number"
            placeholder="Cap %"
            title="Achievement cap — leave empty for no cap. Example: 130 limits contribution to 130% even if actual is higher."
            min="1" max="999" step="1"
            value={el.achievementCapPct ?? ''}
            disabled={readOnly}
            onChange={(e) => {
              const raw = e.target.value
              update(i, 'achievementCapPct', raw === '' ? null : Math.max(1, Math.min(999, Number(raw))))
            }}
            style={{ ...INP, height: '30px', textAlign: 'right' }}
          />
          {!readOnly && (
            <button onClick={() => remove(i)} style={{ height: '30px', width: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}>
              <Trash2 style={{ width: 12, height: 12 }} />
            </button>
          )}
          {readOnly && <div />}
        </div>
      ))}
    </div>
  )
}

// ── Basket Card ────────────────────────────────────────────────

function BasketCard({
  basket, index, total, kpiOptions, readOnly, onChange, onDelete, onMoveUp, onMoveDown,
}: {
  basket:     EvaluationBasket
  index:      number
  total:      number
  kpiOptions: { key: string; label: string }[]
  readOnly:   boolean
  onChange:   (b: EvaluationBasket) => void
  onDelete:   () => void
  onMoveUp:   () => void
  onMoveDown: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showThreshold, setShowThreshold] = useState(false)

  const up  = (field: keyof EvaluationBasket, val: unknown) => onChange({ ...basket, [field]: val })

  return (
    <div style={{
      border: '1px solid var(--border-default)', borderRadius: '10px',
      marginBottom: '10px', background: 'var(--bg-card)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 14px', cursor: 'pointer',
        background: expanded ? 'var(--bg-hover)' : 'transparent',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {!readOnly && (
            <>
              <button onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={index === 0}
                style={{ height: '14px', width: '14px', background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronUp style={{ width: 10, height: 10 }} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={index === total - 1}
                style={{ height: '14px', width: '14px', background: 'none', border: 'none', cursor: index === total - 1 ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronDown style={{ width: 10, height: 10 }} />
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} onClick={() => setExpanded((v) => !v)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{basket.name || '(unnamed)'}</span>
            <span style={{
              fontSize: '10px', padding: '1px 7px', borderRadius: '99px',
              background: 'rgba(var(--brand-rgb),0.1)', color: 'var(--brand-400)',
            }}>
              {(basket.weight * 100).toFixed(0)}%
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {basket.elements.length} KPI{basket.elements.length !== 1 ? 's' : ''}
            </span>
            {expanded ? <ChevronUp style={{ width: 13, height: 13, color: 'var(--text-muted)', marginLeft: 'auto' }} />
                      : <ChevronDown style={{ width: 13, height: 13, color: 'var(--text-muted)', marginLeft: 'auto' }} />}
          </div>
        </div>

        {!readOnly && (
          <button onClick={(e) => { e.stopPropagation(); onDelete() }} style={{
            height: '26px', width: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: '#f87171',
          }}>
            <Trash2 style={{ width: 13, height: 13 }} />
          </button>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '14px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <F label="Basket Name" required>
              <input value={basket.name} disabled={readOnly}
                onChange={(e) => up('name', e.target.value)} style={INP} />
            </F>
            <F label="Weight (0–1)" required hint="All basket weights must sum to 1.0">
              <input type="number" step="0.05" min="0" max="1"
                value={basket.weight} disabled={readOnly}
                onChange={(e) => up('weight', Number(e.target.value))} style={INP} />
            </F>
          </div>

          <F label="Description">
            <input value={basket.description ?? ''} disabled={readOnly}
              onChange={(e) => up('description', e.target.value)} style={INP} />
          </F>

          <F label="Basket Achievement Cap %" hint="Optional. Caps all element contributions at this % (e.g. 130). Overridden by per-element caps. Leave empty for no cap.">
            <input
              type="number"
              placeholder="e.g. 130 — empty = no cap"
              min="1" max="999" step="1"
              value={basket.achievementCapPct ?? ''}
              disabled={readOnly}
              onChange={(e) => {
                const raw = e.target.value
                up('achievementCapPct', raw === '' ? null : Math.max(1, Math.min(999, Number(raw))))
              }}
              style={{ ...INP, width: '160px' }}
            />
          </F>
          <div style={{ marginTop: '14px' }}>
            <ElementEditor
              elements={basket.elements}
              kpiOptions={kpiOptions}
              onChange={(els) => up('elements', els)}
              readOnly={readOnly}
            />
          </div>

          <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
            <button onClick={() => setShowThreshold((v) => !v)} style={{
              display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: '11px', color: 'var(--text-secondary)', padding: 0,
            }}>
              <Sliders style={{ width: 12, height: 12 }} />
              {showThreshold ? 'Hide' : 'Edit'} Threshold Rule
              <ChevronDown style={{ width: 11, height: 11, transform: showThreshold ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
            </button>

            {showThreshold && (
              <div style={{ marginTop: '10px' }}>
                {!readOnly && (
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <button onClick={() => up('thresholdRule', DEFAULT_THRESHOLD_RULE)} style={{
                      height: '26px', padding: '0 10px', fontSize: '10px', borderRadius: '5px',
                      background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}>3-Band Standard</button>
                    <button onClick={() => up('thresholdRule', FIVE_BAND_THRESHOLD_RULE)} style={{
                      height: '26px', padding: '0 10px', fontSize: '10px', borderRadius: '5px',
                      background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}>5-Band SMARTS</button>
                  </div>
                )}
                <ThresholdEditor
                  rule={basket.thresholdRule ?? DEFAULT_THRESHOLD_RULE}
                  onChange={(r) => up('thresholdRule', r)}
                  readOnly={readOnly}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Profile Editor Modal ──────────────────────────────────────

function ProfileEditorModal({
  profile, kpiOptions, liveRegistry, onClose, onSave, saving,
}: {
  profile:      EvaluationProfile
  kpiOptions:   { key: string; label: string }[]
  liveRegistry: import('../../engine/kpiRegistry').KpiRegistry
  onClose:      () => void
  onSave:       (updated: EvaluationProfile) => Promise<void>
  saving:       boolean
}) {
  const [draft, setDraft]     = useState<EvaluationProfile>({ ...profile })
  const [errors, setErrors]   = useState<string[]>([])
  const readOnly = isProfileImmutable(profile.status)

  const validation = useMemo(() => validateEvaluationProfile(draft), [draft])

  // ER-1.5: KPI compatibility warnings — shown inline, do not block save
  const kpiWarnings = useMemo(
    () => checkProfileKpiCompatibility(draft, liveRegistry),
    [draft, liveRegistry],
  )

  const setField = (field: keyof EvaluationProfile, val: unknown) =>
    setDraft((p) => ({ ...p, [field]: val }))

  const baskets   = useMemo(() =>
    (draft.basketIds || [])
      .map((id) => draft.baskets?.[id])
      .filter(Boolean) as EvaluationBasket[],
    [draft]
  )

  const addBasket = () => {
    const id   = `basket-${Date.now()}`
    const sort = baskets.length + 1
    const b: EvaluationBasket = {
      id, name: 'New Basket', weight: 0, elements: [],
      thresholdRule: { ...FIVE_BAND_THRESHOLD_RULE },
      sortOrder: sort, active: true,
    }
    setDraft((p) => ({
      ...p,
      baskets:   { ...(p.baskets || {}), [id]: b },
      basketIds: [...(p.basketIds || []), id],
    }))
  }

  const updateBasket = (b: EvaluationBasket) =>
    setDraft((p) => ({ ...p, baskets: { ...(p.baskets || {}), [b.id]: b } }))

  const deleteBasket = (id: string) =>
    setDraft((p) => ({
      ...p,
      baskets:   Object.fromEntries(Object.entries(p.baskets || {}).filter(([k]) => k !== id)),
      basketIds: (p.basketIds || []).filter((k) => k !== id),
    }))

  const moveBasket = (index: number, dir: -1 | 1) => {
    const ids  = [...(draft.basketIds || [])]
    const swap = index + dir
    if (swap < 0 || swap >= ids.length) return
    ;[ids[index], ids[swap]] = [ids[swap], ids[index]]
    setDraft((p) => ({ ...p, basketIds: ids }))
  }

  const totalBasketWeight = baskets
    .filter((b) => b.active)
    .reduce((s, b) => s + (Number(b.weight) || 0), 0)
  const basketsBalanced = Math.abs(totalBasketWeight - 1.0) <= 0.01

  const handleSave = async () => {
    if (!readOnly && !validation.valid) {
      setErrors(validation.errors)
      return
    }
    await onSave(draft)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 50, overflowY: 'auto', padding: '24px 16px',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-default)',
        borderRadius: '12px', width: '700px', maxWidth: '100%',
      }}>
        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {readOnly ? `View Profile — ${profile.name}` : `Edit Profile — ${profile.name}`}
            </h2>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              v{profile.version} · {profile.status}
              {readOnly && ' · Read-only (create new version to edit)'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          {/* ER-1.5: KPI compatibility warnings — informational, does not block save */}
          {kpiWarnings.length > 0 && (
            <div style={{
              padding: '8px 12px', borderRadius: '8px', marginBottom: '10px',
              background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)',
              fontSize: '11px', color: '#fbbf24',
            }}>
              <div style={{ fontWeight: 600, marginBottom: '3px' }}>⚠ KPI Registry Warnings</div>
              {kpiWarnings.map((w, i) => <div key={i} style={{ marginLeft: '4px' }}>{w}</div>)}
            </div>
          )}

          {/* Validation errors */}
          {errors.length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px', marginBottom: '14px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              fontSize: '11px', color: '#f87171',
            }}>
              {errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
            </div>
          )}

          {/* Profile meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <F label="Profile Name" required>
              <input value={draft.name} disabled={readOnly}
                onChange={(e) => setField('name', e.target.value)} style={INP} />
            </F>
            <F label="Role" required>
              <select value={draft.role as string} disabled={readOnly}
                onChange={(e) => setField('role', e.target.value)}
                className="eval-registry-select" style={INP}>
                <option value="pharmacist">Pharmacist</option>
                <option value="branch_manager">Branch Manager</option>
                <option value="manager">Manager (legacy)</option>
              </select>
            </F>
            <F label="Effective From" required>
              <input type="month" value={draft.effectiveFrom ?? ''} disabled={readOnly}
                onChange={(e) => setField('effectiveFrom', e.target.value)} style={INP} />
            </F>
            <F label="Effective To">
              <input type="month" value={draft.effectiveTo ?? ''} disabled={readOnly}
                onChange={(e) => setField('effectiveTo', e.target.value || null)} style={INP} />
            </F>
          </div>

          <F label="Description">
            <input value={draft.description ?? ''} disabled={readOnly}
              onChange={(e) => setField('description', e.target.value)}
              style={INP} />
          </F>

          <F
            label="Evaluation Pipeline"
            hint="Controls which V2 pipeline runs in shadow mode alongside V1. Legacy Band Score matches the current evaluation engine. SMARTS Weighted Contribution uses contribution-sum methodology."
          >
            <select
              value={draft.pipelineId ?? 'legacy-band-score'}
              disabled={readOnly}
              onChange={(e) => setField('pipelineId', e.target.value || null)}
              className="eval-registry-select"
              style={{ ...INP, width: '320px' }}
            >
              <option value="legacy-band-score">Legacy Band Score (default)</option>
              <option value="smarts-weighted-contribution">SMARTS Weighted Contribution</option>
            </select>
          </F>

          {/* Basket builder */}
          <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Baskets
                </span>
                <span style={{ fontSize: '10px', marginLeft: '8px', color: basketsBalanced ? '#22c55e' : '#f87171' }}>
                  Σ weights = {totalBasketWeight.toFixed(2)}{!basketsBalanced && ' (must = 1.00)'}
                </span>
              </div>
              {!readOnly && (
                <button onClick={addBasket} style={{
                  height: '28px', padding: '0 12px', fontSize: '11px', borderRadius: '6px',
                  background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  <Plus style={{ width: 12, height: 12 }} /> Add Basket
                </button>
              )}
            </div>

            {baskets.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', border: '1px dashed var(--border-default)', borderRadius: '8px' }}>
                No baskets yet. Add one to configure this evaluation profile.
              </div>
            )}

            {baskets.map((b, i) => (
              <BasketCard
                key={b.id}
                basket={b}
                index={i}
                total={baskets.length}
                kpiOptions={kpiOptions}
                readOnly={readOnly}
                onChange={updateBasket}
                onDelete={() => deleteBasket(b.id)}
                onMoveUp={() => moveBasket(i, -1)}
                onMoveDown={() => moveBasket(i, 1)}
              />
            ))}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
            {!validation.valid && !readOnly && (
              <div style={{ flex: 1, fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle style={{ width: 12, height: 12, color: '#f59e0b' }} />
                {validation.errors[0]}
                {validation.errors.length > 1 && ` (+${validation.errors.length - 1} more)`}
              </div>
            )}
            <button onClick={onClose} style={{
              height: '32px', padding: '0 14px', borderRadius: '7px', fontSize: '12px',
              background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button onClick={handleSave} disabled={saving} style={{
                height: '32px', padding: '0 14px', borderRadius: '7px', fontSize: '12px',
                background: 'var(--brand-500)', color: '#fff', border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                {saving ? <Loader2 style={{ width: 12, height: 12 }} /> : <Save style={{ width: 12, height: 12 }} />}
                Save Draft
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function EvaluationRegistryPage() {
  const { userProfile }  = useAuthStore()
  const toast = useToastStore()
  const { profiles, loading, error: storeError, subscribe, create, update, publish, archive, newVersion } =
    useEvaluationRegistryStore()

  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  const [search,       setSearch]       = useState('')
  const [showCreate,   setShowCreate]   = useState(false)
  const [editProfile,  setEditProfile]  = useState<EvaluationProfile | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [creatingSmarts, setCreatingSmarts] = useState(false)
  const [confirm,      setConfirm]      = useState<{
    action: 'publish' | 'archive' | 'newVersion'; profile: EvaluationProfile
  } | null>(null)
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set())
  const [bulkWorking,   setBulkWorking]   = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  // Form state for new profile
  const [newName,  setNewName]  = useState('')
  const [newRole,  setNewRole]  = useState('pharmacist')
  const [newFrom,  setNewFrom]  = useState('')

  // Re-subscribe if uid changes (e.g. auth resolves after mount).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const u = subscribe(); return u }, [userProfile?.uid])

  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      () => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  const kpiOptions = useMemo(() =>
    // Only production_evaluation KPIs may appear in the profile editor.
    // Pilot and shadow KPIs must not be selectable in a production profile.
    getProductionEvaluationKpis(liveRegistry).map((k) => ({ key: k.key, label: k.label })),
    [liveRegistry]
  )

  const filtered = useMemo(() =>
    profiles.filter((p) => !search || p.name?.toLowerCase().includes(search.toLowerCase())),
    [profiles, search]
  )

  // Duplicate draft detection
  const duplicateDraftGroups = useMemo(() => findDuplicateDraftGroups(profiles), [profiles])
  const duplicateIds = useMemo(() => {
    const ids = new Set<string>()
    Object.values(duplicateDraftGroups).forEach((group) =>
      group.slice(1).forEach((p) => ids.add(p.id)) // oldest duplicates
    )
    return ids
  }, [duplicateDraftGroups])
  const hasDuplicates = Object.keys(duplicateDraftGroups).length > 0

  const selectableDraftIds = useMemo(
    () => filtered.filter((p) => p.status === 'draft').map((p) => p.id),
    [filtered]
  )

  const handleCreate = async () => {
    if (!newName.trim() || !newRole || !newFrom) {
      toast.error('Name, role, and effective-from date are required')
      return
    }
    setSaving(true)
    try {
      await create(
        { name: newName, role: newRole, effectiveFrom: newFrom, baskets: {}, basketIds: [], defaultThresholdRule: FIVE_BAND_THRESHOLD_RULE },
        userProfile?.uid ?? '', userProfile?.role ?? '',
      )
      setShowCreate(false); setNewName(''); setNewFrom('')
      toast.success('Profile created')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Create failed')
    } finally { setSaving(false) }
  }

  const handleSaveDraft = async (updated: EvaluationProfile) => {
    setSaving(true)
    try {
      const { id, status, version, createdAt, createdBy, publishedAt, archivedAt, previousVersionId, ...data } = updated
      await update(id, { ...data }, userProfile?.uid ?? '', userProfile?.role ?? '')
      setEditProfile(null)
      toast.success('Profile saved')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const handleConfirm = async () => {
    if (!confirm) return
    const { action, profile } = confirm
    try {
      if (action === 'publish') {
        await publish(profile.id, userProfile?.uid ?? '', userProfile?.role ?? '')
        toast.success(`"${profile.name}" published`)
      } else if (action === 'archive') {
        await archive(profile.id, userProfile?.uid ?? '', userProfile?.role ?? '')
        toast.success(`"${profile.name}" archived`)
      } else {
        const v = await newVersion(profile.id, userProfile?.uid ?? '', userProfile?.role ?? '')
        toast.success(`New draft v${v.version} created`)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally { setConfirm(null) }
  }

  const handleBulkArchive = async (ids: string[]) => {
    setBulkWorking(true)
    try {
      const { archived, skipped, errors } = await archiveDraftProfiles(
        ids, userProfile?.uid ?? '', userProfile?.role ?? ''
      )
      if (archived.length > 0) toast.success(`Archived ${archived.length} draft profile${archived.length !== 1 ? 's' : ''}`)
      if (skipped.length > 0)  toast.error(`Skipped ${skipped.length} non-draft profile${skipped.length !== 1 ? 's' : ''} (protected)`)
      if (errors.length > 0)   toast.error(`${errors.length} error${errors.length !== 1 ? 's' : ''}: ${errors[0]}`)
      setSelectedIds(new Set())
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Bulk archive failed')
    } finally {
      setBulkWorking(false); setShowBulkConfirm(false)
    }
  }

  const handleArchiveDuplicates = async () => {
    const ids: string[] = []
    Object.values(duplicateDraftGroups).forEach((group) =>
      group.slice(1).forEach((p) => ids.push(p.id))
    )
    if (ids.length === 0) { toast.error('No duplicate drafts found'); return }
    await handleBulkArchive(ids)
  }

  const handleCreateSmarts = async () => {
    setCreatingSmarts(true)
    try {
      const p = await createSmarts2026DraftProfile(userProfile?.uid ?? '', userProfile?.role ?? '')
      toast.success(`SMARTS 2026 draft created — "${p.name}"`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create template')
    } finally { setCreatingSmarts(false) }
  }

  const COLS = [
    { key: 'name',  label: 'Profile',    sortable: true, render: (v: string, row: EvaluationProfile) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input type='checkbox' checked={selectedIds.has(row.id)}
          disabled={row.status !== 'draft'}
          onChange={(e) => {
            setSelectedIds((prev) => {
              const next = new Set(prev)
              e.target.checked ? next.add(row.id) : next.delete(row.id)
              return next
            })
          }}
          style={{ cursor: row.status === 'draft' ? 'pointer' : 'not-allowed', flexShrink: 0 }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text-primary)' }}>{v}</span>
            {duplicateIds.has(row.id) && (
              <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '99px',
                background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>Duplicate draft</span>
            )}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            v{row.version} · {Array.isArray(row.role) ? row.role.join(',') : row.role}
          </div>
        </div>
      </div>
    )},
    { key: 'basketIds', label: 'Baskets', render: (v: string[]) => (
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v?.length ?? 0}</span>
    )},
    { key: 'effectiveFrom', label: 'From', render: (v: string) => (
      <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{v || '—'}</span>
    )},
    { key: 'status', label: 'Status', render: (v: string) => (
      <span style={{
        fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px',
        background: `${STATUS_COLORS[v] ?? '#6b7280'}22`, color: STATUS_COLORS[v] ?? '#6b7280',
      }}>{v}</span>
    )},
    { key: '__actions', label: '', render: (_v: unknown, row: EvaluationProfile) => {
      const actions: { label: string; icon: React.ElementType; onClick: () => void; danger?: boolean }[] = [
        { label: 'Open',  icon: Pencil, onClick: () => setEditProfile(row) },
      ]
      if (row.status === 'draft') {
        actions.push({ label: 'Publish',    icon: CheckCircle2, onClick: () => setConfirm({ action: 'publish', profile: row }) })
      }
      if (row.status === 'published') {
        actions.push({ label: 'New Version', icon: Copy,    onClick: () => setConfirm({ action: 'newVersion', profile: row }) })
        actions.push({ label: 'Archive',     icon: Archive, onClick: () => setConfirm({ action: 'archive',    profile: row }), danger: true })
      }
      if (row.status === 'archived') {
        actions.push({ label: 'New Version', icon: Copy, onClick: () => setConfirm({ action: 'newVersion', profile: row }) })
      }
      return <RowActions actions={actions} />
    }},
  ]

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Page-scoped select styles — fixes dark/pharma theme option readability */}
      <style>{EVAL_REGISTRY_SELECT_STYLE}</style>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Evaluation Registry
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
            Configure evaluation profiles with baskets, elements, and threshold rules
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleCreateSmarts} disabled={creatingSmarts} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            height: '32px', padding: '0 12px', borderRadius: '8px',
            background: 'rgba(var(--brand-rgb),0.08)',
            border: '1px solid var(--border-default)',
            color: 'var(--brand-400)', fontSize: '11px', cursor: creatingSmarts ? 'not-allowed' : 'pointer',
          }}>
            {creatingSmarts ? <Loader2 style={{ width: 12, height: 12 }} /> : <Sparkles style={{ width: 12, height: 12 }} />}
            SMARTS 2026 Template
          </button>
          <button onClick={() => setShowCreate(true)} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            height: '32px', padding: '0 14px', borderRadius: '8px',
            background: 'var(--brand-500)', color: '#fff', border: 'none',
            fontSize: '12px', fontWeight: 500, cursor: 'pointer',
          }}>
            <Plus style={{ width: 13, height: 13 }} /> New Profile
          </button>
        </div>
      </div>

      {/* ── Debug panel — remove before production release ─────── */}
      {process.env.NODE_ENV !== 'production' && (
        <div style={{
          padding: '8px 12px', marginBottom: '12px', borderRadius: '7px',
          background: 'rgba(99,102,241,0.08)', border: '1px dashed rgba(99,102,241,0.4)',
          fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)',
          display: 'flex', gap: '16px', flexWrap: 'wrap',
        }}>
          <span>uid: <b style={{color:'var(--text-primary)'}}>{userProfile?.uid ?? 'undefined'}</b></span>
          <span>role: <b style={{color:'var(--text-primary)'}}>{userProfile?.role ?? 'undefined'}</b></span>
          <span>loading: <b style={{color: loading ? '#f59e0b' : '#22c55e'}}>{String(loading)}</b></span>
          <span>error: <b style={{color: storeError ? '#ef4444' : '#22c55e'}}>{storeError ?? 'none'}</b></span>
          <span>profiles.length: <b style={{color:'var(--text-primary)'}}>{profiles.length}</b></span>
          <span>filtered.length: <b style={{color:'var(--text-primary)'}}>{filtered.length}</b></span>
        </div>
      )}
      {/* ── end debug panel ─────────────────────────────────────── */}

      {/* Search */}
      <div style={{ maxWidth: '280px', marginBottom: '16px' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search profiles…" style={{ ...INP, height: '34px' }} />
      </div>

      {/* Bulk action toolbar — shown when drafts are selected or duplicates exist */}
      {(selectedIds.size > 0 || hasDuplicates) && (
        <div style={{
          marginBottom: '12px', padding: '10px 14px', borderRadius: '8px',
          background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          fontSize: '11px',
        }}>
          {/* Selection controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <button onClick={() => setSelectedIds(new Set(selectableDraftIds))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-400)', fontSize: '11px', padding: 0 }}>
              Select all drafts ({selectableDraftIds.length})
            </button>
            {selectedIds.size > 0 && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <button onClick={() => setSelectedIds(new Set())}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: 0 }}>
                  Clear
                </button>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{selectedIds.size} selected</span>
              </>
            )}
          </div>

          {/* Duplicate warning + quick action */}
          {hasDuplicates && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertOctagon style={{ width: 12, height: 12, color: '#f59e0b', flexShrink: 0 }} />
              <span style={{ color: '#f59e0b', fontSize: '11px' }}>
                {duplicateIds.size} duplicate draft{duplicateIds.size !== 1 ? 's' : ''} detected
              </span>
              <button onClick={handleArchiveDuplicates} disabled={bulkWorking}
                style={{ height: '24px', padding: '0 10px', fontSize: '10px', borderRadius: '5px',
                  background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                  color: '#f59e0b', cursor: bulkWorking ? 'not-allowed' : 'pointer' }}>
                Archive duplicate drafts
              </button>
            </div>
          )}

          {/* Bulk archive selected */}
          {selectedIds.size > 0 && (
            <button onClick={() => setShowBulkConfirm(true)} disabled={bulkWorking}
              style={{ height: '28px', padding: '0 12px', fontSize: '11px', borderRadius: '6px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171', cursor: bulkWorking ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Archive style={{ width: 11, height: 11 }} />
              Archive {selectedIds.size} selected draft{selectedIds.size !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {loading
        ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>
        : storeError
          ? <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '12px', color: '#f87171' }}>
              ⚠ Could not load profiles: {storeError}
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>Check that your account has admin or manager role.</div>
            </div>
          : <DataTable columns={COLS} rows={filtered} rowKey="id" emptyText="No evaluation profiles yet" />
      }

      {/* New Profile modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-default)',
            borderRadius: '12px', padding: '20px', width: '380px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>New Evaluation Profile</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <F label="Name" required>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} style={INP} placeholder="e.g. Q1 2026 Pharmacist Evaluation" />
            </F>
            <F label="Role" required>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="eval-registry-select" style={INP}>
                <option value="pharmacist">Pharmacist</option>
                <option value="branch_manager">Branch Manager</option>
                <option value="manager">Manager (legacy)</option>
              </select>
            </F>
            <F label="Effective From" required>
              <input type="month" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} style={INP} />
            </F>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '8px 0 14px' }}>
              Baskets and threshold rules are configured after creation.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{ height: '32px', padding: '0 14px', borderRadius: '7px', fontSize: '12px', background: 'var(--bg-hover)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={saving} style={{ height: '32px', padding: '0 14px', borderRadius: '7px', fontSize: '12px', background: 'var(--brand-500)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {saving ? <Loader2 style={{ width: 12, height: 12 }} /> : <Plus style={{ width: 12, height: 12 }} />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile editor */}
      {editProfile && (
        <ProfileEditorModal
          profile={editProfile}
          kpiOptions={kpiOptions}
          liveRegistry={liveRegistry}
          onClose={() => setEditProfile(null)}
          onSave={handleSaveDraft}
          saving={saving}
        />
      )}

      <ConfirmModal
        open={!!confirm}
        title={
          confirm?.action === 'publish'    ? 'Publish Profile' :
          confirm?.action === 'archive'    ? 'Archive Profile' :
          'Create New Version'
        }
        message={
          confirm?.action === 'publish'
            ? `Publish "${confirm.profile.name}"? Once published, it becomes immutable. Create a new version to make changes.`
          : confirm?.action === 'archive'
            ? `Archive "${confirm.profile.name}"? Preserved for historical accuracy but no longer used for new evaluations.`
          : `Create a new draft version from "${confirm?.profile.name}" v${confirm?.profile.version}?`
        }
        confirmLabel={confirm?.action === 'publish' ? 'Publish' : confirm?.action === 'archive' ? 'Archive' : 'Create'}
        onConfirm={handleConfirm}
        onClose={() => setConfirm(null)}
      />

      {/* Bulk archive confirm */}
      <ConfirmModal
        open={showBulkConfirm}
        title='Archive Selected Drafts'
        message={`Archive ${selectedIds.size} selected draft profile${selectedIds.size !== 1 ? 's' : ''}? ` +
          'This only affects drafts — published profiles are never touched. ' +
          'Archived profiles are preserved and can be used to create new versions.'}
        confirmLabel='Archive Drafts'
        onConfirm={() => handleBulkArchive([...selectedIds])}
        onClose={() => setShowBulkConfirm(false)}
        danger
      />
    </div>
  )
}
