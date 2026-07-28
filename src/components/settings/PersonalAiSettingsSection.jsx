// ============================================================
// PersonalAiSettingsSection — BYOK ("Bring Your Own Key") settings UI
//
// Lets each user connect their OWN AI provider account to the
// Assistant on their OWN device. The API key is stored ONLY in this
// browser's localStorage (personalAiKeyStore.ts) — never sent to our
// backend, never written to Firestore, never visible to any other
// user. Every AI call made with this key goes directly from the
// user's browser to the chosen provider and is billed to the user's
// own account.
//
// Visible to every role that can see the Assistant (admin,
// general_manager, district_supervisor, manager) — not admin-gated,
// because this is a personal connection, not an org-wide policy.
// ============================================================
import React, { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, CheckCircle2, XCircle, Loader2, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react'
import {
  loadPersonalAiSettings, savePersonalAiSettings, clearPersonalAiSettings,
} from '../../assistant/personalAiKeyStore'
import {
  PERSONAL_AI_PROVIDER_DEFAULT_MODEL, PERSONAL_AI_PROVIDER_LABEL, createEmptyPersonalAiSettings,
} from '../../assistant/personalAiSettingsTypes'
import { testPersonalAiConnection } from '../../assistant/personalAiConnector'
import { listGeminiModels } from '../../assistant/realAiProviderClient'
import { useToastStore } from '../ui/Toast'

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} type="button"
      className="w-11 h-6 rounded-full relative flex-shrink-0 transition-all duration-300"
      style={{ background: value ? 'var(--brand-500)' : 'var(--bg-hover)', border: '1px solid var(--border)' }}>
      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300"
           style={{ right: value ? '2px' : 'calc(100% - 22px)' }} />
    </button>
  )
}

const PROVIDERS = ['openai', 'gemini', 'claude']

export default function PersonalAiSettingsSection() {
  const toast = useToastStore()
  const [settings, setSettings] = useState(() => loadPersonalAiSettings() ?? createEmptyPersonalAiSettings())
  const [showKey, setShowKey] = useState(false)
  const [testState, setTestState] = useState(null) // null | 'testing' | { ok, message }
  const [isConfigured, setIsConfigured] = useState(() => Boolean(loadPersonalAiSettings()?.apiKey))
  const [geminiModels, setGeminiModels] = useState([]) // [] until loaded — falls back to a free-text field
  const [modelsState, setModelsState] = useState(null) // null | 'loading' | { error }

  useEffect(() => { setTestState(null) }, [settings.provider, settings.model, settings.apiKey])
  useEffect(() => { setGeminiModels([]); setModelsState(null) }, [settings.provider])

  const updateField = (field, value) => setSettings((prev) => ({ ...prev, [field]: value }))

  const handleProviderChange = (provider) => {
    setSettings((prev) => ({ ...prev, provider, model: PERSONAL_AI_PROVIDER_DEFAULT_MODEL[provider] }))
  }

  const handleLoadGeminiModels = async () => {
    if (!settings.apiKey) {
      setModelsState({ error: 'Enter an API key first.' })
      return
    }
    setModelsState('loading')
    try {
      const models = await listGeminiModels(settings.apiKey)
      setGeminiModels(models)
      setModelsState(null)
      if (models.length > 0 && !models.some((m) => m.name === settings.model)) {
        updateField('model', models[0].name)
      }
    } catch (e) {
      setGeminiModels([])
      setModelsState({ error: e instanceof Error ? e.message : 'Could not load models.' })
    }
  }

  const handleTest = async () => {
    setTestState('testing')
    const result = await testPersonalAiConnection(settings)
    setTestState(result)
  }

  const handleSave = () => {
    const ok = savePersonalAiSettings(settings)
    if (ok) {
      setIsConfigured(Boolean(settings.apiKey))
      toast.success('Personal AI settings saved on this device.')
    } else {
      toast.error('Could not save — this browser may be blocking local storage.')
    }
  }

  const handleClear = () => {
    clearPersonalAiSettings()
    setSettings(createEmptyPersonalAiSettings())
    setIsConfigured(false)
    setTestState(null)
    toast.success('Personal AI disconnected and key removed from this device.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Status strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
        borderRadius: 'var(--radius-panel, 10px)',
        background: isConfigured ? 'rgba(0,210,173,0.08)' : 'var(--bg-hover)',
        border: `1px solid ${isConfigured ? 'rgba(0,210,173,0.25)' : 'var(--border-subtle)'}`,
      }}>
        <Sparkles style={{ width: 16, height: 16, color: isConfigured ? 'var(--brand-400)' : 'var(--text-muted)', flexShrink: 0 }} strokeWidth={1.75} />
        <div style={{ fontSize: 'var(--font-body, 13px)', color: 'var(--text-secondary)' }}>
          {isConfigured
            ? 'Your personal AI is connected. The Assistant will use it on this device, billed to your own provider account.'
            : 'Connect your own AI provider to enhance the Assistant with natural-language explanations — your key stays on this device only.'}
        </div>
      </div>

      {/* Provider selection */}
      <div>
        <div style={{ fontSize: 'var(--font-caption, 11px)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          Provider
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {PROVIDERS.map((p) => {
            const active = settings.provider === p
            return (
              <button key={p} type="button" onClick={() => handleProviderChange(p)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-input, 8px)',
                  background: active ? 'var(--bg-active)' : 'var(--bg-hover)',
                  border: `1px solid ${active ? 'var(--border-brand)' : 'var(--border)'}`,
                  color: active ? 'var(--brand-300)' : 'var(--text-secondary)',
                  fontSize: 'var(--font-body, 13px)', fontWeight: 600, cursor: 'pointer',
                }}>
                {PERSONAL_AI_PROVIDER_LABEL[p]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Model */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: 'var(--font-caption, 11px)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Model
          </div>
          {settings.provider === 'gemini' && (
            <button type="button" onClick={handleLoadGeminiModels} disabled={modelsState === 'loading'}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none',
                color: 'var(--brand-300)', fontSize: 'var(--font-caption, 11px)', fontWeight: 600, cursor: 'pointer', padding: 0,
              }}>
              {modelsState === 'loading'
                ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" />
                : <RefreshCw style={{ width: 11, height: 11 }} />}
              {geminiModels.length > 0 ? 'Refresh models' : 'Load available models'}
            </button>
          )}
        </div>

        {settings.provider === 'gemini' && geminiModels.length > 0 ? (
          <select
            value={settings.model}
            onChange={(e) => updateField('model', e.target.value)}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-input, 8px)',
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 'var(--font-body, 13px)',
            }}>
            {geminiModels.map((m) => (
              <option key={m.name} value={m.name}>{m.displayName}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={settings.model}
            onChange={(e) => updateField('model', e.target.value)}
            placeholder={PERSONAL_AI_PROVIDER_DEFAULT_MODEL[settings.provider]}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-input, 8px)',
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 'var(--font-body, 13px)',
            }}
          />
        )}

        {settings.provider === 'gemini' && modelsState && modelsState !== 'loading' && (
          <p style={{ fontSize: 'var(--font-caption, 11px)', color: '#f87171', margin: '6px 0 0' }}>
            {modelsState.error}
          </p>
        )}
        {settings.provider === 'gemini' && geminiModels.length === 0 && !modelsState && (
          <p style={{ fontSize: 'var(--font-caption, 11px)', color: 'var(--text-muted)', margin: '6px 0 0' }}>
            Load the list of models your key can actually use, or type a model id manually.
          </p>
        )}
      </div>

      {/* API key */}
      <div>
        <div style={{ fontSize: 'var(--font-caption, 11px)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          API key
        </div>
        <div style={{ position: 'relative' }}>
          <KeyRound style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-muted)' }} strokeWidth={1.75} />
          <input
            type={showKey ? 'text' : 'password'}
            value={settings.apiKey}
            onChange={(e) => updateField('apiKey', e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            style={{
              width: '100%', padding: '9px 38px 9px 34px', borderRadius: 'var(--radius-input, 8px)',
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontSize: 'var(--font-body, 13px)', fontFamily: 'monospace',
            }}
          />
          <button type="button" onClick={() => setShowKey((v) => !v)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            {showKey ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
          </button>
        </div>
        <p style={{ fontSize: 'var(--font-caption, 11px)', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
          <ShieldCheck style={{ width: 12, height: 12, marginTop: '1px', flexShrink: 0 }} strokeWidth={1.75} />
          Stored only in this browser. Never sent to PharmaPulse servers or saved to your account.
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <div style={{ fontSize: 'var(--font-body, 13px)', fontWeight: 500, color: 'var(--text-primary)' }}>Enable personal AI in the Assistant</div>
          <div style={{ fontSize: 'var(--font-caption, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>
            When off, the Assistant only answers deterministically from your own data.
          </div>
        </div>
        <Toggle value={settings.enabled} onChange={(v) => updateField('enabled', v)} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={handleTest} disabled={testState === 'testing'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px',
            borderRadius: 'var(--radius-button, 8px)', border: '1px solid var(--border)',
            background: 'var(--bg-hover)', color: 'var(--text-secondary)',
            fontSize: 'var(--font-body, 13px)', fontWeight: 600, cursor: 'pointer',
          }}>
          {testState === 'testing' ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <Sparkles style={{ width: 13, height: 13 }} />}
          Test connection
        </button>
        <button type="button" onClick={handleSave}
          style={{
            padding: '9px 16px', borderRadius: 'var(--radius-button, 8px)', border: 'none',
            background: 'var(--brand-500)', color: '#fff',
            fontSize: 'var(--font-body, 13px)', fontWeight: 600, cursor: 'pointer',
          }}>
          Save
        </button>
        {isConfigured && (
          <button type="button" onClick={handleClear}
            style={{
              padding: '9px 16px', borderRadius: 'var(--radius-button, 8px)',
              border: '1px solid var(--border)', background: 'transparent', color: '#f87171',
              fontSize: 'var(--font-body, 13px)', fontWeight: 600, cursor: 'pointer',
            }}>
            Disconnect &amp; remove key
          </button>
        )}
      </div>

      {testState && testState !== 'testing' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px',
          borderRadius: 'var(--radius-input, 8px)',
          background: testState.ok ? 'rgba(0,210,173,0.08)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${testState.ok ? 'rgba(0,210,173,0.25)' : 'rgba(248,113,113,0.25)'}`,
        }}>
          {testState.ok
            ? <CheckCircle2 style={{ width: 14, height: 14, color: '#34d399', flexShrink: 0, marginTop: '1px' }} />
            : <XCircle style={{ width: 14, height: 14, color: '#f87171', flexShrink: 0, marginTop: '1px' }} />}
          <span style={{ fontSize: 'var(--font-caption, 12px)', color: 'var(--text-secondary)' }}>{testState.message}</span>
        </div>
      )}
    </div>
  )
}
