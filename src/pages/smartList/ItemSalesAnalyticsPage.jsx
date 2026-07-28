// ============================================================
// Item Sales Analytics (DX-12b)
//
// Reads the Smart List monthly aggregates (item_sales_monthly /
// item_sales_branch_monthly) and turns them into decisions:
//   1. Branch pulse — net sales, returns, concentration
//   2. Evidence — daily trend, division mix, top items
//   3. Drill down — per-pharmacist contribution, strengths and
//      focus areas derived by comparing each pharmacist's division
//      mix to the branch mix (rank-based, never invented benchmarks
//      — see engine/itemSales/itemSalesInsights.ts).
//
// Empty state is explicit: months with no imported smart list say
// so and point admins to Data Exchange Studio — zeros are never
// fabricated.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  ShoppingBasket, TrendingUp, RotateCcw, Package, Users,
  ChevronDown, ChevronUp, Loader2, AlertTriangle, Sparkles, Target, GitCompare, Tags,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useScopeProfile } from '../../hooks/useScopeProfile'
import { filterAllowedPharmacies } from '../../services/scopeResolver'
import { fetchItemSalesMonth, listItemSalesMonths, fetchBranchMonthlyForBranches } from '../../services/itemSalesService'
import {
  buildBranchDailySeries, withDivisionShares, compareDivisionMix, compareCategoryMix,
  returnsRatePct, topItemsConcentrationPct, rankPharmacistContributions, compareBranches,
} from '../../engine/itemSales/itemSalesInsights'
import { formatNumber } from '../../utils/helpers'

const money = (n) => formatNumber(n, { maximumFractionDigits: 0 })
const money2 = (n) => formatNumber(n, { maximumFractionDigits: 2 })

// Restrained palette: brand for primary series, one neutral ramp for mixes.
const DIVISION_COLORS = ['#6366f1', '#0d9488', '#d97706', '#e11d48', '#8b5cf6', '#64748b', '#94a3b8']

function ChartTip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-overlay)', border: '1px solid var(--border-default)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12.5,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {money2(p.value)}{unit ? ` ${unit}` : ''}
        </div>
      ))}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, warn }) {
  return (
    <div style={{
      flex: '1 1 150px', minWidth: 150, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>
        <Icon size={13} /> {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: warn ? '#ef4444' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, style }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 12, padding: '16px 18px', ...style,
    }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>
        <Icon size={15} /> {title}
      </h3>
      {children}
    </div>
  )
}

function DeltaChip({ delta }) {
  const positive = delta.deltaPct > 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5,
      padding: '3px 8px', borderRadius: 999, marginRight: 6, marginBottom: 4,
      background: positive ? 'rgba(22,163,74,0.10)' : 'rgba(217,119,6,0.10)',
      color: positive ? '#15803d' : '#b45309',
    }}>
      {positive ? <Sparkles size={11} /> : <Target size={11} />}
      {delta.division} {positive ? '+' : ''}{delta.deltaPct}%
    </span>
  )
}

function PharmacistCard({ contribution, doc, branchDoc }) {
  const [open, setOpen] = useState(false)
  const mix = useMemo(() => compareDivisionMix(doc, branchDoc), [doc, branchDoc])
  const categoryMix = useMemo(() => compareCategoryMix(doc, branchDoc), [doc, branchDoc])

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 180px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{doc.empName}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
            {contribution.matchedUserId ? 'Linked account' : 'Not linked to an app account'}
          </div>
        </div>
        <div style={{ minWidth: 110 }}>
          <div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{money(doc.netSales)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Net sales (SAR)</div>
        </div>
        <div style={{ minWidth: 90 }}>
          <div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{contribution.contributionPct}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Of branch</div>
        </div>
        <div style={{ minWidth: 90 }}>
          <div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
            {contribution.returnsRatePct == null ? '—' : `${contribution.returnsRatePct}%`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Returns rate</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-300)' }}
        >
          {open ? <>Hide details <ChevronUp size={14} /></> : <>Details <ChevronDown size={14} /></>}
        </button>
      </div>

      {(mix.strengths.length > 0 || mix.focusAreas.length > 0) && (
        <div style={{ marginTop: 10 }}>
          {mix.strengths.map((d) => <DeltaChip key={d.division} delta={d} />)}
          {mix.focusAreas.map((d) => <DeltaChip key={d.division} delta={d} />)}
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
            vs. this branch's division mix for the same month
          </div>
        </div>
      )}

      {(categoryMix.strengths.length > 0 || categoryMix.focusAreas.length > 0) && (
        <div style={{ marginTop: 8 }}>
          {categoryMix.strengths.map((d) => <DeltaChip key={`cat-${d.division}`} delta={d} />)}
          {categoryMix.focusAreas.map((d) => <DeltaChip key={`cat-${d.division}`} delta={d} />)}
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
            vs. this branch's category mix for the same month
          </div>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Top items</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '3px 6px', fontWeight: 600 }}>Item</th>
                <th style={{ padding: '3px 6px', fontWeight: 600 }}>Qty</th>
                <th style={{ padding: '3px 6px', fontWeight: 600 }}>Sales (SAR)</th>
              </tr>
            </thead>
            <tbody>
              {doc.topItems.slice(0, 8).map((t) => (
                <tr key={t.itemCode} style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <td style={{ padding: '4px 6px' }}>{t.itemDesc}</td>
                  <td style={{ padding: '4px 6px', fontVariantNumeric: 'tabular-nums' }}>{money2(t.quantity)}</td>
                  <td style={{ padding: '4px 6px', fontVariantNumeric: 'tabular-nums' }}>{money2(t.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BranchComparisonPanel({ allowedBranches, month, onDrillDown, onClose }) {
  const [selectedIds, setSelectedIds] = useState(() => allowedBranches.slice(0, 4).map((p) => p.id))
  const [status, setStatus] = useState('idle')   // idle | loading | ready | empty | error
  const [result, setResult] = useState(null)

  const nameById = useMemo(() => new Map(allowedBranches.map((p) => [p.id, p.name ?? p.code])), [allowedBranches])

  const toggle = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const runCompare = () => {
    if (selectedIds.length < 2 || !month) return
    setStatus('loading')
    fetchBranchMonthlyForBranches(selectedIds, month)
      .then((docs) => {
        setResult(compareBranches(docs))
        setStatus(docs.length > 0 ? 'ready' : 'empty')
      })
      .catch(() => setStatus('error'))
  }

  return (
    <SectionCard title="Compare branches" icon={GitCompare} style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        {allowedBranches.map((p) => (
          <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
            {p.name ?? p.code}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <button onClick={runCompare} disabled={selectedIds.length < 2 || !month} style={{ fontSize: 12.5, padding: '6px 12px', borderRadius: 8 }}>
          Compare {selectedIds.length} branches — {month}
        </button>
        <button onClick={onClose} style={{ fontSize: 12.5, padding: '6px 12px', borderRadius: 8, background: 'none', border: '1px solid var(--border-subtle)' }}>
          Close
        </button>
        {selectedIds.length < 2 && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Pick at least 2 branches</span>}
      </div>

      {status === 'loading' && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
          <Loader2 className="spin" size={15} /> Comparing…
        </p>
      )}
      {status === 'error' && (
        <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.08)', fontSize: 13, color: '#ef4444' }}>
          Could not load the comparison. Try again.
        </div>
      )}
      {status === 'empty' && (
        <div style={{ padding: 12, borderRadius: 8, border: '1px dashed var(--border-default)', fontSize: 12.5, color: 'var(--text-muted)' }}>
          None of the selected branches has an imported smart list for {month}.
        </div>
      )}
      {status === 'ready' && result && (
        <>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', marginBottom: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '4px 8px', fontWeight: 600 }}>Branch</th>
                <th style={{ padding: '4px 8px', fontWeight: 600 }}>Net sales (SAR)</th>
                <th style={{ padding: '4px 8px', fontWeight: 600 }}>Share</th>
                <th style={{ padding: '4px 8px', fontWeight: 600 }}>Top division</th>
                <th style={{ padding: '4px 8px', fontWeight: 600 }}>Returns rate</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr
                  key={r.branchId}
                  onClick={() => onDrillDown(r.branchId)}
                  style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  title="Click to open this branch's full view"
                >
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>{nameById.get(r.branchId) ?? r.branchId}</td>
                  <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{money(r.netSales)}</td>
                  <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{r.contributionPct}%</td>
                  <td style={{ padding: '6px 8px' }}>{r.topDivision ?? '—'}{r.topDivisionSharePct != null ? ` (${r.topDivisionSharePct}%)` : ''}</td>
                  <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{r.returnsRatePct == null ? '—' : `${r.returnsRatePct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.sharedTopItems.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Items in multiple branches' top sellers
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.sharedTopItems.slice(0, 10).map((it) => (
                  <span key={it.itemCode} style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 999,
                    background: 'var(--bg-muted)', color: 'var(--text-secondary)',
                  }}>
                    {it.itemDesc} · {it.branchCount} branches
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

export default function ItemSalesAnalyticsPage() {
  const { userProfile } = useAuthStore()
  const { pharmacies, subscribe: subscribePh } = usePharmacyStore()
  const { scope, loading: scopeLoading } = useScopeProfile()

  // The pharmacy store is realtime-Firestore-backed but only starts
  // streaming once something calls subscribe() — without this, a user
  // landing directly on /item-sales (rather than via Dashboard, which
  // already subscribes) sees an empty pharmacies list forever, and the
  // branch/month selects never populate.
  useEffect(() => {
    const unsubscribe = subscribePh()
    return () => unsubscribe?.()
  }, [subscribePh])

  const allowedBranches = useMemo(() => {
    if (!scope) return []
    return filterAllowedPharmacies(scope, pharmacies).filter((p) => p.active !== false)
  }, [scope, pharmacies])

  const [branchId, setBranchId] = useState('')
  const [months, setMonths] = useState(null)     // null = loading
  const [month, setMonth] = useState('')
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('idle')   // idle | loading | ready | empty | error
  const [compareOpen, setCompareOpen] = useState(false)

  // Default to the first allowed branch once scope resolves.
  useEffect(() => {
    if (!branchId && allowedBranches.length > 0) setBranchId(allowedBranches[0].id)
  }, [allowedBranches, branchId])

  // Load available months whenever the branch changes.
  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    setMonths(null)
    setMonth('')
    setData(null)
    listItemSalesMonths(branchId)
      .then((m) => {
        if (cancelled) return
        setMonths(m)
        if (m.length > 0) setMonth(m[0])
        else setStatus('empty')
      })
      .catch(() => { if (!cancelled) { setMonths([]); setStatus('error') } })
    return () => { cancelled = true }
  }, [branchId])

  // Load the month's data.
  useEffect(() => {
    if (!branchId || !month) return
    let cancelled = false
    setStatus('loading')
    fetchItemSalesMonth(branchId, month)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setStatus(d.branch ? 'ready' : 'empty')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [branchId, month])

  const branchDoc = data?.branch ?? null
  const pharmacistDocs = data?.pharmacists ?? []

  const dailySeries = useMemo(() => buildBranchDailySeries(pharmacistDocs), [pharmacistDocs])
  const divisionShares = useMemo(() => (branchDoc ? withDivisionShares(branchDoc.byDivision) : []), [branchDoc])
  const categoryShares = useMemo(() => (branchDoc ? withDivisionShares(branchDoc.byCategory ?? []) : []), [branchDoc])
  const contributions = useMemo(() => rankPharmacistContributions(pharmacistDocs), [pharmacistDocs])
  const docsByEmpId = useMemo(() => new Map(pharmacistDocs.map((d) => [d.empId, d])), [pharmacistDocs])
  const concentration = branchDoc ? topItemsConcentrationPct(branchDoc) : null
  const branchReturnsRate = branchDoc ? returnsRatePct(branchDoc) : null

  const isAdmin = userProfile?.role === 'admin'

  return (
    <div style={{ padding: 24, maxWidth: 1080 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <ShoppingBasket size={22} /> Item Sales
        </h1>
      </div>
      <p style={{ opacity: 0.75, marginBottom: 16, fontSize: 13.5 }}>
        Item-level performance from the monthly smart list — who sells what, where each
        pharmacist is strong, and which items carry the branch.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Branch
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ display: 'block', marginTop: 4, minWidth: 200 }}>
            {allowedBranches.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.code}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Month
          <select value={month} onChange={(e) => setMonth(e.target.value)} disabled={!months || months.length === 0} style={{ display: 'block', marginTop: 4, minWidth: 140 }}>
            {(months ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        {allowedBranches.length > 1 && (
          <button
            onClick={() => setCompareOpen((v) => !v)}
            style={{
              alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, padding: '7px 12px', borderRadius: 8,
              background: compareOpen ? 'var(--brand-300)' : 'none',
              color: compareOpen ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', cursor: 'pointer',
            }}
          >
            <GitCompare size={14} /> Compare branches
          </button>
        )}
      </div>

      {compareOpen && (
        <BranchComparisonPanel
          allowedBranches={allowedBranches}
          month={month}
          onClose={() => setCompareOpen(false)}
          onDrillDown={(id) => { setBranchId(id); setCompareOpen(false) }}
        />
      )}

      {(scopeLoading || status === 'loading' || (branchId && months === null)) && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
          <Loader2 className="spin" size={15} /> Loading item sales…
        </p>
      )}

      {status === 'error' && (
        <div style={{ padding: 14, borderRadius: 10, background: 'rgba(239,68,68,0.08)', fontSize: 13, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} /> Could not load item sales data. Check your connection and try again.
        </div>
      )}

      {status === 'empty' && (
        <div style={{
          padding: '36px 20px', textAlign: 'center', border: '1px dashed var(--border-default)',
          borderRadius: 12, color: 'var(--text-muted)',
        }}>
          <ShoppingBasket size={28} style={{ opacity: 0.5 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 10 }}>
            No smart list imported for this {months && months.length === 0 ? 'branch yet' : 'month'}
          </div>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            {isAdmin
              ? <>Upload the monthly smart list in <Link to="/data-exchange" style={{ color: 'var(--brand-300)' }}>Data Exchange Studio</Link> and it will appear here.</>
              : 'Ask your administrator to upload the monthly smart list.'}
          </p>
        </div>
      )}

      {status === 'ready' && branchDoc && (
        <>
          {/* 1 — Branch pulse */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatCard icon={TrendingUp} label="Net sales (SAR)" value={money(branchDoc.netSales)}
              sub={`${branchDoc.txCount.toLocaleString('en-US')} item lines`} />
            <StatCard icon={RotateCcw} label="Returns" value={money(branchDoc.returnsValue)}
              sub={branchReturnsRate == null ? `${branchDoc.returnsCount} lines` : `${branchReturnsRate}% of gross · ${branchDoc.returnsCount} lines`}
              warn={branchDoc.returnsValue > 0} />
            <StatCard icon={Users} label="Pharmacists" value={branchDoc.pharmacistCount}
              sub={branchDoc.unmatchedPharmacists.length > 0 ? `${branchDoc.unmatchedPharmacists.length} not linked to accounts` : 'All linked'} />
            <StatCard icon={Package} label="Top-5 items share" value={concentration == null ? '—' : `${concentration}%`}
              sub="Of net sales" />
          </div>

          {/* 2 — Evidence */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 14 }}>
            <SectionCard title="Daily net sales" icon={TrendingUp}>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={dailySeries} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="itemSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} tick={{ fontSize: 10.5, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={money} tick={{ fontSize: 10.5, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip content={<ChartTip unit="SAR" />} />
                  <Area type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} fill="url(#itemSalesFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title="Division mix" icon={Package}>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={divisionShares} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
                  <XAxis type="number" hide domain={[0, 'dataMax']} />
                  <YAxis type="category" dataKey="key" width={118} tick={{ fontSize: 10.5, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip unit="SAR" />} />
                  <Bar dataKey="sales" radius={[0, 6, 6, 0]} barSize={16}>
                    {divisionShares.map((d, i) => (
                      <Cell key={d.key} fill={DIVISION_COLORS[i % DIVISION_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {divisionShares.map((d, i) => (
                  <span key={d.key} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: DIVISION_COLORS[i % DIVISION_COLORS.length], display: 'inline-block' }} />
                    {d.key} {d.sharePct}%
                  </span>
                ))}
              </div>
            </SectionCard>

            {categoryShares.length > 0 && (
              <SectionCard title="Category mix" icon={Tags}>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={categoryShares} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
                    <XAxis type="number" hide domain={[0, 'dataMax']} />
                    <YAxis type="category" dataKey="key" width={118} tick={{ fontSize: 10.5, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip unit="SAR" />} />
                    <Bar dataKey="sales" radius={[0, 6, 6, 0]} barSize={16}>
                      {categoryShares.map((d, i) => (
                        <Cell key={d.key} fill={DIVISION_COLORS[i % DIVISION_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {categoryShares.map((d, i) => (
                    <span key={d.key} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: DIVISION_COLORS[i % DIVISION_COLORS.length], display: 'inline-block' }} />
                      {d.key} {d.sharePct}%
                    </span>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>

          <SectionCard title="Top items — branch" icon={Package} style={{ marginBottom: 14 }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '4px 8px', fontWeight: 600 }}>#</th>
                  <th style={{ padding: '4px 8px', fontWeight: 600 }}>Item</th>
                  <th style={{ padding: '4px 8px', fontWeight: 600 }}>Qty</th>
                  <th style={{ padding: '4px 8px', fontWeight: 600 }}>Sales (SAR)</th>
                </tr>
              </thead>
              <tbody>
                {branchDoc.topItems.slice(0, 10).map((t, i) => (
                  <tr key={t.itemCode} style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                    <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ padding: '5px 8px' }}>{t.itemDesc}</td>
                    <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{money2(t.quantity)}</td>
                    <td style={{ padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }}>{money2(t.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          {/* 3 — Drill down */}
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>
            <Users size={17} /> Pharmacists
          </h2>
          {contributions.map((c) => {
            const doc = docsByEmpId.get(c.empId)
            return doc ? <PharmacistCard key={c.empId} contribution={c} doc={doc} branchDoc={branchDoc} /> : null
          })}

          {branchDoc.unclassifiedRowCount > 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
              {branchDoc.unclassifiedRowCount.toLocaleString('en-US')} item lines had no division in the
              source file and are grouped under UNCLASSIFIED.
            </p>
          )}
        </>
      )}
    </div>
  )
}
