import React from 'react'
import { BeltBadge, SectionHeader, XPBar } from '../components/CyberBushido'
import { beltPath } from '../data/ciberDojo'
import { useAuth } from '../contexts/AuthContext'
import { useDojoStore } from '../store/dojoStore'
import { CompanionPicker } from '../components/DojoCompanion'

export function ProfilePage() {
  const { userProfile, user } = useAuth()
  const { belt, xp } = useDojoStore()
  const name = userProfile?.full_name ?? user?.email ?? 'Guerrero'
  const currentIndex = Math.max(0, beltPath.findIndex((item) => item.level === belt))

  return (
    <div className="profile-page">
      <SectionHeader eyebrow="TU APRENDIZAJE, TU CAMINO" title="Mi perfil" kanji="戦士" />
      <div className="profile-grid">
        <section className="glass-panel p-6">
          <CompanionPicker />
          <h2 className="font-bold text-4xl profile-name">{name}</h2>
          <p className="mono-label mt-2 profile-meta">{userProfile?.business_type ?? 'PYME Ecuador'} · {userProfile?.email ?? user?.email}</p>
          <div className="mt-5"><BeltBadge level={belt} size="lg" animate /></div>
          <div className="mt-5"><XPBar current={xp} max={5000} belt={belt} /></div>
        </section>
        <section className="glass-panel p-6">
          <h3 className="text-2xl font-bold mb-4">Camino del cinturón</h3>
          <ol className="grid gap-4 profile-path">
            {beltPath.map((item, index) => (
              <li key={item.level} className="mission-card" aria-current={item.level === belt ? 'step' : undefined}>
                <BeltBadge level={item.level} showKanji />
                <div className="flex-1">
                  <strong>{item.iso}</strong>
                  <span className={`profile-step ${index < currentIndex ? 'done' : index === currentIndex ? 'current' : ''}`}>
                    {index < currentIndex ? '✓ Superado' : index === currentIndex ? '● Tu cinturón actual' : 'Por delante'}
                  </span>
                   <p>{item.level === 'blanco' ? 'Aquí comienza tu aprendizaje.' : 'Aprueba el kata del cinturón anterior: al menos 4 de 5 casos.'}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
