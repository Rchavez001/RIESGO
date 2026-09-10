import React from 'react'
import { Link } from 'react-router-dom'
import { CinematicPublicShell } from '../components/CinematicPublicShell'
export function PracticePage() {
  return <CinematicPublicShell><section className="demo-banner"><strong>Práctica sin cuenta</strong><p>Este recorrido guarda el avance solo en este navegador. Para conservarlo en tu cuenta, <Link to="/login?mode=register">regístrate gratis</Link>.</p></section><iframe className="dojo-demo-frame" src="/demo/index.html" title="Práctica de ciberDojo: 30 preguntas y un kata de cinco casos" /></CinematicPublicShell>
}
