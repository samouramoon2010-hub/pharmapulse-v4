// ============================================================
// Command Palette — Linear-style ⌘K global search
// ============================================================
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutDashboard, Users, Building2, Target,
  ClipboardList, FileSpreadsheet, Settings, Palette,
  ChevronRight, Command, Hash,
} from 'lucide-react'
import { useSettingsStore, THEMES } from '../../store/settingsStore'
import { usePharmacyStore } from '../../store/pharmacyStore'

// ── Command registry ──────────────────────────────────────────
function useCommands(navigate, setTheme) {
  const { pharmacies } = usePharmacyStore()

  return useMemo(() => {
    const nav = (label, path, icon, section = 'Navigation') => ({
      id: `nav-${path}`, type:'navigation', label, path, icon, section,
    })
    const act = (label, action, icon, section = 'Actions', shortcut) => ({
      id: `act-${label}`, type:'action', label, action, icon, section, shortcut,
    })

    const base = [
      // Navigation
      nav('Dashboard',      '/dashboard',    LayoutDashboard),
      nav('KPI Entry',      '/entry',        ClipboardList),
      nav('Pharmacies',     '/pharmacies',   Building2),
      nav('Users',          '/users',        Users),
      nav('Targets',        '/targets',      Target),
      nav('Import Center',  '/import',       FileSpreadsheet),
      nav('Audit Log',      '/audit',        Hash),
      nav('Settings',       '/settings',     Settings),

      // Actions
      act('Add Pharmacy',   () => navigate('/pharmacies'), Building2, 'Quick Actions'),
      act('Add User',       () => navigate('/users'),      Users,      'Quick Actions'),
      act('Enter KPI',      () => navigate('/entry'),      ClipboardList,'Quick Actions'),

      // Themes
      ...Object.entries(THEMES).map(([, val]) => ({
        id:`theme-${val}`, type:'theme', label:`Switch to ${val} theme`,
        action:() => setTheme(val), icon:Palette, section:'Themes',
      })),
    ]

    // Pharmacies search
    const pharmCommands = pharmacies.slice(0,6).map((p) => ({
      id:`ph-${p.id}`, type:'navigation', label:p.name, sub:p.code,
      path:'/pharmacies', icon:Building2, section:'Pharmacies',
    }))

    return [...base, ...pharmCommands]
  }, [pharmacies])
}

// ── Main palette ──────────────────────────────────────────────
function Palette_({ onClose }) {
  const navigate = useNavigate()
  const { setTheme } = useSettingsStore()
  const { subscribe } = usePharmacyStore()
  const [query, setQuery]   = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef  = useRef(null)
  const listRef   = useRef(null)

  const commands = useCommands(navigate, setTheme)

  useEffect(() => { const u = subscribe(); return u }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 12)
    const q = query.toLowerCase()
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.section?.toLowerCase().includes(q) ||
      c.sub?.toLowerCase().includes(q)
    ).slice(0, 12)
  }, [commands, query])

  useEffect(() => { setCursor(0) }, [filtered])
  useEffect(() => { inputRef.current?.focus() }, [])

  const run = (cmd) => {
    if (cmd.path) navigate(cmd.path)
    if (cmd.action) cmd.action()
    onClose()
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c+1, filtered.length-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor((c) => Math.max(c-1, 0)) }
    if (e.key === 'Enter' && filtered[cursor]) run(filtered[cursor])
    if (e.key === 'Escape') onClose()
  }

  // Scroll cursor into view
  useEffect(() => {
    const el = listRef.current?.children[cursor]
    el?.scrollIntoView({ block:'nearest' })
  }, [cursor])

  // Group by section
  const groups = useMemo(() => {
    const map = {}
    filtered.forEach((cmd) => {
      const sec = cmd.section || 'Other'
      if (!map[sec]) map[sec] = []
      map[sec].push(cmd)
    })
    return Object.entries(map)
  }, [filtered])

  let globalIdx = 0

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      display:'flex', alignItems:'flex-start', justifyContent:'center',
      paddingTop:'20vh',
    }}>
      {/* Backdrop */}
      <div style={{
        position:'absolute', inset:0,
        background:'rgba(0,0,0,0.6)',
        backdropFilter:'blur(8px)',
        WebkitBackdropFilter:'blur(8px)',
      }} onClick={onClose} />

      {/* Panel */}
      <div style={{
        position:'relative', width:'100%', maxWidth:'520px', margin:'0 16px',
        background:'var(--bg-elevated)',
        border:'1px solid var(--border-strong)',
        borderRadius:'12px',
        boxShadow:'0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
        overflow:'hidden',
        animation:'scaleIn 0.18s ease-out both',
      }}>

        {/* Search input */}
        <div style={{
          display:'flex', alignItems:'center', gap:'10px',
          padding:'12px 14px',
          borderBottom:'1px solid var(--border-subtle)',
        }}>
          <Search style={{ width:16, height:16, color:'var(--text-muted)', flexShrink:0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search commands, pages, pharmacies..."
            style={{
              flex:1, background:'transparent', border:'none', outline:'none',
              color:'var(--text-primary)', fontSize:'14px',
              fontFamily:"'Inter',sans-serif", fontWeight:400,
            }}
          />
          <kbd style={{
            padding:'2px 6px', borderRadius:'4px', fontSize:'10px',
            background:'var(--bg-overlay)', border:'1px solid var(--border-default)',
            color:'var(--text-muted)', fontFamily:'monospace',
          }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef}
             style={{ maxHeight:'380px', overflowY:'auto', padding:'6px' }}>
          {groups.length === 0 ? (
            <div style={{ padding:'24px', textAlign:'center', color:'var(--text-muted)', fontSize:'13px' }}>
              No results for "{query}"
            </div>
          ) : groups.map(([section, cmds]) => (
            <div key={section}>
              <div style={{
                padding:'8px 8px 4px',
                fontSize:'10px', fontWeight:500, letterSpacing:'0.06em',
                textTransform:'uppercase', color:'var(--text-muted)',
                fontFamily:"'Inter',sans-serif",
              }}>
                {section}
              </div>
              {cmds.map((cmd) => {
                const idx = globalIdx++
                const active = idx === cursor
                const Icon = cmd.icon
                return (
                  <div key={cmd.id}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => run(cmd)}
                    style={{
                      display:'flex', alignItems:'center', gap:'10px',
                      padding:'7px 8px', borderRadius:'7px', cursor:'pointer',
                      background: active ? 'var(--bg-active)' : 'transparent',
                      border:`1px solid ${active ? 'var(--border-brand)' : 'transparent'}`,
                      transition:'all 0.1s',
                    }}>
                    <div style={{
                      width:'26px', height:'26px', borderRadius:'6px', flexShrink:0,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      background: active ? 'rgba(0,210,173,0.12)' : 'var(--bg-overlay)',
                      border:'1px solid var(--border-subtle)',
                    }}>
                      {Icon && <Icon style={{ width:13, height:13, color: active ? 'var(--brand-400)' : 'var(--text-muted)' }} strokeWidth={1.75} />}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{
                        fontSize:'13px', fontWeight:400,
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        truncate: true, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      }}>
                        {cmd.label}
                      </div>
                      {cmd.sub && (
                        <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'1px' }}>
                          {cmd.sub}
                        </div>
                      )}
                    </div>
                    {active && (
                      <ChevronRight style={{ width:13, height:13, color:'var(--brand-400)', flexShrink:0 }} />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'12px',
          padding:'8px 14px',
          borderTop:'1px solid var(--border-subtle)',
          fontSize:'10px', color:'var(--text-muted)',
        }}>
          <span><kbd style={{ padding:'1px 4px', borderRadius:'3px', background:'var(--bg-overlay)', border:'1px solid var(--border-default)', fontFamily:'monospace' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ padding:'1px 4px', borderRadius:'3px', background:'var(--bg-overlay)', border:'1px solid var(--border-default)', fontFamily:'monospace' }}>↵</kbd> select</span>
        </div>
      </div>
    </div>
  )
}

// ── Hook for global ⌘K binding ────────────────────────────────
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return { open, setOpen }
}

export default Palette_
