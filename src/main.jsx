import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import ErrorBoundary from './components/ui/ErrorBoundary.jsx'
// Phase 1A: KPI registry sync guard — development-only, no-op in production
import './engine/kpiRegistry/registrySyncGuard'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
