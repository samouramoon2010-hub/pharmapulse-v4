# PharmaPulse Design Add-on

## Scope and sequencing
- Preserve the current PharmaPulse architecture, business logic, permissions, data contracts, evaluation engines, and test coverage.
- Do not start a new phase or expand scope while the active phase is unfinished.
- Confirm the requested page, user role, data source, and success criteria from repository evidence before changing code.
- Prefer incremental modernization over rewrites.

## Product design standard
- Design around **Action → Evidence → Drill Down**.
- Optimize for pharmacists, pharmacy managers, regional leaders, and executives.
- Prioritize clarity, decision speed, trust, and operational action over decoration.
- Use progressive disclosure: summary first, explanation second, detail on demand.
- Make hierarchy obvious through spacing, typography, grouping, and emphasis.
- Reuse the existing design system and components before creating new variants.
- Respect responsive behavior, Arabic/English localization, RTL/LTR, keyboard use, and accessible contrast.

## Data and trust
- Never expose raw document IDs, internal metadata, debug labels, test data, preview artifacts, or migration terminology in production-facing UI.
- Never fabricate metrics, targets, benchmarks, rankings, forecasts, or insights.
- Distinguish actuals, targets, achievement, forecast, benchmark, and risk clearly.
- Resolve contradictory score/risk messaging before polishing visuals.
- Show calculation context or evidence when a recommendation could affect a person or branch.

## Workflow
1. Inspect the current implementation and nearby patterns.
2. State the user goal and the problems supported by evidence.
3. Propose information hierarchy, states, interactions, and responsive behavior.
4. Identify reused and new components.
5. Define acceptance criteria and test impact.
6. Implement only the approved/requested scope.
7. Run relevant tests and inspect the rendered result when tooling permits.

## Guardrails
- Do not redesign business logic as part of a visual task.
- Do not introduce a new library when the existing stack can solve the problem.
- Do not create duplicate components or hardcoded production data.
- Do not call a page complete without loading, empty, error, partial-data, and permission states.
