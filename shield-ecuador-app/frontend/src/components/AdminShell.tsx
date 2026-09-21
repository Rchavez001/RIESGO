import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, LogOut, Menu, Shield, Swords, X } from 'lucide-react'
import { setViewingAsUser } from '../lib/viewAsUser'
import { useMediaQuery } from '../hooks/useMediaQuery'
import './adminshell.css'

interface AdminShellProps {
  children: React.ReactNode
  userName: string
  userEmail: string
  onSignOut: () => void
}

const NAV_SECTIONS = [
  {
    group: 'PRINCIPAL',
    items: [
      { to: '/admin', tab: '', label: 'Panel de administración', icon: LayoutDashboard, external: true },
    ],
  },
]

export function AdminShell({ children, userName, userEmail, onSignOut }: AdminShellProps) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const tab = new URLSearchParams(location.search).get('tab') ?? ''
  const isMobile = useMediaQuery('(max-width: 820px)')
  const sidebarRef = useRef<HTMLElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Off-canvas drawer on phones: while it is open, Escape closes it, page scroll is locked and focus
    // starts inside it; when it closes focus goes back to the menu button.
    if (!open || !isMobile) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sidebarRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); menuBtnRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow }
  }, [open, isMobile])

  function viewAsUser() {
    setViewingAsUser(true)
    setOpen(false)
    navigate('/dashboard')
  }

  function isActive(to: string, itemTab: string) {
    const toPath = to.split('?')[0]
    if (toPath !== location.pathname) return false
    if (location.pathname !== '/admin') return true
    return itemTab === tab || (!itemTab && !tab)
  }

  return (
    <div className="adm-shell">
      {/* ── Sidebar ── */}
      <a className="adm-skip" href="#adm-contenido">Saltar al contenido</a>
      {/* Closed drawer on a phone is off-screen but its links would still take keyboard focus: inert removes them. */}
      <aside id="adm-sidebar" ref={sidebarRef} className={`adm-sidebar${open ? ' open' : ''}`} inert={isMobile && !open}>
        <div className="adm-brand">
          <Shield size={20} className="adm-brand-icon" />
          <div>
            <span className="adm-brand-name">CIBER DOJO</span>
            <span className="adm-brand-sub">CONSOLA ADMIN</span>
          </div>
        </div>

        <nav className="adm-nav" aria-label="Consola de administración">
          {NAV_SECTIONS.map((section) => (
            <div key={section.group} className="adm-nav-group">
              <span className="adm-nav-group-label">{section.group}</span>
              {section.items.map(({ to, tab: itemTab, label, icon: Icon, external }) => (
                external ? (
                  <a key={to} href={to} className="adm-nav-item" onClick={() => setOpen(false)}>
                    <Icon size={15} />
                    {label}
                  </a>
                ) : (
                  <NavLink
                    key={to + itemTab}
                    to={to}
                    end
                    className={() => `adm-nav-item${isActive(to, itemTab) ? ' active' : ''}`}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={15} />
                    {label}
                  </NavLink>
                )
              ))}
            </div>
          ))}
          <div className="adm-nav-group">
            <span className="adm-nav-group-label">APLICACIÓN USUARIO</span>
            <button type="button" className="adm-nav-item" onClick={viewAsUser}>
              <Swords size={15} />
              Ver como usuario
            </button>
          </div>
        </nav>

        <div className="adm-sidebar-foot">
          <div className="adm-user-info">
            <span className="adm-user-name">{userName || userEmail}</span>
            <span className="adm-user-badge">ADMINISTRADOR</span>
          </div>
          <button type="button" className="adm-signout" onClick={onSignOut}>
            <LogOut size={13} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Mobile overlay ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="adm-overlay"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Main ── */}
      <div className="adm-main">
        <header className="adm-topbar">
          <button ref={menuBtnRef} type="button" className="adm-menu-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Cerrar menú de administración' : 'Abrir menú de administración'} aria-expanded={open} aria-controls="adm-sidebar">
            {open ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
          <div className="adm-topbar-title">
            <Shield size={14} />
            CONSOLA ADMINISTRATIVA
          </div>
        </header>

        <main id="adm-contenido" className="adm-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
