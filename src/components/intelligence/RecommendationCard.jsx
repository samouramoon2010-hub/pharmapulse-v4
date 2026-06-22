// ============================================================
// RecommendationCard — Single recommendation (Phase 6E)
//
// Pure presentational. Displays exactly the fields produced by the
// existing generateRecommendations() kernel — priority, impact,
// confidence, difficulty, expected gain, and the basedOn pointer
// that makes the recommendation explainable. No scoring here.
// ============================================================
import React from 'react'
import { Target } from 'lucide-react'

const PRIORITY_COLOR = { high: '#f87171', medium: '#fbbf24', low: 'var(--text-muted)' }

export default function RecommendationCard({ item }) {
  if (!item) return null

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '8px', padding: '10px', marginBottom: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Target style={{ width: 12, height: 12, color: '#60a5fa' }} strokeWidth={1.5} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</span>
        </div>
        <span style={{ fontSize: '9px', fontWeight: 700, color: PRIORITY_COLOR[item.priority], textTransform: 'uppercase' }}>
          {item.priority}
        </span>
      </div>

      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>{item.description}</div>

      <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--text-secondary)' }}>
        <span>Impact: {item.impact.toFixed(1)}</span>
        <span>Confidence: {(item.confidence * 100).toFixed(0)}%</span>
        <span>Difficulty: {item.difficulty}</span>
        <span>Expected gain: {item.expectedGain.toFixed(1)}</span>
      </div>
    </div>
  )
}
