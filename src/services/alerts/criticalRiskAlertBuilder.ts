// ============================================================
// Critical Risk Alert Builder
//
// Pure formatter: BranchRollupSummary[] (already computed by
// regionalIntelligence's generateBranchRollup — the SAME data the
// Regional Intelligence panel renders) -> an email-ready alert
// payload. Never recomputes risk, never fetches data, never decides
// who "should" get alerted beyond the recipient list it's given.
//
// Real proactive alerting today is admin-triggered (a button that
// sends this payload through the pharmapulse-send-alert Netlify
// function) rather than a background cron job — see
// docs comment in that function for why.
// ============================================================

import type { BranchRollupSummary } from '../../engine/regionalIntelligence/regionalTypes'

export interface CriticalRiskAlertPayload {
  subject:  string
  html:     string
  text:     string
  branchCount: number
}

/** Only HIGH_RISK branches are alert-worthy — MEDIUM/LOW/ON_TRACK stay in-app. */
export function selectCriticalRiskBranches(branchRollups: BranchRollupSummary[]): BranchRollupSummary[] {
  return branchRollups.filter((b) => b.riskLevel === 'HIGH_RISK')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Builds the alert payload for the given critical branches. Returns
 * null when there is nothing to alert on — callers must never send
 * an empty "everything is fine" email framed as an alert.
 */
export function buildCriticalRiskAlert(branchRollups: BranchRollupSummary[], periodLabel: string): CriticalRiskAlertPayload | null {
  const critical = selectCriticalRiskBranches(branchRollups)
  if (critical.length === 0) return null

  const subject = `PharmaPulse — ${critical.length} branch${critical.length === 1 ? '' : 'es'} at critical risk (${periodLabel})`

  const rows = critical
    .slice()
    .sort((a, b) => a.branchScore - b.branchScore)
    .map((b) => ({
      name:  b.branchName || b.branchCode || b.branchId,
      score: Math.round(b.branchScore),
      momentum: b.momentumDirection,
    }))

  const htmlRows = rows.map((r) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.name)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${r.score}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(r.momentum)}</td></tr>`,
  ).join('')

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;">
      <h2 style="margin:0 0 8px;">Critical Risk Alert — ${escapeHtml(periodLabel)}</h2>
      <p style="margin:0 0 16px;color:#4b5563;">${critical.length} branch${critical.length === 1 ? ' is' : 'es are'} at HIGH_RISK. Sign in to Regional Intelligence for full detail.</p>
      <table style="border-collapse:collapse;width:100%;max-width:480px;">
        <thead><tr>
          <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #111827;">Branch</th>
          <th style="text-align:center;padding:6px 10px;border-bottom:2px solid #111827;">Score</th>
          <th style="text-align:center;padding:6px 10px;border-bottom:2px solid #111827;">Momentum</th>
        </tr></thead>
        <tbody>${htmlRows}</tbody>
      </table>
    </div>
  `.trim()

  const text = [
    `Critical Risk Alert — ${periodLabel}`,
    `${critical.length} branch(es) at HIGH_RISK:`,
    ...rows.map((r) => `- ${r.name}: score ${r.score}, momentum ${r.momentum}`),
  ].join('\n')

  return { subject, html, text, branchCount: critical.length }
}
