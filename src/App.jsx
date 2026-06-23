import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import HomePage from './pages/HomePage.jsx'
import ReportPage from './pages/ReportPage.jsx'
import MapDashboard from './pages/MapDashboard.jsx'
import LoginPage from './pages/LoginPage.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import Toast from './components/Toast.jsx'
import { auth, IS_MOCK_MODE } from './services/firebase.js'
import { syncPendingReports } from './services/offlineManager'
import { createReport } from './services/reportService'
import { LANGUAGES, translations } from './utils/translations'
import './App.css'

function App() {
  const navigate = useNavigate()
  const [theme, setTheme] = useState('dark')
  const [toast, setToast] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isAdmin, setIsAdmin] = useState(false)
  const [lang, setLang] = useState(localStorage.getItem('crisismap_lang') || 'en')

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() })
    setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('crisismap_lang', lang)
    const langObj = LANGUAGES.find(l => l.code === lang)
    if (langObj) {
      document.documentElement.setAttribute('lang', lang)
      document.documentElement.setAttribute('dir', langObj.dir)
    }
  }, [lang])

  // Subscribe to connection states
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true)
      showToast(translations[lang].backOnline, 'info')
      try {
        const result = await syncPendingReports(createReport)
        if (result.synced > 0) {
          showToast(translations[lang].syncSuccess, 'success')
        }
      } catch (err) {
        console.error('[App] Sync failed:', err)
        showToast(translations[lang].syncFail, 'error')
      }
    }
    const handleOffline = () => {
      setIsOnline(false)
      showToast(translations[lang].offlineMode, 'warning')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Trigger sync on mount if online
    if (navigator.onLine) {
      syncPendingReports(createReport)
        .then(result => {
          if (result.synced > 0) {
            showToast(translations[lang].syncSuccess, 'success')
          }
        })
        .catch(err => console.error('[App] Initial sync failed:', err))
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [lang, showToast])

  // Subscribe to Authentication state (handles Mock & Firebase Auth)
  useEffect(() => {
    if (IS_MOCK_MODE) {
      const isMockAdmin = localStorage.getItem('crisismap_admin') === 'true'
      Promise.resolve().then(() => {
        setIsAdmin(isMockAdmin)
      })
    } else {
      let unsubscribe = () => {}
      ;(async () => {
        try {
          const { onAuthStateChanged } = await import('firebase/auth')
          unsubscribe = onAuthStateChanged(auth, (user) => {
            setIsAdmin(!!user)
          })
        } catch (err) {
          console.warn('[App] Firebase Auth listener failed to register:', err)
        }
      })()
      return () => unsubscribe()
    }
  }, [])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  const handleLogout = async () => {
    try {
      if (IS_MOCK_MODE) {
        localStorage.removeItem('crisismap_admin')
        setIsAdmin(false)
        showToast(translations[lang].logoutSuccess, 'info')
      } else {
        const { signOut } = await import('firebase/auth')
        await signOut(auth)
        setIsAdmin(false)
        showToast(translations[lang].logoutSuccess, 'info')
      }
      navigate('/')
    } catch (err) {
      console.error('[App] Logout failed:', err)
      showToast('Logout failed.', 'error')
    }
  }

  return (
    <div className="app">
      {/* Offline indicator bar */}
      {!isOnline && (
        <div className="offline-bar">
          <span className="offline-bar__icon">⚡</span>
          {translations[lang].offlineMode}
        </div>
      )}

      <Navbar 
        theme={theme} 
        onToggleTheme={toggleTheme}
        isOnline={isOnline}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        lang={lang}
        onLanguageChange={setLang}
      />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage lang={lang} />} />
          <Route path="/report" element={<ReportPage showToast={showToast} isOnline={isOnline} lang={lang} />} />
          <Route path="/map" element={<MapDashboard showToast={showToast} lang={lang} />} />
          <Route path="/login" element={<LoginPage showToast={showToast} onLogin={setIsAdmin} lang={lang} />} />
          
          {/* Protected Admin Route */}
          <Route 
            path="/admin" 
            element={isAdmin ? <AdminDashboard showToast={showToast} lang={lang} /> : <Navigate to="/login" replace />} 
          />

          {/* Catch-all Redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          key={toast.id}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

export default App
