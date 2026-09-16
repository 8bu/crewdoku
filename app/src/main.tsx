import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { bootWorkspace } from './state/workspaceStore'
import { initAnalytics } from './analytics'
import './styles.css'

const host = document.getElementById('root')
if (!host) throw new Error('#root is missing from index.html')

// Before `bootWorkspace`: the tag is only injected when the build was given a
// measurement ID, and it must be queuing events before the first screen renders.
initAnalytics()
await bootWorkspace()

createRoot(host).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
