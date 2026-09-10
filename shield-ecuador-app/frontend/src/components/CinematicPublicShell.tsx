import React from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
export function CinematicPublicShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return <div className="cinematic-public">
    <a className="cinema-skip" href="#contenido">Ir al contenido</a>
    <header className="cinema-header"><Link className="cinema-brand" to="/"><span>道</span><div>ciberDojo<small>EL ARTE DE PROTEGERTE</small></div></Link>
      <nav aria-label="Navegación principal"><NavLink to="/" end>Inicio</NavLink><NavLink to="/personajes">Personajes</NavLink><NavLink to="/practica">Probar el dojo</NavLink></nav>
      <Link className="cinema-login" to={user ? '/dashboard' : '/login'}>{user ? 'Mi entrenamiento' : 'Ingresar'} ↗</Link></header>
    <main id="contenido">{children}</main>
    <footer className="cinema-footer"><Link className="cinema-brand" to="/">道 ciberDojo</Link><p>La seguridad se aprende. Un paso a la vez.</p><Link to="/personajes/doggoteka">Conoce a DoggoTeka ↗</Link></footer>
  </div>
}
