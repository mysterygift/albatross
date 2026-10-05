import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/themes/shared.css'
import './styles/themes/overrides.css'
import './styles/themes/bold.css'
import './styles/themes/yuzu.css'
import './styles/themes/sunset.css'
import './styles/themes/signal.css'
import './styles/themes/ledger.css'
import './styles/themes/night.css'
import './styles/themes/clay.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
