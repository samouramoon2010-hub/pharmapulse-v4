# KPI Intelligence Framework
## PharmaPulse Enterprise Analytics Engine

> **Version:** 1.0 · **Status:** Design Specification  
> **Author:** Samir Goda · **Project:** PharmaPulse Enterprise KPI System  
> **Purpose:** Complete reference for KPI calculations, intelligence layers, Firestore schema, and future AI-ready architecture

---

## Table of Contents

1. [Core KPI Definitions](#1-core-kpi-definitions)
2. [Achievement Calculations](#2-achievement-calculations)
3. [MTD Intelligence](#3-mtd-intelligence)
4. [Forecast Engine](#4-forecast-engine)
5. [Gap Analysis](#5-gap-analysis)
6. [Pace & Risk Engine](#6-pace--risk-engine)
7. [Trend & Momentum](#7-trend--momentum)
8. [Recovery Probability](#8-recovery-probability)
9. [Pharmacist Intelligence Layer](#9-pharmacist-intelligence-layer)
10. [Branch Manager Intelligence Layer](#10-branch-manager-intelligence-layer)
11. [Executive Intelligence Layer](#11-executive-intelligence-layer)
12. [Firestore Schema](#12-firestore-schema)
13. [KPI Analytics Engine Architecture](#13-kpi-analytics-engine-architecture)
14. [Dashboard Widgets Architecture](#14-dashboard-widgets-architecture)
15. [Future AI-Ready Layer](#15-future-ai-ready-layer)

---

## 1. Core KPI Definitions

### 1.1 KPI Registry

| Key | Name (EN) | Name (AR) | Unit | Aggregation | Period |
|-----|-----------|-----------|------|-------------|--------|
| `wasfaty` | Wasfaty | وصفتي | prescriptions | SUM | Daily |
| `omni` | OmniHealth | أومني هيلث | units | SUM | Daily |
| `wellness` | Wellness | ويلنس | units | SUM | Daily |
| `basket` | Basket Size | متوسط السلة | SAR | AVERAGE | Daily |
| `crossSelling` | Cross Selling | البيع المتقاطع | transactions | SUM | Daily |

### 1.2 Target Hierarchy

```
Global Target (Admin-set)
    └── Branch Monthly Target  →  targets/{pharmacyId}_{yyyy-MM}
            └── Per-KPI targets:
                    wasfatyTarget
                    omniTarget
                    wellnessTarget
                    basketTarget
                    crossSellTarget
```

### 1.3 Working Days Assumption

```
totalWorkingDays = totalCalendarDays   // All days are working days by default
// Future: configurable via settings/working_days_config
```

---

## 2. Achievement Calculations

### 2.1 Daily Achievement %

```
dailyAchievement(kpi, date) =
    (actualValue[kpi][date] / dailyTarget[kpi]) × 100

where:
    dailyTarget[kpi] = monthlyTarget[kpi] / totalDaysInMonth
```

### 2.2 MTD Achievement %

```
mtdAchievement(kpi, month) =
    (Σ actualValue[kpi][day₁..dayN] / monthlyTarget[kpi]) × 100

where:
    N = current day of month (for current month)
    N = last day (for historical months)
```

### 2.3 Branch Achievement % (Aggregate)

```
branchAchievement(branchId, kpi, month) =
    Σ pharmacistMTD[pharmacistᵢ][kpi] for all pharmacists in branch
    ─────────────────────────────────────────────────────────────
                    branchMonthlyTarget[kpi]
    × 100
```

### 2.4 Overall Achievement % (Composite)

```
overallAchievement =
    Σ weight[kpiᵢ] × mtdAchievement[kpiᵢ]
    ───────────────────────────────────────
              Σ weight[kpiᵢ]

Default weights (equal):
    wasfaty:      20%
    omni:         20%
    wellness:     20%
    basket:       20%
    crossSelling: 20%

// Future: configurable weights per branch/region
```

---

## 3. MTD Intelligence

### 3.1 Day Progress Ratio

```
dayProgress = currentDay / totalDaysInMonth

Example (Day 15 of 30):
    dayProgress = 15 / 30 = 0.50 (50%)
```

### 3.2 Expected MTD at Current Day

```
expectedMTD(kpi) = monthlyTarget[kpi] × dayProgress

Interpretation:
    On day 15 of 30, you should have reached 50% of the monthly target.
    If target = 200 prescriptions → expected = 100 by today.
```

### 3.3 MTD Delta

```
mtdDelta(kpi) = mtdActual[kpi] - expectedMTD[kpi]

Positive → ahead of schedule
Negative → behind schedule
```

### 3.4 Remaining to Target

```
remainingToTarget(kpi) = MAX(0, monthlyTarget[kpi] - mtdActual[kpi])

If mtdActual >= target → remainingToTarget = 0  (target already hit)
```

### 3.5 Days Remaining

```
daysRemaining = totalDaysInMonth - currentDay

Example: Day 18 of 30 → daysRemaining = 12
```

---

## 4. Forecast Engine

### 4.1 Required Daily Pace

```
requiredDailyPace(kpi) =
    remainingToTarget[kpi] / daysRemaining

Interpretation:
    How many units per day must be achieved to still hit the target.

Edge cases:
    daysRemaining = 0 AND remaining > 0  → MISSED (return Infinity)
    remaining = 0                         → TARGET_HIT (return 0)
```

### 4.2 Current Daily Rate

```
currentDailyRate(kpi) = mtdActual[kpi] / currentDay

Rolling average of actual daily production.
```

### 4.3 Pace Ratio

```
paceRatio(kpi) = currentDailyRate[kpi] / requiredDailyPace[kpi]

paceRatio > 1.0  → current pace exceeds requirement (comfortable)
paceRatio = 1.0  → exactly on track
paceRatio < 1.0  → need to accelerate
paceRatio < 0.5  → critical — needs immediate intervention
```

### 4.4 Forecast End-of-Month Value

```
forecastEOM(kpi) = currentDailyRate[kpi] × totalDaysInMonth

Linear projection based on current average pace.
```

### 4.5 Forecast Achievement %

```
forecastAchievementPct(kpi) =
    (forecastEOM[kpi] / monthlyTarget[kpi]) × 100
```

### 4.6 Forecast Scenarios

```
OPTIMISTIC:
    forecastOptimistic = currentDailyRate × 1.15 × totalDays
    Assumes 15% improvement in remaining days.

REALISTIC:
    forecastRealistic = currentDailyRate × totalDays
    Linear projection, no change in behavior.

PESSIMISTIC:
    forecastPessimistic = currentDailyRate × 0.85 × totalDays
    Assumes 15% degradation (weekends, absences, etc.)
```

---

## 5. Gap Analysis

### 5.1 Absolute Gap

```
absoluteGap(kpi) = monthlyTarget[kpi] - mtdActual[kpi]

Positive → shortfall
Zero     → exactly on target
Negative → exceeded target
```

### 5.2 Relative Gap %

```
relativeGap(kpi) =
    (mtdActual[kpi] - expectedMTD[kpi]) / expectedMTD[kpi] × 100

Measures performance relative to WHERE you should be today.

Example:
    Target = 200, Day 15 (expected = 100), Actual = 80
    relativeGap = (80 - 100) / 100 × 100 = -20%
    → 20% behind schedule
```

### 5.3 KPI Gap Matrix (Branch Level)

```
For each KPI in [wasfaty, omni, wellness, basket, crossSelling]:

    gapMatrix[kpi] = {
        absoluteGap:     monthlyTarget - mtdActual,
        relativeGap:     relativeGapPct,
        daysToRecover:   absoluteGap / currentDailyRate,  // days needed at current pace
        requiredPace:    requiredDailyPace,
        currentPace:     currentDailyRate,
        paceRatio:       currentPace / requiredPace,
    }
```

### 5.4 Priority Ranking (which KPI to focus on)

```
priorityScore(kpi) =
    (relativeGap × -1) × kpiWeight + (1 - paceRatio) × recoveryCost

KPIs are ranked by priorityScore descending.
Highest score = most urgent attention needed.
```

---

## 6. Pace & Risk Engine

### 6.1 Traffic Light Status

```
trafficLight(kpi) = f(relativeGap, dayProgress)

    delta = mtdAchievementPct - (dayProgress × 100)

    delta >= +5%     → EXCELLENT  🟢  (ahead of schedule)
    -5% < delta < +5% → GOOD      🔵  (on track)
    -15% < delta <= -5% → WARNING  🟡  (slightly behind)
    delta <= -15%    → CRITICAL   🔴  (significantly behind)
```

### 6.2 Branch Risk Level

```
branchRiskLevel(branchId) =

    criticalCount = number of KPIs with status = CRITICAL
    warningCount  = number of KPIs with status = WARNING

    if criticalCount >= 3:           → HIGH_RISK
    if criticalCount >= 1:           → MEDIUM_RISK
    if warningCount  >= 2:           → MEDIUM_RISK
    if warningCount  >= 1:           → LOW_RISK
    else:                            → ON_TRACK
```

### 6.3 Regional Risk Score

```
regionRiskScore(regionId) =
    Σ branchRiskWeight[branchᵢ] for all branches in region

    where branchRiskWeight:
        ON_TRACK:    0
        LOW_RISK:    1
        MEDIUM_RISK: 3
        HIGH_RISK:   5

regionRiskLevel:
    score = 0:        HEALTHY
    0 < score <= 5:   MONITORING
    5 < score <= 15:  AT_RISK
    score > 15:       CRITICAL
```

### 6.4 Pace Status Enum

```
PaceStatus = {
    EXCEEDING:   paceRatio >= 1.2,   // 20%+ above required
    ON_PACE:     paceRatio >= 0.95,  // within 5%
    SLIGHTLY_BEHIND: paceRatio >= 0.7, // 5-30% below
    SIGNIFICANTLY_BEHIND: paceRatio >= 0.5, // 30-50% below
    CRITICAL:    paceRatio < 0.5,    // less than half required pace
}
```

---

## 7. Trend & Momentum

### 7.1 7-Day Rolling Average

```
rollingAvg7(kpi, date) =
    Σ dailyValue[kpi][date-6 .. date] / 7

Smooths daily volatility.
Used for trend line in charts.
```

### 7.2 Trend Direction

```
trendDirection(kpi) =

    recentAvg  = rollingAvg7(kpi, today)
    previousAvg = rollingAvg7(kpi, today - 7)

    change = (recentAvg - previousAvg) / previousAvg × 100

    change > +5%:              ACCELERATING  ↑↑
    +1% < change <= +5%:       IMPROVING     ↑
    -1% < change <= +1%:       STABLE        →
    -5% < change <= -1%:       DECLINING     ↓
    change <= -5%:             DETERIORATING ↓↓
```

### 7.3 Weekly Momentum Score

```
weeklyMomentum(pharmacistId, kpi) =

    thisWeek = Σ daily[kpi][Mon..Sun this week]
    lastWeek = Σ daily[kpi][Mon..Sun last week]

    momentum = (thisWeek - lastWeek) / lastWeek × 100

    momentum > +10%:   STRONG_POSITIVE
    momentum > 0%:     POSITIVE
    momentum = 0%:     NEUTRAL
    momentum > -10%:   NEGATIVE
    momentum <= -10%:  STRONG_NEGATIVE
```

### 7.4 Consistency Score

```
consistencyScore(pharmacistId, kpi, days = 30) =

    // Count days with entry vs total days
    entryRate = daysWithEntry / days

    // Measure variance of daily values
    mean      = avg(dailyValues)
    variance  = avg((value - mean)²)
    cv        = sqrt(variance) / mean  // Coefficient of Variation

    // Combine: high entry rate + low variance = high consistency
    consistencyScore = entryRate × (1 - MIN(cv, 1)) × 100

    Score 80-100: HIGHLY_CONSISTENT
    Score 60-79:  CONSISTENT
    Score 40-59:  MODERATE
    Score < 40:   INCONSISTENT
```

---

## 8. Recovery Probability

### 8.1 Mathematical Recovery Probability

```
recoveryProbability(kpi) =

    remainingDays     = daysRemaining
    remainingTarget   = remainingToTarget[kpi]
    requiredDailyRate = remainingTarget / remainingDays
    historicalMax     = max(dailyValues[kpi], last 30 days)
    historicalAvg     = avg(dailyValues[kpi], last 30 days)

    // Can the pharmacist physically reach the required pace?
    if requiredDailyRate <= historicalMax:
        baseProb = 0.85  // achievable, has done it before

    if requiredDailyRate <= historicalAvg × 1.2:
        baseProb = 0.70  // requires moderate improvement

    if requiredDailyRate <= historicalAvg × 1.5:
        baseProb = 0.45  // requires significant improvement

    if requiredDailyRate > historicalAvg × 1.5:
        baseProb = 0.15  // very unlikely

    if remainingDays = 0:
        return 0          // no time left

    // Adjust for trend
    if trendDirection = ACCELERATING:  × 1.15
    if trendDirection = IMPROVING:     × 1.05
    if trendDirection = DECLINING:     × 0.90
    if trendDirection = DETERIORATING: × 0.75

    return MIN(baseProb × trendMultiplier, 0.99)
```

### 8.2 Recovery Probability Labels

```
prob >= 0.85:  HIGH     — "On track for recovery"
prob >= 0.60:  MODERATE — "Recovery possible with effort"
prob >= 0.35:  LOW      — "Significant effort required"
prob < 0.35:   CRITICAL — "Target likely out of reach"
```

### 8.3 Break-Even Day

```
breakEvenDay(kpi) =
    // The day when, continuing at current pace, target will be hit

    if forecastEOM >= target:
        breakEvenDay = target / currentDailyRate
        return breakEvenDay  // Day N of the month

    else:
        return null  // Target unreachable at current pace
```

---

## 9. Pharmacist Intelligence Layer

### 9.1 Pharmacist KPI Profile

```typescript
interface PharmacistKpiProfile {
    pharmacistId:     string
    pharmacistName:   string
    branchId:         string
    month:            string   // "yyyy-MM"

    // MTD Summary
    mtd: {
        [kpi: string]: {
            actual:          number
            target:          number
            achievementPct:  number
            status:          TrafficLightStatus
        }
    }

    // Pace
    pace: {
        [kpi: string]: {
            currentDailyRate:  number
            requiredDailyRate: number
            paceRatio:         number
            paceStatus:        PaceStatus
        }
    }

    // Forecast
    forecast: {
        [kpi: string]: {
            eomValue:        number
            eomAchievement:  number
            recoveryProb:    number
        }
    }

    // Intelligence
    weakestKpi:       string
    strongestKpi:     string
    consistencyScore: number
    weeklyMomentum:   number
    trendDirection:   TrendDirection
    riskLevel:        RiskLevel
    dailyMission:     DailyMission
}
```

### 9.2 Daily Mission Construction

```
dailyMission(pharmacistId, date) =

    1. Compute all KPI statuses for current month
    2. Rank KPIs by priority score (gap × weight)
    3. focusKpi = highest priority KPI
    4. Build mission:

    mission = {
        focusKpi:          focusKpi.key,
        focusKpiLabel:     focusKpi.label,
        currentAchievement: mtdAchievementPct[focusKpi],
        targetGap:          absoluteGap[focusKpi],
        requiredToday:      requiredDailyPace[focusKpi],
        action:             ACTION_RULES[focusKpi],
        motivation:         MOTIVATIONAL_MESSAGES[dayOfMonth % messages.length],
        difficulty:         f(paceRatio),  // EASY / MODERATE / CHALLENGING / STRETCH
        _aiReady:           true,          // Swap logic with AI API when ready
    }
```

### 9.3 Personal Benchmark

```
pharmacistRank(pharmacistId, branchId, kpi, date) =
    // Position in branch leaderboard for the day/month

    allPharmacists = getPharmacistsByBranch(branchId)
    ranked = sort(allPharmacists, by: mtdAchievementPct[kpi], desc)
    rank   = ranked.indexOf(pharmacistId) + 1

    percentile = (totalCount - rank) / totalCount × 100
```

---

## 10. Branch Manager Intelligence Layer

### 10.1 Branch Daily Summary

```typescript
interface BranchDailySummary {
    branchId:       string
    date:           string
    totalEntries:   number
    expectedEntries: number   // total pharmacists × 1

    // Submission Rate
    submissionRate: number    // totalEntries / expectedEntries × 100

    // KPI Aggregates
    kpis: {
        [kpi: string]: {
            totalActual:     number
            totalTarget:     number   // daily target × pharmacists
            achievementPct:  number
            status:          TrafficLightStatus
            pharmacistCount: number   // how many submitted this KPI
        }
    }

    // Team Performance
    topPharmacist:    { id: string, name: string, achievementPct: number }
    bottomPharmacist: { id: string, name: string, achievementPct: number }
    missingEntries:   string[]   // pharmacist IDs who haven't submitted

    // Alerts
    alerts: BranchAlert[]
}
```

### 10.2 Branch Alert Engine

```
generateBranchAlerts(branchId, date) → BranchAlert[]

Rules:
    RULE_1: Missing Entries
        trigger: submissionRate < 80% by 14:00
        severity: WARNING
        message: "{n} pharmacists have not submitted today's KPI"

    RULE_2: Critical KPI
        trigger: ANY kpi.status = CRITICAL
        severity: HIGH
        message: "{kpi} is critically behind — {gap} units remaining"

    RULE_3: Branch Off-Track
        trigger: overallBranchAchievement < (dayProgress × 100 - 15)
        severity: HIGH
        message: "Branch is {gap}% behind expected pace"

    RULE_4: Forecast Miss
        trigger: forecastEOM < target × 0.85
        severity: MEDIUM
        message: "Forecast shows only {forecastPct}% achievement by month end"

    RULE_5: Consecutive Decline
        trigger: trendDirection = DETERIORATING for 3+ days
        severity: MEDIUM
        message: "Performance declining for {n} consecutive days"

    RULE_6: Star Performer
        trigger: ANY pharmacist achievementPct > 120%
        severity: INFO
        message: "{name} is exceeding target by {pct}% — recognize performance"
```

### 10.3 Team Comparison Matrix

```
teamComparison(branchId, month) =

    For each pharmacist in branch:
        - MTD achievement per KPI
        - Consistency score
        - Trend direction
        - Rank within branch
        - Rank change vs last month

    Output:
        | Pharmacist | Wasfaty | Omni | Wellness | Basket | Cross | Overall | Trend |
        |------------|---------|------|----------|--------|-------|---------|-------|
        | فاطمة      | 95%     | 87%  | 102%     | 78%    | 91%   | 90.6%  | ↑     |
        | علي        | 72%     | 68%  | 75%      | 88%    | 65%   | 73.6%  | ↓     |
```

---

## 11. Executive Intelligence Layer

### 11.1 Executive Dashboard Metrics

```typescript
interface ExecutiveDashboard {
    reportDate:     string
    reportPeriod:   string   // "2025-05"

    // Portfolio Summary
    totalBranches:  number
    activeBranches: number
    totalPharmacists: number

    // Overall Performance
    portfolioAchievement: {
        mtdPct:        number
        forecastPct:   number
        status:        TrafficLightStatus
    }

    // Branch Breakdown
    branchRanking: BranchRankEntry[]
    topBranches:   BranchRankEntry[]   // top 3
    bottomBranches: BranchRankEntry[]  // bottom 3

    // KPI Portfolio
    kpiSummary: {
        [kpi: string]: {
            totalActual:     number
            totalTarget:     number
            achievementPct:  number
            forecastPct:     number
            status:          TrafficLightStatus
            trend:           TrendDirection
        }
    }

    // Risk Overview
    riskDistribution: {
        onTrack:    number   // count of branches
        lowRisk:    number
        mediumRisk: number
        highRisk:   number
    }

    // Regional Breakdown
    regionSummary: RegionSummary[]
}
```

### 11.2 Branch Ranking Algorithm

```
rankBranches(month) =

    For each branch:
        score = weighted composite:
            overallAchievement × 0.40
            + forecastAchievement × 0.25
            + consistencyScore   × 0.20
            + submissionRate     × 0.15

    Sort descending by score.
    Assign rank, medal (Gold/Silver/Bronze for top 3).
    Compute rank change vs previous month.
```

### 11.3 Portfolio Forecast

```
portfolioForecast(month) =

    // Bottom-up aggregation
    for each branch:
        branchForecast[kpi] = Σ pharmacistForecast[kpi]

    portfolioForecast[kpi] = Σ branchForecast[kpi]

    // Scenario planning
    bestCase:    Σ branchForecast[optimistic]
    base:        Σ branchForecast[realistic]
    worstCase:   Σ branchForecast[pessimistic]
```

### 11.4 Executive KPI Heatmap

```
heatmap(month) =

    Dimensions:
        X-axis: KPIs  [wasfaty, omni, wellness, basket, crossSelling]
        Y-axis: Branches (sorted by overall achievement, desc)

    Cell value:   achievementPct[branch][kpi]
    Cell color:   trafficLightColor(achievementPct, dayProgress)

    Output:
        A matrix where weak spots are immediately visible in red,
        strong spots in green, enabling pattern recognition at a glance.
```

---

## 12. Firestore Schema

### 12.1 Collection: `users`

```
users/{uid}
├── displayName:    string
├── email:          string
├── role:           "admin" | "manager" | "pharmacist"
├── status:         "active" | "inactive"
├── active:         boolean
├── pharmacyId:     string | null        // branch assignment
├── regionId:       string | null
├── phone:          string
├── employeeId:     string               // unique per organization
├── createdAt:      Timestamp
├── createdBy:      string (uid)
├── updatedAt:      Timestamp
└── lastLoginAt:    Timestamp
```

### 12.2 Collection: `pharmacies`

```
pharmacies/{autoId}
├── code:           string               // unique branch code e.g. "5074"
├── name:           string
├── region:         string
├── city:           string
├── managerUid:     string | null
├── managerEmail:   string | null
├── active:         boolean
├── createdAt:      Timestamp
├── createdBy:      string (uid)
└── updatedAt:      Timestamp
```

### 12.3 Collection: `kpi_entries`

```
// Document ID: {userId}_{pharmacyId}_{date}
// Composite key prevents duplicates at database level

kpi_entries/{userId}_{pharmacyId}_{date}
├── userId:         string
├── pharmacyId:     string
├── date:           string               // "yyyy-MM-dd"
├── wasfaty:        number (≥ 0)
├── omni:           number (≥ 0)
├── wellness:       number (≥ 0)
├── basket:         number (≥ 0)
├── crossSelling:   number (≥ 0)
├── notes:          string
├── createdAt:      Timestamp
├── updatedAt:      Timestamp
└── submittedBy:    string (uid)         // may differ from userId (manager entry)
```

### 12.4 Collection: `targets`

```
// Document ID: {pharmacyId}_{yyyy-MM}
// One document per branch per month

targets/{pharmacyId}_{yyyy-MM}
├── pharmacyId:       string
├── month:            string             // "yyyy-MM"
├── salesTarget:      number
├── wasfatyTarget:    number
├── omniTarget:       number
├── wellnessTarget:   number
├── crossSellTarget:  number
├── basketTarget:     number
├── createdAt:        Timestamp
└── updatedAt:        Timestamp
```

### 12.5 Collection: `audit_logs`

```
audit_logs/{autoId}
├── action:         "create" | "update" | "delete" | "login" | "logout" | "import"
├── collection:     string               // affected Firestore collection
├── docId:          string | null        // affected document ID
├── userId:         string | null        // who performed the action
├── userRole:       string | null
├── before:         object | null        // state before change
├── after:          object | null        // state after change
├── meta:           object               // additional context
└── timestamp:      Timestamp
```

### 12.6 Collection: `notifications`

```
notifications/{autoId}
├── userId:         string               // recipient
├── type:           "alert" | "info" | "achievement" | "reminder"
├── title:          string
├── body:           string
├── kpi:            string | null        // related KPI key
├── pharmacyId:     string | null
├── read:           boolean
├── priority:       "low" | "medium" | "high"
├── createdAt:      Timestamp
└── expiresAt:      Timestamp | null
```

### 12.7 Collection: `leaderboard` (Computed)

```
// Updated by scheduled function / on-demand computation
// Document ID: {pharmacyId}_{yyyy-MM}

leaderboard/{pharmacyId}_{yyyy-MM}
├── pharmacyId:     string
├── month:          string
├── rankings: [
│     {
│       pharmacistId:   string
│       displayName:    string
│       overallPct:     number
│       rank:           number
│       kpiBreakdown:   { wasfaty: %, omni: %, ... }
│     }
│   ]
├── branchOverall:  number               // branch composite achievement %
└── computedAt:     Timestamp
```

### 12.8 Collection: `kpi_analytics` (Computed Cache)

```
// Pre-computed analytics to avoid expensive real-time aggregations
// Document ID: {pharmacyId}_{yyyy-MM}

kpi_analytics/{pharmacyId}_{yyyy-MM}
├── pharmacyId:       string
├── month:            string
├── computedAt:       Timestamp
├── dayProgress:      number             // 0..1
├── mtd: {
│     wasfaty:   { actual, target, pct, status }
│     omni:      { actual, target, pct, status }
│     ...
│   }
├── forecast: {
│     wasfaty:   { eomValue, eomPct, recoveryProb }
│     ...
│   }
├── pace: {
│     wasfaty:   { currentRate, requiredRate, paceRatio, status }
│     ...
│   }
└── alerts:           Alert[]
```

### 12.9 Required Firestore Indexes

```json
[
  // kpi_entries — most common queries
  { "collection": "kpi_entries",
    "fields": ["userId ASC", "date DESC"] },

  { "collection": "kpi_entries",
    "fields": ["pharmacyId ASC", "date DESC"] },

  { "collection": "kpi_entries",
    "fields": ["userId ASC", "pharmacyId ASC", "date DESC"] },

  { "collection": "kpi_entries",
    "fields": ["pharmacyId ASC", "date ASC", "date DESC"] },

  // targets
  { "collection": "targets",
    "fields": ["pharmacyId ASC", "month DESC"] },

  // users
  { "collection": "users",
    "fields": ["pharmacyId ASC", "role ASC"] },

  { "collection": "users",
    "fields": ["employeeId ASC"] },

  // audit logs
  { "collection": "audit_logs",
    "fields": ["userId ASC", "timestamp DESC"] },

  { "collection": "audit_logs",
    "fields": ["collection ASC", "timestamp DESC"] },

  // leaderboard
  { "collection": "leaderboard",
    "fields": ["pharmacyId ASC", "month DESC"] },

  // kpi_analytics
  { "collection": "kpi_analytics",
    "fields": ["pharmacyId ASC", "month DESC"] }
]
```

---

## 13. KPI Analytics Engine Architecture

### 13.1 Engine Layers

```
┌─────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                     │
│   Dashboard Widgets · Charts · Tables · Alerts UI        │
└────────────────────┬────────────────────────────────────┘
                     │ React hooks / Zustand
┌────────────────────▼────────────────────────────────────┐
│                   ANALYTICS LAYER                        │
│                                                          │
│   kpiEngine.js                                           │
│   ├── getDayProgress()                                   │
│   ├── computeKpiStats()                                  │
│   ├── getTrafficLight()                                  │
│   ├── getRunRateForecast()                               │
│   ├── computeGapAnalysis()                               │
│   ├── getPaceStatus()                                    │
│   ├── getRecoveryProbability()                           │
│   ├── getTrendDirection()                                │
│   ├── getWeeklyMomentum()                                │
│   └── getDailyMission()          ← AI-ready hook         │
└────────────────────┬────────────────────────────────────┘
                     │ Pure JS functions (no Firebase deps)
┌────────────────────▼────────────────────────────────────┐
│                   DATA LAYER                             │
│                                                          │
│   kpiService.js                                          │
│   ├── saveKpiEntry()                                     │
│   ├── subscribeKpiEntries()                              │
│   ├── subscribeAllKpiEntries()                           │
│   ├── saveTarget()                                       │
│   └── subscribeTargets()                                 │
│                                                          │
│   Firestore Collections                                  │
│   kpi_entries · targets · kpi_analytics                  │
└─────────────────────────────────────────────────────────┘
```

### 13.2 Analytics Engine Interface

```typescript
// src/utils/kpiEngine.ts (future typed version)

interface DayProgress {
    currentDay:  number
    totalDays:   number
    ratio:       number       // 0..1
    pct:         number       // 0..100
    daysRemaining: number
}

interface KpiStats {
    actual:          number
    target:          number
    achievementPct:  number
    expectedPct:     number   // dayProgress.ratio × 100
    delta:           number   // actual - expected
    status:          'excellent' | 'good' | 'warning' | 'critical'
    colors:          TrafficLightColors
}

interface ForecastResult {
    currentDailyRate:    number
    requiredDailyRate:   number
    paceRatio:           number
    paceStatus:          PaceStatus
    forecastEOM:         number
    forecastAchPct:      number
    recoveryProbability: number
    breakEvenDay:        number | null
    scenarios: {
        optimistic: number
        realistic:  number
        pessimistic: number
    }
}

interface GapAnalysis {
    absoluteGap:    number
    relativeGapPct: number
    daysToRecover:  number
    isRecoverable:  boolean
}

interface DailyMission {
    focusKpi:          string
    kpiLabel:          { en: string, ar: string }
    achievementPct:    number
    targetGap:         number
    requiredToday:     number
    action:            string
    motivation:        string
    difficulty:        'EASY' | 'MODERATE' | 'CHALLENGING' | 'STRETCH'
    allKpis:           KpiStats[]
    _aiReady:          true
}
```

### 13.3 Computation Pipeline

```
Input: kpi_entries[] + targets[] + current date

Step 1: getDayProgress()
    → { currentDay, totalDays, ratio, daysRemaining }

Step 2: For each KPI key:
    → computeKpiStats(entries, kpiKey, target, dayProgress)
    → { actual, target, achievementPct, status, colors }

Step 3: For each KPI:
    → getRunRateForecast(actual, target, daysPassed, totalDays)
    → { forecastEOM, forecastAchPct, paceRatio, recoveryProb }

Step 4: computeGapAnalysis(actual, target, forecastEOM)
    → { absoluteGap, relativeGapPct, isRecoverable }

Step 5: getTrendDirection(entries, kpiKey, date)
    → 'ACCELERATING' | 'IMPROVING' | 'STABLE' | 'DECLINING' | 'DETERIORATING'

Step 6: getDailyMission(allKpiStats, targets)
    → DailyMission (rule-based, AI-ready)

Output: Complete analytics profile for one pharmacist/branch/day
```

### 13.4 Performance Considerations

```
Query Optimization:
    ❌ Never query all kpi_entries without filters
    ✅ Always filter by userId + date range OR pharmacyId + date range
    ✅ Use compound indexes for multi-field queries
    ✅ Paginate results (max 500 entries per query)
    ✅ Cache monthly targets in-memory (changes rarely)

Computation:
    ✅ Run kpiEngine functions client-side (pure JS, fast)
    ✅ Memoize heavy computations with useMemo()
    ✅ Pre-compute and cache in kpi_analytics for executive dashboards
    ❌ Never run aggregations inside Firestore rules (use client-side)

Real-time:
    ✅ Use onSnapshot for live updates on today's entries
    ✅ Use getDocs for historical queries (no real-time needed)
    ✅ Batch writes when importing bulk data
```

---

## 14. Dashboard Widgets Architecture

### 14.1 Widget Registry

```
TIER 1 — Core Metrics (always visible)
├── OverallAchievementWidget
│     data:    overallAchievementPct
│     refresh: on new entry
│
├── TrafficLightGridWidget
│     data:    { kpiStats[each], trafficLight[each] }
│     refresh: on new entry
│
├── DailyMissionWidget
│     data:    dailyMission (rule-based)
│     refresh: daily / on new entry
│
└── TodayEntriesWidget
      data:    todayEntries.length
      refresh: real-time

TIER 2 — Performance Analysis
├── TrendChartWidget (14-day area chart)
├── KpiBarChartWidget (today's KPIs bar)
├── ForecastWidget (per-KPI projected EOM)
├── GapAnalysisWidget (remaining vs required)
└── RunRateWidget (pace vs required)

TIER 3 — Team Intelligence (Manager+)
├── TeamLeaderboardWidget
├── BranchRankingWidget
├── MissingEntriesWidget
└── AlertFeedWidget

TIER 4 — Executive (Admin only)
├── PortfolioHeatmapWidget
├── RegionComparisonWidget
├── RiskDistributionWidget
├── ForecastScenariosWidget
└── ExecutiveSummaryWidget
```

### 14.2 Widget Interface Contract

```typescript
interface KpiWidget {
    id:          string
    title:       string
    titleAr:     string
    tier:        1 | 2 | 3 | 4
    roles:       ('admin' | 'manager' | 'pharmacist')[]
    refreshOn:   'realtime' | 'daily' | 'manual'
    size:        'xs' | 'sm' | 'md' | 'lg' | 'xl'
    defaultVisible: boolean

    // Data contract
    requiredData: string[]      // list of store values needed
    computeFn:   (data: any) => WidgetData

    // Render
    component:   React.ComponentType<WidgetProps>
}
```

### 14.3 Dashboard Layout System

```
ADMIN LAYOUT:
┌──────────┬──────────┬──────────┬──────────┐
│ Overall  │ Today KPI│ Forecast │Risk Level│  ← Tier 1 Stats
├──────────┴──────────┴──────────┴──────────┤
│        KPI Traffic Light Grid (5 cols)    │  ← Tier 1 Grid
├────────────────────────────┬──────────────┤
│  14-Day Trend Chart        │ Daily Mission│  ← Tier 2
├─────────────┬──────────────┴──────────────┤
│ Operational │ Run Rate Forecasts (5 cols) │  ← Tier 2
│  Insights   │                            │
├─────────────┼───────────────┬────────────┤
│ Branch      │ Today KPI Bar │ Month vs   │  ← Tier 3
│ Ranking     │               │ Target     │
└─────────────┴───────────────┴────────────┘

PHARMACIST LAYOUT:
┌──────────┬──────────┬──────────┬──────────┐
│ MTD Ach. │ Wasfaty  │ OmniHlth │ Forecast │
├──────────┴──────────┴──────────┴──────────┤
│           Daily Mission Card              │
├────────────────────────────┬──────────────┤
│  14-Day Personal Trend     │ KPI Status  │
│                            │ Grid        │
└────────────────────────────┴─────────────┘
```

### 14.4 User-Configurable Dashboard Cards

```
Available cards (stored in user_preferences):
    overall_achievement  → Overall Achievement %
    today_kpi            → Today's Entry Count
    wasfaty              → Wasfaty MTD
    omni                 → OmniHealth MTD
    wellness             → Wellness MTD
    cross_selling        → Cross Selling MTD
    branch_rank          → Branch Rank (manager/admin)
    month_progress       → Month Progress %
    forecast             → Wasfaty Forecast EOM

Rules:
    Minimum cards:  2
    Maximum cards:  9 (one per available card)
    Default:        [overall_achievement, today_kpi, wasfaty, omni, wellness, forecast]
    Persistence:    localStorage + user_preferences collection
```

---

## 15. Future AI-Ready Layer

### 15.1 Architecture Overview

```
Current:    Rule-based engine (kpiEngine.js)
                ↓
Phase 1:    LLM-powered insights (Anthropic Claude API)
                ↓
Phase 2:    Predictive ML models (custom or AutoML)
                ↓
Phase 3:    Autonomous coaching system
```

### 15.2 AI Hook Points

Every function in `kpiEngine.js` that returns contextual output is marked with `_aiReady: true`.

These are the designated replacement points:

```typescript
// HOOK 1: Daily Mission Generation
// Current:  rule-based priority + template messages
// Future:   LLM generates personalized coaching message

async function getDailyMission_AI(
    pharmacistProfile: PharmacistKpiProfile,
    historicalContext: KpiEntry[],
    benchmarkData:     BranchBenchmark,
): Promise<DailyMission> {
    const response = await anthropic.messages.create({
        model:  'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: PHARMACIST_COACH_SYSTEM_PROMPT,
        messages: [{
            role: 'user',
            content: buildMissionPrompt(pharmacistProfile, historicalContext)
        }]
    })
    return parseMissionResponse(response)
}

// HOOK 2: Branch Anomaly Detection
// Current:  threshold-based alerts
// Future:   pattern recognition across historical data

async function detectAnomalies_AI(
    branchData:   BranchDailySummary[],
    daysHistory:  number = 30
): Promise<AnomalyReport> { ... }

// HOOK 3: Executive Narrative Generation
// Current:  template-based summaries
// Future:   LLM-generated executive briefing

async function generateExecutiveBriefing_AI(
    portfolioData:  ExecutiveDashboard,
    previousPeriod: ExecutiveDashboard
): Promise<string> { ... }

// HOOK 4: Recovery Action Plan
// Current:  fixed action templates per KPI
// Future:   contextual action plan based on performance history

async function generateRecoveryPlan_AI(
    pharmacistId:  string,
    targetKpi:     string,
    contextData:   PharmacistKpiProfile
): Promise<RecoveryPlan> { ... }
```

### 15.3 AI Prompt Templates (Placeholders)

```
PHARMACIST_COACH_SYSTEM_PROMPT:
    "You are a pharmacy performance coach for a Saudi pharmacy chain.
     Your role is to provide concise, motivating, and actionable
     daily missions for pharmacists. Always be specific, data-driven,
     and culturally appropriate for Saudi Arabia.
     Respond in Arabic."

EXECUTIVE_BRIEFING_SYSTEM_PROMPT:
    "You are an executive analytics assistant for a regional pharmacy
     network. Provide concise, insight-driven performance briefings
     for senior management. Focus on trends, risks, and opportunities.
     Be direct and quantitative."
```

### 15.4 Data Pipeline for AI Context

```
Context window for AI coaching:

{
    // Current state
    pharmacist:        { name, branch, role },
    today:             { date, dayOfMonth, daysRemaining },

    // KPI status
    mtdPerformance:    { kpi: { actual, target, pct, status } },
    dailyHistory:      last_14_days_per_kpi,

    // Benchmarks
    branchAverage:     per_kpi_average,
    pharmacistRank:    { rank, total, percentile },

    // Derived
    weakestKpi:        { key, label, gap, requiredPace },
    trendSummary:      per_kpi_trend_direction,
    momentum:          weekly_momentum_score,
}
```

### 15.5 AI Feature Roadmap

```
Phase 1 — LLM Insights (Next Sprint)
    ☐ Daily Mission via Claude API (replaces rule-based)
    ☐ Weekly coaching summary email
    ☐ Branch alert narrative generation
    ☐ Implementation: ~2 weeks

Phase 2 — Predictive Analytics (Q3 2025)
    ☐ End-of-month achievement prediction (regression model)
    ☐ Pharmacist churn risk score
    ☐ Optimal branch staffing recommendations
    ☐ Implementation: ML model training + serving

Phase 3 — Autonomous Coaching (Q4 2025)
    ☐ Real-time in-app coaching notifications
    ☐ Personalized learning plans
    ☐ Automated manager alerts with suggested actions
    ☐ WhatsApp integration for daily mission delivery

Phase 4 — Advanced Intelligence (2026)
    ☐ Demand forecasting (link to supply chain)
    ☐ Customer behavior pattern analysis
    ☐ Competitive benchmarking
    ☐ Prescription trend analysis
```

### 15.6 AI Safety & Compliance

```
Data Privacy:
    ✅ No patient data sent to AI APIs
    ✅ PII anonymized before LLM calls (use employeeId, not name)
    ✅ Only aggregate KPI numbers in AI context
    ✅ Audit log all AI API calls

Content Safety:
    ✅ All AI outputs reviewed before display (or use constrained formats)
    ✅ Motivational messages reviewed for cultural appropriateness
    ✅ Fallback to rule-based output if AI call fails

Cost Control:
    ✅ Cache AI responses (same context = same output for 24h)
    ✅ Use claude-haiku for simple missions, sonnet for executive briefings
    ✅ Rate limit: max 1 AI call per pharmacist per day for missions
```

---

## Appendix A: Calculation Quick Reference

| Metric | Formula |
|--------|---------|
| Day Progress | `currentDay / totalDays` |
| Expected MTD | `target × dayProgress` |
| MTD Achievement % | `(actual / target) × 100` |
| Delta | `mtdActual - expectedMTD` |
| Traffic Light | `delta >= +5 → Excellent, ≥-5 → Good, ≥-15 → Warning, <-15 → Critical` |
| Remaining to Target | `MAX(0, target - actual)` |
| Required Daily Pace | `remaining / daysRemaining` |
| Current Daily Rate | `actual / currentDay` |
| Pace Ratio | `currentRate / requiredRate` |
| Forecast EOM | `currentRate × totalDays` |
| Forecast Ach % | `(forecastEOM / target) × 100` |
| Relative Gap | `(actual - expected) / expected × 100` |
| 7-Day Rolling Avg | `SUM(last7days) / 7` |
| Weekly Momentum | `(thisWeek - lastWeek) / lastWeek × 100` |

---

## Appendix B: Status Enumerations

```typescript
type TrafficLightStatus = 'excellent' | 'good' | 'warning' | 'critical'
type TrendDirection     = 'ACCELERATING' | 'IMPROVING' | 'STABLE' | 'DECLINING' | 'DETERIORATING'
type PaceStatus         = 'EXCEEDING' | 'ON_PACE' | 'SLIGHTLY_BEHIND' | 'SIGNIFICANTLY_BEHIND' | 'CRITICAL'
type RiskLevel          = 'ON_TRACK' | 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK'
type RecoveryLabel      = 'HIGH' | 'MODERATE' | 'LOW' | 'CRITICAL'
type MissionDifficulty  = 'EASY' | 'MODERATE' | 'CHALLENGING' | 'STRETCH'
```

---

*Document maintained by Samir Goda — PharmaPulse Engineering*  
*Version 1.0 · Last updated: 2025*
