// One-off verification helper — mints a connector access token using the
// exact same HMAC format as src/services/connector/connectorTokenService.ts
// (base64url(header)~base64url(payload)~base64url(HMAC-SHA256 sig), '~'
// delimited rather than '.' — see that file for why),
// reading the shared secret from an env var that is never printed.
// Used only to drive the external remote-verification checklist against
// the deployed preview URL; not shipped code.
import { createHmac, randomUUID } from 'crypto'

const secret = process.env.CONNECTOR_TOKEN_SECRET
if (!secret) { console.error('CONNECTOR_TOKEN_SECRET not set'); process.exit(1) }

function base64url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}
function sign(headerAndPayload, secret) {
  return base64url(createHmac('sha256', secret).update(headerAndPayload).digest())
}

const nowSec = Math.floor(Date.now() / 1000)
const header = { alg: 'HS256', typ: 'PHC1' }
const claims = {
  sub: process.argv[2] || 'chatgpt-preview-readonly',
  scope: (process.argv[3] || 'reference:read').split(','),
  aud: process.argv[4] || 'pharmapulse-connector',
  iss: process.argv[5] || 'pharmapulse',
  exp: nowSec + parseInt(process.argv[6] || '3600', 10),
  iat: nowSec,
  jti: randomUUID(),
}
const headerAndPayload = `${base64url(JSON.stringify(header))}~${base64url(JSON.stringify(claims))}`
const signature = sign(headerAndPayload, secret)
console.log(`${headerAndPayload}~${signature}`)
