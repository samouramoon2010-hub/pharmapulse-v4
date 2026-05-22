import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import Logo from '../brand/Logo'

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info) }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
           style={{ background:'var(--bg-base)' }}>
        <div className="max-w-md w-full text-center space-y-6 animate-scale-in">
          <Logo size={42} className="justify-center" />
          <div className="card card-p py-8 space-y-4"
               style={{ borderColor:'rgba(239,68,68,0.2)', background:'rgba(239,68,68,0.04)' }}>
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
            <div>
              <h2 className="text-base font-bold" style={{ color:'var(--text-primary)' }}>حدث خطأ غير متوقع</h2>
              <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>{this.state.error?.message}</p>
            </div>
            <button onClick={() => { this.setState({ hasError:false }); window.location.reload() }}
              className="btn btn-primary mx-auto gap-2">
              <RefreshCw className="w-4 h-4" /> إعادة تحميل
            </button>
          </div>
        </div>
      </div>
    )
  }
}
