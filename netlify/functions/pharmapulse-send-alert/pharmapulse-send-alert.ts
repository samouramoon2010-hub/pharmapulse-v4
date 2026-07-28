// ============================================================
// Admin-triggered critical-risk alert email relay.
//
// Real automatic (scheduled/cron) proactive alerting is a further
// step requiring Netlify Scheduled Functions — not built here. This
// is the honest, immediately-usable first step: an admin who is
// already looking at Regional Intelligence and sees HIGH_RISK
// branches clicks "Send alert email", and this function relays the
// already-built message (see src/services/alerts/
// criticalRiskAlertBuilder.ts) to the configured recipients via
// Resend (https://resend.com). It never computes risk itself and
// never reads Firestore — the caller supplies the already-computed
// payload, this function only needs to (a) confirm the caller is a
// signed-in admin and (b) hide the Resend API key from the browser.
//
// Disabled by default: if RESEND_API_KEY or ALERT_RECIPIENT_EMAILS
// is unset, every request fails closed with 501 rather than silently
// no-op'ing — an admin clicking "send" must get an honest error, not
// a false "sent" confirmation.
// ============================================================

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'

interface NetlifyEvent {
  httpMethod: string
  headers: Record<string, string | undefined>
  body: string | null
}
interface NetlifyResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

let cachedApp: ReturnType<typeof initializeApp> | null = null

function getAdminApp() {
  if (cachedApp) return cachedApp
  if (getApps().length > 0) { cachedApp = getApps()[0] as any; return cachedApp! }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set')
  cachedApp = initializeApp({ credential: cert(JSON.parse(raw)) })
  return cachedApp
}

async function isRequestingUserAdmin(idToken: string, db: Firestore): Promise<{ ok: true; uid: string } | { ok: false; reason: string }> {
  let decoded
  try {
    decoded = await getAuth(getAdminApp()).verifyIdToken(idToken)
  } catch {
    return { ok: false, reason: 'Invalid or expired token' }
  }
  const userSnap = await db.collection('users').doc(decoded.uid).get()
  if (!userSnap.exists || userSnap.data()?.role !== 'admin') {
    return { ok: false, reason: 'User is not an admin' }
  }
  return { ok: true, uid: decoded.uid }
}

interface AlertRequestBody {
  subject?: string
  html?:    string
  text?:    string
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  const jsonHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const recipientsRaw = process.env.ALERT_RECIPIENT_EMAILS
  if (!resendApiKey || !recipientsRaw) {
    return { statusCode: 501, headers: jsonHeaders, body: JSON.stringify({ error: 'Alert email is not configured yet — RESEND_API_KEY and ALERT_RECIPIENT_EMAILS must be set in Netlify env vars.' }) }
  }
  const recipients = recipientsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  if (recipients.length === 0) {
    return { statusCode: 501, headers: jsonHeaders, body: JSON.stringify({ error: 'ALERT_RECIPIENT_EMAILS is empty' }) }
  }

  const authHeader = event.headers.authorization ?? event.headers.Authorization
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  if (!idToken) {
    return { statusCode: 401, headers: jsonHeaders, body: JSON.stringify({ error: 'Missing Authorization: Bearer <idToken> header' }) }
  }

  let db: Firestore
  try {
    db = getFirestore(getAdminApp())
  } catch (err: any) {
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: err?.message ?? 'Server not configured' }) }
  }

  const authResult = await isRequestingUserAdmin(idToken, db)
  if (!authResult.ok) {
    return { statusCode: 403, headers: jsonHeaders, body: JSON.stringify({ error: authResult.reason }) }
  }

  let body: AlertRequestBody
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }
  if (!body.subject || !body.html) {
    return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: 'subject and html are required' }) }
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.ALERT_SENDER_EMAIL || 'PharmaPulse Alerts <alerts@pharmapulse.app>',
      to: recipients,
      subject: body.subject,
      html: body.html,
      text: body.text,
    }),
  })

  if (!resendRes.ok) {
    const detail = await resendRes.text().catch(() => '')
    return { statusCode: 502, headers: jsonHeaders, body: JSON.stringify({ error: `Resend API rejected the request (${resendRes.status})`, detail }) }
  }

  return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ sent: true, recipients: recipients.length, sentBy: authResult.uid }) }
}
