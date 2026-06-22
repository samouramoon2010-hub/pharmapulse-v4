// ============================================================
// Branch Classifications Page — RF-0A Verification UI
//
// Admin-only, read-only. No writes. No migration execution.
// Purpose: visually confirm RF-0 is installed and working.
//
// Sections:
//   1. Classification Registry  — tier definitions from Firestore
//   2. Summary                  — counts per tier, migration coverage
//   3. Branch List              — all pharmacies with RF-0 fields
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import { GitBranch, CheckCircle2, AlertCircle, CircleDot, Loader2, DatabaseZap } from 'lucide-react'
import DataTable from '../../components/ui/DataTable'
import { useAuthStore } from '../../store/authStore'
import {
  getAllClassifications, subscribeToClassifications,
  createClassification, subscribeToPharmaciesWithClassification,
} from '../../classification/repository'
import {
  computeClassificationSummary,
  formatSource,
  formatSchemaVersion,
} from '../../classification/summaryEngine'
import { UNCLASSIFIED_ID, CLASSIFICATION_SCHEMA_VERSION, DEFAULT_CLASSIFICATIONS }
  from '../../classification/constants'
import type { BranchClassification } from '../../classification/types'
import type { PharmacyWithClassification } from '../../classification/repository'

// ── Inline style tokens ───────────────────────────────────────

const card: React.CSSProperties = {
  background:   'var(--bg-card)',
  border:       '1px solid var(--border-default)',
  borderRadius: '10px',
  padding:      '20px 24px',
  marginBottom: '20px',
}
const sectionTitle: React.CSSProperties = {
  fontSize:     '13px',
  fontWeight:   600,
  color:        'var(--text-primary)',
  marginBottom: '16px',
  display:      'flex',
  alignItems:   'center',
  gap:          '8px',
}
const statCard = (color: string): React.CSSProperties => ({
  background:   'var(--bg-surface)',
  border:       `1px solid ${color}33`,
  borderRadius: '8px',
  padding:      '14px 18px',
  flex:         '1 1 160px',
})
const statNum: React.CSSProperties = {
  fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1,
}
const statLabel: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px',
}
const badge = (active: boolean): React.CSSProperties => ({
  display:      'inline-block',
  padding:      '2px 8px',
  borderRadius: '12px',
  fontSize:     '11px',
  fontWeight:   500,
  background:   active ? '#22c55e22' : '#6b728022',
  color:        active ? '#22c55e'   : '#6b7280',
})

// ── Classification Registry section ──────────────────────────

function RegistrySection({ registry, loading, error, seeding, seedResult, onSeed }: {
  registry:   BranchClassification[]
  loading:    boolean
  error:      string | null
  seeding:    boolean
  seedResult: string | null
  onSeed:     () => void
}) {
  const columns = [
    { key: 'order',       label: 'Order',       sortable: true,
      render: (_v: unknown, r: BranchClassification) => r?.order ?? '—' },
    { key: 'id',          label: 'ID',          sortable: true,
      render: (_v: unknown, r: BranchClassification) =>
        <code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r?.id ?? '—'}</code> },
    { key: 'label',       label: 'Label',       sortable: true,
      render: (_v: unknown, r: BranchClassification) =>
        <span>{r?.label}{r?.labelAr && <span style={{ color: 'var(--text-muted)', marginRight: '8px', fontSize: '12px' }}> / {r.labelAr}</span>}</span> },
    { key: 'description', label: 'Description',
      render: (_v: unknown, r: BranchClassification) =>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r?.description ?? '—'}</span> },
    { key: 'active',      label: 'Active',      sortable: true,
      render: (_v: unknown, r: BranchClassification) =>
        <span style={badge(r?.active ?? false)}>{r?.active ? 'Active' : 'Retired'}</span> },
    { key: 'system',      label: 'System',
      render: (_v: unknown, r: BranchClassification) =>
        r?.system ? <span style={{ fontSize: '11px', color: '#f59e0b' }}>🔒 system</span> : '—' },
  ]

  return (
    <div style={card}>
      <div style={sectionTitle}>
        <CircleDot size={15} />
        Classification Registry
        <span style={{ marginRight: 'auto' }} />
        {loading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
        {!loading && !error &&
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
            {registry.length} tiers
          </span>
        }
      </div>
      {error
        ? <>
            <ErrorBanner message={error} />
            {/* Distinguish permission-denied from other errors */}
            {(error.toLowerCase().includes('permission') || error.toLowerCase().includes('insufficient')) && (
              <div style={{
                marginTop: '12px', padding: '12px 16px',
                background: '#f59e0b11', border: '1px solid #f59e0b44',
                borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)',
                lineHeight: 1.6,
              }}>
                <strong style={{ color: '#f59e0b' }}>Firestore rules not deployed.</strong>
                {' '}The <code>classifications</code> collection rule is in <code>firestore.rules</code>
                {' '}but has not been published to Firebase yet.<br />
                <strong>To fix:</strong> deploy the rules file (Firebase Console → Firestore → Rules → Publish),
                then reload this page.
              </div>
            )}
          </>
        : <>
            {!loading && registry.length === 0 && (
              <div style={{
                padding: '16px', background: '#f59e0b11',
                border: '1px solid #f59e0b44', borderRadius: '8px',
                marginBottom: '12px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '4px' }}>
                  Registry not seeded
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
                  The <code>classifications</code> collection is empty. The RF-0 migration
                  hasn't been run yet. Click below to seed the default classification tiers now.
                </div>
                <button
                  onClick={onSeed}
                  disabled={seeding}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 14px', borderRadius: '7px', fontSize: '12px',
                    fontWeight: 600, cursor: seeding ? 'not-allowed' : 'pointer',
                    background: '#f59e0b22', border: '1px solid #f59e0b88',
                    color: '#f59e0b', transition: 'opacity 0.15s',
                    opacity: seeding ? 0.7 : 1,
                  }}
                >
                  {seeding
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Seeding…</>
                    : <><DatabaseZap size={13} />Seed Default Classifications</>
                  }
                </button>
                {seedResult && (
                  <div style={{ marginTop: '8px', fontSize: '12px',
                    color: seedResult.startsWith('Error') ? '#ef4444' : '#22c55e' }}>
                    {seedResult}
                  </div>
                )}
              </div>
            )}
            <DataTable
              columns={columns}
              rows={registry.map((r) => ({ ...r, _key: r.id }))}
              loading={loading}
              emptyText="No classifications found"
              emptySubtext="Use the Seed button above to populate default tiers"
            />
          </>
      }
    </div>
  )
}

// ── Summary section ───────────────────────────────────────────

function SummarySection({ pharmacies, registry }: {
  pharmacies: PharmacyWithClassification[]
  registry:   BranchClassification[]
}) {
  const summary = useMemo(
    () => computeClassificationSummary(pharmacies, registry),
    [pharmacies, registry]
  )

  const migrationPct = summary.totalBranches === 0 ? 0 :
    Math.round((summary.migratedCount / summary.totalBranches) * 100)

  return (
    <div style={card}>
      <div style={sectionTitle}>
        <CheckCircle2 size={15} />
        Branch Classification Summary
      </div>

      {/* Top-level stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={statCard('#6b7280')}>
          <div style={statNum}>{summary.totalBranches}</div>
          <div style={statLabel}>Total Branches</div>
        </div>
        <div style={statCard('#22c55e')}>
          <div style={statNum}>{summary.migratedCount}</div>
          <div style={statLabel}>Migrated (v{CLASSIFICATION_SCHEMA_VERSION}) · {migrationPct}%</div>
        </div>
        <div style={statCard('#f59e0b')}>
          <div style={statNum}>{summary.unmigratedCount}</div>
          <div style={statLabel}>Pending Migration</div>
        </div>
        <div style={statCard('#ef4444')}>
          <div style={statNum}>{summary.unclassifiedCount}</div>
          <div style={statLabel}>Unclassified</div>
        </div>
        <div style={statCard('#dc2626')}>
          <div style={statNum}>{summary.missingCount}</div>
          <div style={statLabel}>Never Set (null)</div>
        </div>
      </div>

      {/* Per-tier breakdown */}
      {summary.buckets.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            Branches per tier
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {summary.buckets.map((b) => (
              <div key={b.classificationId} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '8px 14px',
                minWidth: '140px',
              }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {b.count}
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {b.labelAr}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {b.classificationId === '__missing__' ? (
                      <span style={{ color: '#ef4444' }}>⚠ null value</span>
                    ) : (
                      <code>{b.classificationId}</code>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Branch list section ───────────────────────────────────────

function BranchListSection({ pharmacies, registry, loading, error, search, setSearch }: {
  pharmacies: PharmacyWithClassification[]
  registry:   BranchClassification[]
  loading:    boolean
  error:      string | null
  search:     string
  setSearch:  (v: string) => void
}) {
  const registryMap = useMemo(() => {
    const m = new Map<string, string>()
    registry.forEach((r) => m.set(r.id, r.label))
    return m
  }, [registry])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return pharmacies
    return pharmacies.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q) ||
      p.branchClassification?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q)
    )
  }, [pharmacies, search])

  const columns = [
    { key: 'name',  label: 'Branch Name', sortable: true,
      render: (_v: unknown, p: PharmacyWithClassification) =>
        <span style={{ fontWeight: 500 }}>{p?.name ?? '—'}</span> },
    { key: 'code',  label: 'Code',  sortable: true,
      render: (_v: unknown, p: PharmacyWithClassification) =>
        <code style={{ fontSize: '11px' }}>{p?.code ?? '—'}</code> },
    { key: 'branchClassification', label: 'Classification', sortable: true,
      render: (_v: unknown, p: PharmacyWithClassification) => {
        if (!p) return <span style={{ color: 'var(--text-muted)' }}>—</span>
        const id    = p.branchClassification ?? UNCLASSIFIED_ID
        const label = registryMap.get(id) ?? id
        if (!p.branchClassification)
          return <span style={{ color: '#f59e0b', fontSize: '12px' }}>🟡 Unclassified</span>
        if (id === UNCLASSIFIED_ID)
          return <span style={{ color: '#f59e0b', fontSize: '12px' }}>🟡 Unclassified</span>
        return (
          <span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
            <code style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '6px' }}> ({id})</code>
          </span>
        )
      },
    },
    { key: 'schemaVersion', label: 'Schema', sortable: true,
      render: (_v: unknown, p: PharmacyWithClassification) => {
        const v  = p?.schemaVersion
        const ok = (v ?? 0) >= CLASSIFICATION_SCHEMA_VERSION
        return (
          <span style={{ fontSize: '11px', color: ok ? '#22c55e' : '#f59e0b', fontWeight: 500 }}>
            {formatSchemaVersion(v)}
          </span>
        )
      },
    },
    { key: 'branchClassificationSource', label: 'Source',
      render: (_v: unknown, p: PharmacyWithClassification) =>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {formatSource(p?.branchClassificationSource ?? null)}
        </span> },
    { key: 'branchClassificationSetAt', label: 'Set At',
      render: (_v: unknown, p: PharmacyWithClassification) => {
        const v = p?.branchClassificationSetAt
        if (!v) return <span style={{ color: 'var(--text-muted)' }}>—</span>
        const d = new Date(v)
        return (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
          </span>
        )
      },
    },
    { key: 'id', label: 'Pharmacy ID',
      render: (_v: unknown, p: PharmacyWithClassification) =>
        <code style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p?.id?.slice(0, 12) ?? '—'}…</code> },
  ]

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={sectionTitle}>
          <GitBranch size={15} />
          Branch List
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
            ({filtered.length}{filtered.length !== pharmacies.length ? ` of ${pharmacies.length}` : ''})
          </span>
        </div>
        <input
          type="text"
          placeholder="Search branches…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            marginRight: 'auto',
            padding: '6px 12px',
            fontSize: '13px',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            width: '220px',
          }}
        />
      </div>
      {error
        ? <ErrorBanner message={error} />
        : <DataTable
            columns={columns}
            rows={filtered.map((p) => ({ ...p, _key: p.id }))}
            loading={loading}
            emptyText={search ? 'No branches match your search' : 'No branches found'}
            emptySubtext={!search ? 'Run the RF-0 migration to populate classification data' : ''}
          />
      }
    </div>
  )
}

// ── Error banner ──────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      background: '#dc262622', border: '1px solid #dc262644',
      borderRadius: '8px', padding: '12px 16px',
    }}>
      <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }} />
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', marginBottom: '2px' }}>
          Error loading data
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{message}</div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function BranchClassificationsPage() {
  const { userProfile } = useAuthStore()

  const [registry,   setRegistry]   = useState<BranchClassification[]>([])
  const [pharmacies, setPharmacies] = useState<PharmacyWithClassification[]>([])
  const [regLoading, setRegLoading] = useState(true)
  const [phLoading,  setPhLoading]  = useState(true)
  const [regError,   setRegError]   = useState<string | null>(null)
  const [phError,    setPhError]    = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [seeding,    setSeeding]    = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)

  // Seed the classification registry from DEFAULT_CLASSIFICATIONS.
  // createClassification() is idempotent — skips docs that already exist.
  const handleSeedRegistry = async () => {
    setSeeding(true)
    setSeedResult(null)
    let seeded = 0
    let skipped = 0
    const errors: string[] = []
    for (const cls of DEFAULT_CLASSIFICATIONS) {
      try {
        await createClassification(cls, userProfile?.uid ?? '', userProfile?.role ?? 'admin')
        seeded++
      } catch (err: unknown) {
        // createClassification skips existing docs silently — if it throws,
        // it's a real error (e.g. permissions). Count skips separately.
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
          skipped++
        } else {
          errors.push(`${cls.id}: ${msg}`)
        }
      }
    }
    setSeeding(false)
    if (errors.length > 0) {
      setSeedResult(`Errors: ${errors.join(', ')}`)
    } else {
      setSeedResult(`Seeded ${seeded} classification${seeded !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} already existed` : ''}. Registry will update automatically.`)
    }
    // Registry updates via subscribeToClassifications — no manual reload needed
  }

  // Real-time subscription for classification registry.
  // Fires automatically when seeding completes — no manual refresh needed.
  useEffect(() => {
    setRegLoading(true)
    const unsub = subscribeToClassifications(
      (data) => {
        setRegistry(data.sort((a, b) => a.order - b.order))
        setRegLoading(false)
      },
      (err) => {
        setRegError(err?.message ?? 'Failed to load classification registry')
        setRegLoading(false)
      },
    )
    return unsub
  }, [])

  // Real-time subscription for pharmacies
  useEffect(() => {
    setPhLoading(true)
    const unsub = subscribeToPharmaciesWithClassification(
      (data) => { setPharmacies(data); setPhLoading(false) },
      (err)  => { setPhError(err?.message ?? 'Failed to load branches'); setPhLoading(false) },
    )
    return unsub
  }, [])

  const loading = regLoading || phLoading

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <GitBranch size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Branch Classifications
          </h1>
          <span style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.07em',
            padding: '2px 8px', borderRadius: '4px',
            background: 'var(--accent)22', color: 'var(--accent)',
            textTransform: 'uppercase',
          }}>
            RF-0 · Read-only
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Verify the Branch Classification Foundation. All data is read-only.
          To assign classifications, use the API or run the migration.
        </p>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px',
            fontSize: '12px', color: 'var(--text-muted)' }}>
            <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            Loading…
          </div>
        )}
      </div>

      {/* Section 1: Registry */}
      <RegistrySection
        registry={registry}
        loading={regLoading}
        error={regError}
        seeding={seeding}
        seedResult={seedResult}
        onSeed={handleSeedRegistry}
      />

      {/* Section 2: Summary */}
      {!phLoading && !phError && (
        <SummarySection
          pharmacies={pharmacies}
          registry={registry}
        />
      )}

      {/* Section 3: Branch list */}
      <BranchListSection
        pharmacies={pharmacies}
        registry={registry}
        loading={phLoading}
        error={phError}
        search={search}
        setSearch={setSearch}
      />
    </div>
  )
}
