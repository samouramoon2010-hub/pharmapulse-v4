// ============================================================
// BackupSettingsSection — manual, on-demand Firestore backup export
//
// Real automated backup (gcloud firestore export on a schedule)
// needs GCP billing enabled on pharmapulse-646de, which is currently
// off — see docs/production/FIRESTORE_BACKUP_QUICK_RUNBOOK.md. Until
// then, this is the realistic fallback: an admin clicks a button,
// gets a single JSON file with every business-data collection. It is
// read-only against Firestore — no write, no delete, no schedule.
// ============================================================
import React, { useState } from 'react'
import { DatabaseBackup, Loader2, Download, ShieldAlert } from 'lucide-react'
import { auth } from '../../services/firebase'
import { useToastStore } from '../ui/Toast'

export default function BackupSettingsSection() {
  const [loading, setLoading] = useState(false)
  const toast = useToastStore()

  async function handleDownload() {
    if (!auth.currentUser) return
    setLoading(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/.netlify/functions/pharmapulse-backup', {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Backup request failed (${res.status})`)
      }
      const blob = await res.blob()
      const dateStr = new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `pharmapulse-backup-${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
      toast.show('Backup downloaded', 'success')
    } catch (err) {
      toast.show(err.message || 'Backup failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-xl"
           style={{ background: 'color-mix(in srgb, var(--brand-400) 8%, transparent)', border: '1px solid var(--border-subtle)' }}>
        <DatabaseBackup className="flex-shrink-0 mt-0.5" style={{ width: 18, height: 18, color: 'var(--brand-400)' }} strokeWidth={1.75} />
        <div style={{ fontSize: 'var(--font-body, 13px)', color: 'var(--text-secondary)' }}>
          Downloads every business-data collection as one JSON file — read-only,
          nothing is written or deleted. This is a manual snapshot you keep yourself;
          it does not run on a schedule.
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl"
           style={{ background: 'color-mix(in srgb, var(--status-warning-500, #f59e0b) 10%, transparent)', border: '1px solid var(--border-subtle)' }}>
        <ShieldAlert className="flex-shrink-0 mt-0.5" style={{ width: 18, height: 18, color: 'var(--status-warning-500, #f59e0b)' }} strokeWidth={1.75} />
        <div style={{ fontSize: 'var(--font-caption, 11px)', color: 'var(--text-secondary)' }}>
          Automated cloud backups are not active yet — they require enabling billing
          on the Google Cloud project. Until that's done, download a backup here
          periodically and store it somewhere safe.
        </div>
      </div>

      <button
        onClick={handleDownload}
        disabled={loading}
        className="flex items-center gap-2 px-4 rounded-lg font-medium transition-all"
        style={{
          height: 'var(--density-control-height, 34px)',
          background: 'var(--brand-500)', color: '#fff',
          fontSize: 'var(--font-body, 13px)',
          opacity: loading ? 0.7 : 1,
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <Download style={{ width: 15, height: 15 }} />}
        {loading ? 'Preparing backup…' : 'Download full backup (JSON)'}
      </button>
    </div>
  )
}
