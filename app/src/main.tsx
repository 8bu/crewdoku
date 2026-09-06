import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { bootWorkspace } from './state/workspaceStore'
import './styles.css'

const host = document.getElementById('root')
if (!host) throw new Error('#root is missing from index.html')

await bootWorkspace()

createRoot(host).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
