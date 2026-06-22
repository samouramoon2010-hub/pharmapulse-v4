// ============================================================
// Phase 6E — Executive Intelligence Dashboard Components
//
// Source-inspection tests for ExecutiveInsightPanel, StrengthCard,
// RiskCard, OpportunityCard, RecommendationCard, ExecutiveSummaryCard.
// Verifies read-only behavior, no Firestore, no insight/recommendation
// math performed inside React.
// ============================================================
import { describe, it, expect } from 'vitest'

import ExecutiveInsightPanelSrc from '../../components/intelligence/ExecutiveInsightPanel.jsx?raw'
import StrengthCardSrc from '../../components/intelligence/StrengthCard.jsx?raw'
import RiskCardSrc from '../../components/intelligence/RiskCard.jsx?raw'
import OpportunityCardSrc from '../../components/intelligence/OpportunityCard.jsx?raw'
import RecommendationCardSrc from '../../components/intelligence/RecommendationCard.jsx?raw'
import ExecutiveSummaryCardSrc from '../../components/intelligence/ExecutiveSummaryCard.jsx?raw'

const ALL: [string, string][] = [
  ['ExecutiveInsightPanel', ExecutiveInsightPanelSrc],
  ['StrengthCard', StrengthCardSrc],
  ['RiskCard', RiskCardSrc],
  ['OpportunityCard', OpportunityCardSrc],
  ['RecommendationCard', RecommendationCardSrc],
  ['ExecutiveSummaryCard', ExecutiveSummaryCardSrc],
]

const PRESENTATIONAL = ALL.filter(([name]) => name !== 'ExecutiveInsightPanel')

describe('Phase 6E — no direct Firestore access', () => {
  for (const [name, src] of ALL) {
    it(`${name} does not import from 'firebase/firestore'`, () => {
      expect(src).not.toMatch(/from ['"]firebase\/firestore['"]/)
    })
  }
})

describe('Phase 6E — read-only (no write calls anywhere)', () => {
  for (const [name, src] of ALL) {
    it(`${name} does not call any *Document write function`, () => {
      expect(src).not.toMatch(/create\w*Document\(|update\w*Document\(|archive\w*Document\(/)
    })
    it(`${name} does not call addDoc/setDoc/updateDoc/deleteDoc directly`, () => {
      expect(src).not.toMatch(/\baddDoc\(|\bsetDoc\(|\bupdateDoc\(|\bdeleteDoc\(/)
    })
  }
})

describe('Phase 6E — no insight/recommendation/opportunity math duplicated inside React', () => {
  const FORBIDDEN = [
    /function analyzeOpportunities/, /function buildExecutiveSummary/, /function generateRecommendations/,
    /function deriveStrengths/, /function deriveRisks/, /function deriveOpportunities/,
    /function computeBenchmark/, /function computeTrend/, /function derivePriority/, /function deriveDifficulty/,
  ]
  for (const [name, src] of ALL) {
    for (const pattern of FORBIDDEN) {
      it(`${name} does not inline-define ${pattern}`, () => {
        expect(src).not.toMatch(pattern)
      })
    }
  }
})

describe('Phase 6E — presentational cards take only their documented prop', () => {
  it('StrengthCard takes only an "item" prop', () => expect(StrengthCardSrc).toMatch(/function StrengthCard\(\{ item \}\)/))
  it('RiskCard takes only an "item" prop', () => expect(RiskCardSrc).toMatch(/function RiskCard\(\{ item \}\)/))
  it('OpportunityCard takes only an "item" prop', () => expect(OpportunityCardSrc).toMatch(/function OpportunityCard\(\{ item \}\)/))
  it('RecommendationCard takes only an "item" prop', () => expect(RecommendationCardSrc).toMatch(/function RecommendationCard\(\{ item \}\)/))
  it('ExecutiveSummaryCard takes only a "summary" prop', () => expect(ExecutiveSummaryCardSrc).toMatch(/function ExecutiveSummaryCard\(\{ summary \}\)/))
  for (const [name, src] of PRESENTATIONAL) {
    it(`${name} has no useEffect (pure render, no data fetching)`, () => {
      expect(src).not.toMatch(/useEffect/)
    })
  }
})

describe('Phase 6E — ExecutiveInsightPanel specifics', () => {
  it('imports listLedgerEntries from the existing ledger service', () => {
    expect(ExecutiveInsightPanelSrc).toContain('listLedgerEntries')
  })
  it('imports analyzeOpportunities/computeBenchmark/computeTrend/buildExecutiveSummary/generateRecommendations from existing kernels', () => {
    for (const fn of ['analyzeOpportunities', 'computeBenchmark', 'computeTrend', 'buildExecutiveSummary', 'generateRecommendations']) {
      expect(ExecutiveInsightPanelSrc).toContain(fn)
    }
  })
  it('uses a cancellation guard on its data-fetching effect', () => {
    expect(ExecutiveInsightPanelSrc).toMatch(/cancelledRef/)
    expect(ExecutiveInsightPanelSrc).toMatch(/return \(\) => \{ cancelledRef\.current = true \}/)
  })
  it('routes errors through normalizeError', () => {
    expect(ExecutiveInsightPanelSrc).toContain('normalizeError')
  })
  it('renders SkeletonWidget while loading and ErrorState on error', () => {
    expect(ExecutiveInsightPanelSrc).toMatch(/if \(loading\) return <SkeletonWidget/)
    expect(ExecutiveInsightPanelSrc).toMatch(/if \(error\) return <ErrorState/)
  })
  it('does not implement drag-and-drop', () => {
    expect(ExecutiveInsightPanelSrc).not.toMatch(/onDragStart=|onDrop=|draggable=\{true\}/)
  })
})
