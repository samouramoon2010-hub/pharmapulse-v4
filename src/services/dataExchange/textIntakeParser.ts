// ============================================================
// Universal AI Intake — plain-text paste parser (Phase 1)
//
// Turns pasted text into the same "header row + rows of
// Record<string, unknown>" shape the existing Excel/CSV path
// produces (see DataExchangeStudioPage.jsx's XLSX.utils.sheet_to_json
// output), so every existing adapter's resolveColumns()/parseRow()
// consumes it unmodified — no separate text-specific adapter code.
//
// Supported formats, tried in this order:
//   1. JSON array-of-objects  — ‎[{"code":"RUH","name":"Riyadh"}, ...]
//   2. Tab-separated (first line = header)
//   3. Comma-separated (first line = header) — not full RFC4180 CSV
//      (no quoted-comma handling); genuine CSV files should go through
//      the existing xlsx-based CSV path, this is for a quick paste.
//   4. Line-based "key: value" blocks, one record per blank-line-
//      separated block (e.g. pasted from a form or email).
//
// Never fabricates data: an input that matches none of these shapes
// returns { rows: [], headerRow: [], format: 'UNRECOGNIZED' } rather
// than guessing a split strategy.
// ============================================================

export type TextIntakeFormat = 'JSON' | 'TSV' | 'CSV' | 'KEY_VALUE_BLOCKS' | 'UNRECOGNIZED'

export interface TextIntakeResult {
  format:     TextIntakeFormat
  headerRow:  string[]
  rows:       Record<string, unknown>[]
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd())
}

function tryParseJson(text: string): TextIntakeResult | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('[')) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null
  if (!parsed.every((r) => r && typeof r === 'object' && !Array.isArray(r))) return null

  const headerSet = new Set<string>()
  for (const row of parsed as Record<string, unknown>[]) {
    for (const key of Object.keys(row)) headerSet.add(key)
  }
  return { format: 'JSON', headerRow: [...headerSet], rows: parsed as Record<string, unknown>[] }
}

function rowsFromDelimited(lines: string[], delimiter: string): TextIntakeResult | null {
  const nonEmpty = lines.filter((l) => l.trim() !== '')
  if (nonEmpty.length < 1) return null
  const headerRow = nonEmpty[0].split(delimiter).map((h) => h.trim())
  if (headerRow.length < 2) return null // a single column is too ambiguous to auto-detect as tabular

  const rows: Record<string, unknown>[] = []
  for (const line of nonEmpty.slice(1)) {
    const cells = line.split(delimiter)
    const row: Record<string, unknown> = {}
    headerRow.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i].trim() : '' })
    rows.push(row)
  }
  return { format: delimiter === '\t' ? 'TSV' : 'CSV', headerRow, rows }
}

function tryParseKeyValueBlocks(text: string): TextIntakeResult | null {
  const blocks = text.trim().split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  if (blocks.length === 0) return null

  const KV_RE = /^([^:]+):\s*(.*)$/
  const parsedBlocks: Record<string, unknown>[] = []
  for (const block of blocks) {
    const lines = splitLines(block).filter((l) => l.trim() !== '')
    if (lines.length === 0) return null
    const row: Record<string, unknown> = {}
    for (const line of lines) {
      const match = KV_RE.exec(line)
      if (!match) return null // not every line is "key: value" — this isn't this format
      row[match[1].trim()] = match[2].trim()
    }
    parsedBlocks.push(row)
  }
  if (parsedBlocks.length === 0) return null

  const headerSet = new Set<string>()
  for (const row of parsedBlocks) for (const key of Object.keys(row)) headerSet.add(key)
  return { format: 'KEY_VALUE_BLOCKS', headerRow: [...headerSet], rows: parsedBlocks }
}

export function parsePastedText(text: string): TextIntakeResult {
  if (!text || text.trim() === '') {
    return { format: 'UNRECOGNIZED', headerRow: [], rows: [] }
  }

  const asJson = tryParseJson(text)
  if (asJson) return asJson
  // Text that looks like it was intended as JSON (starts with '[') but
  // failed to parse must never be silently reinterpreted as some other
  // format — that risks mangling truncated/malformed JSON into garbage
  // rows instead of surfacing a clear "unrecognized" state.
  if (text.trim().startsWith('[')) {
    return { format: 'UNRECOGNIZED', headerRow: [], rows: [] }
  }

  const lines = splitLines(text)

  // Prefer tab-separated when a tab genuinely appears (most reliable —
  // pasted-from-spreadsheet data uses real tabs, never ambiguous with content).
  if (lines[0]?.includes('\t')) {
    const asTsv = rowsFromDelimited(lines, '\t')
    if (asTsv) return asTsv
  }

  if (lines[0]?.includes(',')) {
    const asCsv = rowsFromDelimited(lines, ',')
    if (asCsv) return asCsv
  }

  const asKeyValue = tryParseKeyValueBlocks(text)
  if (asKeyValue) return asKeyValue

  return { format: 'UNRECOGNIZED', headerRow: [], rows: [] }
}
