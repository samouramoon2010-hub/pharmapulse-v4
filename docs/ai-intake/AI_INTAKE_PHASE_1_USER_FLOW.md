# Universal AI Intake — Phase 1 User Flow

`/ai-intake`, page title "AI Data Intake", admin-only.

## Steps

1. **Upload** — drag-and-drop or file picker (`.xlsx`, `.xls`, `.csv`,
   `.pdf`, image formats), or paste text directly.
2. **Detect & Map** — auto-detected entity type with a confidence
   percentage (or a manual selector if nothing was recognized);
   unresolved columns get a manual mapping dropdown; multi-sheet
   workbooks get a sheet selector.
3. **Preview** — summary counts (total/valid/warnings/invalid/
   duplicates/conflicts/updates/skipped), a filterable row table
   (all/valid/warnings/invalid/duplicates/create/update/skip), and a
   per-row checkbox to exclude rows before approval.
4. **Approve** — a plain-language summary of what will change
   (creates/updates/skipped/invalid counts). A standard confirm button
   for normal imports; typing `APPROVE IMPORT` is required above 50
   committable rows.
5. **Result** — committed/failed/skipped counts and the final job
   status (`COMPLETED`/`PARTIALLY_COMPLETED`).

## Empty and error states

- **Unsupported file type**: explicit message, no silent failure.
- **Empty sheet/zero rows**: `EmptyState` component at the Detect &
  Map step, "Validate & preview" disabled.
- **Password-protected PDF**: explicit `PASSWORD_PROTECTED` message.
- **Scanned/image-only PDF**: exact required message *"This PDF
  requires image extraction or OCR review."*
- **Image upload with no provider configured**: exact controlled
  message explaining the image was stored in-session only, nothing
  extracted or fabricated.
- **Malformed pasted text / unrecognized format**: explicit message,
  never guesses a wrong split.
- **Missing required columns / unresolved parent references /
  duplicate codes**: surfaced per-row in the Preview table's Notes
  column, sourced from the existing adapter validation issues.

## Visual language

Reuses the existing premium PharmaPulse conventions unchanged: inline
styles with `var(--text-primary)`/`var(--bg-elevated)`/
`var(--border-subtle)` CSS variables (same as
`DataExchangeStudioPage.jsx`/`KpiManagementPage.jsx`), `lucide-react`
icons, the shared `EmptyState` component. No other page was
redesigned.
