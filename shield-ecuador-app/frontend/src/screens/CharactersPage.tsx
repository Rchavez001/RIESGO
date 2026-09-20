import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { characters, doggoteka } from '../data/characters'
import { CinematicPublicShell } from '../components/CinematicPublicShell'
import { DoggoArt, useCompanion } from '../components/DojoCompanion'

export function CharactersPage() {
  const { id } = useParams()
  const [filter, setFilter] = useState('all')
  const { character: companion, choose } = useCompanion()
  const character = characters.find(c => c.id === id)
  const pageTitle = character ? `${character.name} — Personajes de CiberDojo` : 'Personajes — CiberDojo'
  useEffect(() => {
    const previous = document.title
    document.title = pageTitle
    return () => { document.title = previous }
  }, [pageTitle])
  if (id && !character) return <CinematicPublicShell><section className="cinema-container cinema-section"><h1>No encontramos ese personaje.</h1><Link to="/personajes">Volver a los personajes</Link></section></CinematicPublicShell>
  if (character) return <CinematicPublicShell><div className="cinema-container character-detail">
    <Link className="cinema-back" to="/personajes">← Todos los personajes</Link>
    <article className={`character-sheet ${character.side}`}>
      <div className="character-sheet-art">{character.id === 'doggoteka' ? <DoggoArt /> : <img src={character.image} alt={character.name} />}<span className="cinema-eyebrow">{character.side === 'ally' ? 'ALIADO DEL DOJO' : 'CONOCE LA AMENAZA'}</span></div>
      <div className="character-sheet-copy"><span className="cinema-eyebrow">{character.id === 'doggoteka' ? 'MASCOTA OFICIAL · CINTURÓN NEGRO' : character.role}</span><h1>{character.name}</h1><blockquote>«{character.motto}»</blockquote><p>{character.story}</p><h2>{character.side === 'ally' ? 'Lo que aprenderás con su ayuda' : 'Cómo reconocer su engaño'}</h2><p>{character.teaches}</p><dl>{character.moves.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><div className="character-practice"><strong>Una defensa para tu vida diaria</strong><p>{character.practice}</p></div>
        <div className="cinema-actions">{character.side === 'ally' && <button className="cinema-button" aria-pressed={companion.id === character.id} onClick={() => choose(character.id)}>{companion.id === character.id ? 'Es mi compañero ✓' : 'Elegir como compañero'}</button>}<button className="cinema-button secondary" onClick={() => window.print()}>Imprimir ficha</button>{character.id !== 'doggoteka' && <a href={`/cinematic/${character.id}-ficha.png`} className="cinema-text-link" target="_blank" rel="noreferrer">Ver arte original ↗</a>}</div>
      </div></article></div></CinematicPublicShell>
  return <CinematicPublicShell><div className="cinema-container cinema-section"><span className="cinema-eyebrow">NADIE APRENDE SOLO</span><h1 className="cinema-page-title">Conoce a tu equipo.<br /><em>Reconoce los engaños.</em></h1><p className="cinema-lead">Los aliados te acompañan. Los adversarios representan riesgos que puedes aprender a reconocer, sin palabras difíciles.</p>
    <Link className="doggo-feature" to="/personajes/doggoteka"><DoggoArt /><div><span className="cinema-eyebrow">UN LUGAR ESPECIAL EN EL DOJO</span><h2>DoggoTeka</h2><p>{doggoteka.motto} Tu compañero para aprender con paciencia y confianza.</p><span className="cinema-text-link">Conocer a nuestra mascota ↗</span></div></Link>
    <div className="character-filters" role="group" aria-label="Filtrar personajes">{[['all','Todos'],['ally','Aliados'],['threat','Adversarios']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="character-grid">{characters.filter(c => filter === 'all' || c.side === filter).map(c => <Link key={c.id} className="character-card" to={`/personajes/${c.id}`}>
      {c.id === 'doggoteka' ? <DoggoArt /> : <img src={c.image} alt={c.name} loading="lazy" />}<div><span className="cinema-eyebrow">{c.side === 'ally' ? 'ALIADO' : 'ADVERSARIO'}</span><h2>{c.name}</h2><p>{c.role}</p><span className="cinema-text-link">Ver ficha ↗</span></div></Link>)}</div>
  </div></CinematicPublicShell>
}
