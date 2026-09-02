import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, AlertTriangle, Bot, Brain, Building2, FileQuestion,
  LayoutDashboard, LogOut, Menu, Shield, Swords, X,
} from 'lucide-react'
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
      { to: '/admin', tab: '', label: 'Panel General', icon: LayoutDashboard },
    ],
  },
  {
    group: 'GESTIÓN DE CONTENIDO',
    items: [
      { to: '/admin?tab=questions', tab: 'questions', label: 'Preguntas', icon: FileQuestion },
      { to: '/admin?tab=sectors', tab: 'sectors', label: 'Sectores', icon: Building2 },
    ],
  },
  {
    group: 'INTELIGENCIA ARTIFICIAL',
    items: [
      { to: '/admin?tab=providers', tab: 'providers', label: 'IA Providers', icon: Brain },
      { to: '/admin?tab=agents', tab: 'agents', label: 'Agentes', icon: Bot },
      { to: '/admin?tab=incidents', tab: 'incidents', label: 'Incidentes', icon: AlertTriangle },
      { to: '/admin?tab=audit-report', tab: 'audit-report', label: 'Auditoría IA', icon: Activity },
    ],
  },
  {
    group: 'APLICACIÓN USUARIO',
    items: [
      { to: '/dashboard', tab: '', label: 'Ver como usuario', icon: Swords },
    ],
  },
]

export function AdminShell({ children, userName, userEmail, onSignOut }: AdminShellProps) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const tab = new URLSearchParams(location.search).get('tab') ?? ''

  function isActive(to: string, itemTab: string) {
    const toPath = to.split('?')[0]
    if (toPath !== location.pathname) return false
    if (location.pathname !== '/admin') return true
    return itemTab === tab || (!itemTab && !tab)
  }

  return (
    <div className="adm-shell">
      {/* ── Sidebar ── */}
      <aside className={`adm-sidebar${open ? ' open' : ''}`}>
        <div className="adm-brand">
          <Shield size={20} className="adm-brand-icon" />
          <div>
            <span className="adm-brand-name">CIBER DOJO</span>
            <span className="adm-brand-sub">CONSOLA ADMIN</span>
          </div>
        </div>

        <nav className="adm-nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.group} className="adm-nav-group">
              <span className="adm-nav-group-label">{section.group}</span>
              {section.items.map(({ to, tab: itemTab, label, icon: Icon }) => (
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
              ))}
            </div>
          ))}
        </nav>

        <div className="adm-sidebar-foot">
          <div className="adm-user-info">
            <span className="adm-user-name">{userName || userEmail}</span>
            <span className="adm-user-badge">ADMINISTRADOR</span>
          </div>
          <button className="adm-signout" onClick={onSignOut}>
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
          <button className="adm-menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menú admin">
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
          <div className="adm-topbar-title">
            <Shield size={14} />
            CONSOLA ADMINISTRATIVA
          </div>
        </header>

        <div className="adm-content">
          {children}
        </div>
      </div>
    </div>
  )
}
