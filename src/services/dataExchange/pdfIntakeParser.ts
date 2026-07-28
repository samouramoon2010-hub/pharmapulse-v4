// ============================================================
// Universal AI Intake — PDF text-layer extraction (Phase 1)
//
// Text-based extraction ONLY, via pdfjs-dist (the standard,
// actively-maintained text-layer library — not OCR, no image
// rasterization, no unreliable local OCR loop). If a PDF has no
// extractable text layer (a scanned/image-only PDF), this returns
// the exact required controlled message rather than fabricating
// rows or silently returning nothing.
// ============================================================

export const PDF_REQUIRES_OCR_MESSAGE = 'This PDF requires image extraction or OCR review'

export interface PdfIntakeResult {
  status:   'EXTRACTED' | 'REQUIRES_OCR' | 'PASSWORD_PROTECTED' | 'PARSE_ERROR'
  message?: string
  /** Raw extracted text, one string per page, in page order. Only
   *  populated when status is 'EXTRACTED'. */
  pageText: string[]
}

const MIN_MEANINGFUL_CHARS = 5

export async function extractPdfText(fileBuffer: ArrayBuffer): Promise<PdfIntakeResult> {
  let pdfjsLib: typeof import('pdfjs-dist')
  try {
    pdfjsLib = await import('pdfjs-dist')
    // Disable the worker in this environment (bundler-agnostic) — text
    // extraction from a handful of pages is cheap enough on the main thread
    // and avoids a separate worker-bundle wiring step for this phase.
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''
  } catch {
    return { status: 'PARSE_ERROR', message: 'PDF parser unavailable', pageText: [] }
  }

  try {
    const loadingTask = pdfjsLib.getDocument({ data: fileBuffer, isEvalSupported: false })
    const doc = await loadingTask.promise

    const pageText: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items.map((item: any) => ('str' in item ? item.str : '')).join(' ').trim()
      pageText.push(text)
    }

    const totalChars = pageText.join('').replace(/\s+/g, '').length
    if (totalChars < MIN_MEANINGFUL_CHARS) {
      return { status: 'REQUIRES_OCR', message: PDF_REQUIRES_OCR_MESSAGE, pageText: [] }
    }

    return { status: 'EXTRACTED', pageText }
  } catch (e: any) {
    if (e?.name === 'PasswordException') {
      return { status: 'PASSWORD_PROTECTED', message: 'This PDF is password-protected and cannot be read', pageText: [] }
    }
    return { status: 'PARSE_ERROR', message: 'This PDF could not be parsed', pageText: [] }
  }
}
