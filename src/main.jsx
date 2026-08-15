import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

const navigationEntry = window.performance.getEntriesByType('navigation')[0]
if (navigationEntry?.type === 'reload' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
  const finishReloadAtTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    window.history.scrollRestoration = 'auto'
  }
  if (document.readyState === 'complete') finishReloadAtTop()
  else window.addEventListener('load', finishReloadAtTop, { once: true })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
