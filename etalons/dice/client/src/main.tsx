import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Transport } from '@playtagon/runtime/transport'
import { initI18n } from './i18n'
import { DiceGame } from './game/DiceGame'
import './index.css'

const transport = new Transport()
initI18n(transport.getLang(), transport.getMode())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DiceGame />
  </StrictMode>,
)
