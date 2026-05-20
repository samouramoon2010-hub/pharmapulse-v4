// ============================================================
// ErrorBoundary — prevents white screen on runtime errors
// ============================================================
import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="max-w-md w-full kpi-card border-red-500/20 bg-red-500/5 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-red-300">حدث خطأ غير متوقع</h2>
            <p className="text-sm text-slate-400 mt-1">
              {this.state.error?.message || 'خطأ في التطبيق'}
            </p>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-xs text-slate-600 bg-slate-900 rounded-lg p-3 text-right overflow-auto max-h-32">
              {this.state.error.toString()}
            </pre>
          )}
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            className="btn-primary mx-auto gap-2"
          >
            <RefreshCw className="w-4 h-4" /> إعادة تحميل الصفحة
          </button>
        </div>
      </div>
    )
  }
}
