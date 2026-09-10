import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { allies } from '../data/characters'

const KEY = 'ciberdojo-companion-v1'
export function useCompanion() {
  const [id, setId] = useState(() => {
    try { return localStorage.getItem(KEY) || 'doggoteka' } catch { return 'doggoteka' }
  })
  const character = allies.find(c => c.id === id) || allies[0]
  function choose(value: string) {
    if (!allies.some(c => c.id === value)) return
    setId(value)
    try { localStorage.setItem(KEY, value) } catch { /* The selection still works for this visit. */ }
  }
  return { character, choose }
}
export function DoggoArt({ className = '' }: { className?: string }) {
  return <div className={`doggo-art ${className}`}><img src="/cinematic/doggoteka.webp" alt="DoggoTeka, perro karateca con traje blanco, cinturón negro y un escudo de energía dorada" loading="lazy" /></div>
}
export function DoggoNote({ children }: { children: React.ReactNode }) {
  return <aside className="doggo-note"><DoggoArt /><div><Link to="/personajes/doggoteka">DoggoTeka te acompaña</Link><p>{children}</p></div></aside>
}
export function CompanionPicker() {
  const { character, choose } = useCompanion()
  return <div className="companion-picker">
    {character.id === 'doggoteka' ? <DoggoArt /> : <img className="companion-photo" src={character.image} alt={character.name} />}
    <label htmlFor="companion">Mi compañero de aprendizaje</label>
    <select id="companion" value={character.id} onChange={e => choose(e.target.value)}>{allies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    <p>«{character.motto}»</p><Link to={`/personajes/${character.id}`}>Conocer su ficha ↗</Link>
  </div>
}
