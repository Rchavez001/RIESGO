import React from 'react'
import { AnimatePresence } from 'framer-motion'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Loader } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LandingPage } from './screens/LandingPage'
import { LoginScreen } from './screens/LoginScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { DojoListPage } from './screens/DojoListPage'
import { DojoDetailPage } from './screens/DojoDetailPage'
import { KataExamPage } from './screens/KataExamPage'
// Dev route: render kata page without auth for testing
import { KataExamPage as DevKata } from './screens/KataExamPage'
import { LeaderboardPage } from './screens/LeaderboardPage'
import { ProfilePage } from './screens/ProfilePage'
import { SenseiConsultPage } from './screens/SenseiConsultPage'
import { ResetPasswordPage } from './screens/ResetPasswordPage'
import { AuthCallbackPage } from './screens/AuthCallbackPage'
import { DojoShell } from './components/CyberBushido'
import { AdminShell } from './components/AdminShell'
import { PageTransition } from './components/PageTransition'
import { ToastProvider } from './contexts/ToastContext'
import { DojoAudioProvider } from './contexts/DojoAudioContext'
import { DojoWebGLBackdrop } from './components/DojoWebGLBackdrop'
import { useDojoStore } from './store/dojoStore'
import { PWAInstallPrompt } from './components/PWAInstallPrompt'

// Lazy-loaded: heavy, infrequently-used screens kept out of the initial bundle.
const AdminCenterScreen = React.lazy(() => import('./screens/AdminCenterScreen').then((m) => ({ default: m.AdminCenterScreen })))
const TenantAdminPage = React.lazy(() => import('./screens/TenantAdminPage').then((m) => ({ default: m.TenantAdminPage })))
const VulnScannerPage = React.lazy(() => import('./screens/VulnScannerPage').then((m) => ({ default: m.VulnScannerPage })))

function LoadingScreen() {
  return (
    <div className="cyber-page grid place-items-center min-h-screen">
      <div className="text-center">
        <div className="torii">⛩</div>
        <Loader className="animate-spin mx-auto text-cyan-300" size={34} />
        <p className="mono-label mt-4">CARGANDO CIBER DOJO</p>
      </div>
    </div>
  )
}

function ProtectedShell() {
  const { user, userProfile, loading, signOut } = useAuth()
  const { belt, xp, setBelt } = useDojoStore()
  const location = useLocation()

  React.useEffect(() => {
    if (userProfile?.belt) {
      try { setBelt(userProfile.belt as any) } catch (e) {}
    }
  }, [userProfile, setBelt])

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  if (userProfile?.role === 'admin') {
    return (
      <AdminShell
        userName={userProfile.full_name ?? ''}
        userEmail={user.email ?? ''}
        onSignOut={() => void signOut()}
      >
        <Outlet />
      </AdminShell>
    )
  }

  return (
    <DojoShell
      userName={userProfile?.full_name ?? user.email ?? 'Guerrero'}
      belt={belt}
      xp={xp}
      isAdmin={false}
      onSignOut={() => void signOut()}
    >
      <Outlet />
    </DojoShell>
  )
}

function DashboardOrAdminRedirect() {
  const { userProfile, loading } = useAuth()
  if (loading) return null
  if (userProfile?.role === 'admin') return <Navigate to="/admin" replace />
  return <PageTransition><DashboardScreen /></PageTransition>
}

function AdminOnlyRoute() {
  const { userProfile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (userProfile?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function AdminRoute() {
  const { userProfile } = useAuth()
  return (
    <React.Suspense fallback={<LoadingScreen />}>
      <AdminCenterScreen currentUser={userProfile} onBackToApp={() => window.history.back()} />
    </React.Suspense>
  )
}

function TenantAdminRoute() {
  const { user, userProfile, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (userProfile?.role !== 'admin') return <Navigate to="/dashboard" replace />

  return (
    <PageTransition>
      <React.Suspense fallback={<LoadingScreen />}>
        <TenantAdminPage />
      </React.Suspense>
    </PageTransition>
  )
}

function AppRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/dev/kata/:code" element={<PageTransition><DevKata /></PageTransition>} />
        <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
        <Route path="/login" element={<PageTransition><LoginScreen /></PageTransition>} />
        <Route path="/auth/callback" element={<PageTransition><AuthCallbackPage /></PageTransition>} />
        <Route path="/reset-password" element={<PageTransition><ResetPasswordPage /></PageTransition>} />
        <Route path="/tenant-admin" element={<TenantAdminRoute />} />
        <Route element={<ProtectedShell />}>
          <Route path="/dashboard" element={<DashboardOrAdminRedirect />} />
          <Route path="/dojos" element={<PageTransition><DojoListPage /></PageTransition>} />
          <Route path="/dojo/:id" element={<PageTransition><DojoDetailPage /></PageTransition>} />
          <Route path="/kata/:code" element={<PageTransition><KataExamPage /></PageTransition>} />
          <Route path="/sensei" element={<PageTransition><SenseiConsultPage /></PageTransition>} />
          <Route path="/escaner" element={<PageTransition><React.Suspense fallback={<LoadingScreen />}><VulnScannerPage /></React.Suspense></PageTransition>} />
          <Route path="/ranking" element={<PageTransition><LeaderboardPage /></PageTransition>} />
          <Route path="/perfil" element={<PageTransition><ProfilePage /></PageTransition>} />
          <Route element={<AdminOnlyRoute />}>
            <Route path="/admin" element={<PageTransition><AdminRoute /></PageTransition>} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <DojoAudioProvider>
        <ToastProvider>
          <DojoWebGLBackdrop />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <PWAInstallPrompt />
        </ToastProvider>
      </DojoAudioProvider>
    </AuthProvider>
  )
}
