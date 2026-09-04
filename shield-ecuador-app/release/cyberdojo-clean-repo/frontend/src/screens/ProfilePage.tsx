import React from 'react'
import { BeltBadge, SectionHeader, XPBar } from '../components/CyberBushido'
import { beltPath } from '../data/ciberDojo'
import { useAuth } from '../contexts/AuthContext'
import { useDojoStore } from '../store/dojoStore'

export function ProfilePage() {
  const { userProfile, user } = useAuth()
  const { belt, xp } = useDojoStore()
  const name = userProfile?.full_name ?? user?.email ?? 'Guerrero'

  return (
    <div>
      <SectionHeader eyebrow="// TARJETA DE GUERRERO" title="Perfil · 戦士" kanji="戦士" />
      <div className="dashboard-grid">
        <section className="glass-panel p-6">
          <div className="fighter max-w-xs">侍</div>
          <h2 className="font-bold text-4xl">{name}</h2>
          <p className="mono-label mt-2">{userProfile?.business_type ?? 'PYME Ecuador'} · {userProfile?.email ?? user?.email}</p>
          <div className="mt-5"><BeltBadge level={belt} size="lg" animate /></div>
          <div className="mt-5"><XPBar current={xp} max={5000} belt={belt} /></div>
        </section>
        <section className="glass-panel p-6">
          <h3 className="text-2xl font-bold mb-4">Camino del cinturon</h3>
          <div className="grid gap-4">
            {beltPath.map((item) => (
              <div key={item.level} className="mission-card">
                <BeltBadge level={item.level} showKanji />
                <div className="flex-1">
                  <strong>{item.iso}</strong>
                  <p>{item.xp} XP requeridos</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
