import React from 'react'
import { useNavigate } from 'react-router-dom'
import { NeonButton, SectionHeader } from './CyberBushido'

// Shown instead of a real screen whenever a guest (anonymous) session tries
// to reach anything past the first dojo — GuestGate in App.tsx decides when
// this renders, this component only asks for the sign-up.
export function GuestRegisterPrompt() {
  const navigate = useNavigate()
  return (
    <div className="learning-page">
      <SectionHeader eyebrow="MODO INVITADO" title="Regístrate para tener la experiencia completa" kanji="門" />
      <div className="learning-intro glass-panel">
        <p>Como invitado puedes practicar el primer dojo. Para desbloquear el resto de los dojos, el kata, el Sensei y tu progreso guardado, crea una cuenta gratis — toma menos de un minuto.</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <NeonButton color="cyan" variant="outline" onClick={() => navigate('/registro')}>Regístrate gratis</NeonButton>
          <NeonButton color="gold" variant="outline" onClick={() => navigate('/dojos')}>Volver a mi dojo</NeonButton>
        </div>
      </div>
    </div>
  )
}
