import React from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
export function CinematicPublicShell({ children }: { children: React.ReactNode }) {
  const { user, continueAsGuest } = useAuth()
  const navigate = useNavigate()
  const isGuest = Boolean(user?.is_anonymous)

  // Same guest entry as the landing page's "Probar sin cuenta" — kept here
  // too since this header nav is shared across every public page.
  async function handleTryWithoutAccount(e: React.MouseEvent) {
    e.preventDefault()
    if (user) { navigate('/dojos'); return }
    try {
      await continueAsGuest()
    } catch (error) {
      console.error('No se pudo iniciar el modo invitado:', error)
    }
    navigate('/dojos')
  }

  return <div className="cinematic-public">
    <a className="cinema-skip" href="#contenido">Ir al contenido</a>
    <header className="cinema-header"><Link className="cinema-brand" to="/"><span>道</span><div>ciberDojo<small>EL ARTE DE PROTEGERTE</small></div></Link>
      <nav aria-label="Navegación principal"><NavLink to="/" end>Inicio</NavLink><NavLink to="/personajes">Personajes</NavLink><NavLink to="/dojos" onClick={handleTryWithoutAccount}>Probar el dojo</NavLink></nav>
      <Link className="cinema-login" to={user && !isGuest ? '/dashboard' : isGuest ? '/registro' : '/login'}>{user && !isGuest ? 'Mi entrenamiento' : isGuest ? 'Regístrate' : 'Ingresar'} ↗</Link></header>
    <main id="contenido" tabIndex={-1}>{children}</main>
    <footer className="cinema-footer"><Link className="cinema-brand" to="/">道 ciberDojo</Link><p>La seguridad se aprende. Un paso a la vez.</p><Link to="/personajes/doggoteka">Conoce a DoggoTeka ↗</Link></footer>
  </div>
}
