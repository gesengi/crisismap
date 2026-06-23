import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LANGUAGES, translations } from '../utils/translations'
import './Navbar.css'

/**
 * Main navigation bar with glass effect, theme toggle, and auth indicators.
 */
function Navbar({ theme, onToggleTheme, isOnline, isAdmin, onLogout, lang, onLanguageChange }) {
  const [menuOpen, setMenuOpen] = useState(false)

  // Define public navigation items
  const navItems = [
    { path: '/', label: translations[lang].navHome, icon: '🏠' },
    { path: '/report', label: translations[lang].navReport, icon: '📸' },
    { path: '/map', label: translations[lang].navMap, icon: '🗺️' },
  ]

  // Add Admin Console if logged in, otherwise show Coordinator Login
  if (isAdmin) {
    navItems.push({ path: '/admin', label: translations[lang].navAdmin, icon: '🛠️' })
  } else {
    navItems.push({ path: '/login', label: translations[lang].navLogin, icon: '🔑' })
  }

  return (
    <nav className="navbar glass-panel" role="navigation" aria-label="Main navigation">
      <div className="navbar__inner">
        {/* Logo */}
        <NavLink to="/" className="navbar__logo" onClick={() => setMenuOpen(false)} aria-label="CrisisMap Home">
          <span className="navbar__logo-icon">🌍</span>
          <span className="navbar__logo-text">
            Crisis<span className="navbar__logo-accent">Map</span>
          </span>
        </NavLink>

        {/* Desktop / Mobile Menu Links */}
        <div className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className="navbar__link-icon">{item.icon}</span>
              <span className="navbar__link-label">{item.label}</span>
            </NavLink>
          ))}
          
          {/* Logout option inline for mobile menu */}
          {isAdmin && (
            <button 
              type="button"
              className="navbar__link navbar__link--logout-btn-mobile"
              onClick={() => {
                setMenuOpen(false)
                onLogout()
              }}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
            >
              <span className="navbar__link-icon">🚪</span>
              <span className="navbar__link-label">{translations[lang].navLogout}</span>
            </button>
          )}
        </div>

        {/* Right side controls */}
        <div className="navbar__controls">
          {/* Network status */}
          <div 
            className={`navbar__status ${isOnline ? 'navbar__status--online' : 'navbar__status--offline'}`}
            title={isOnline ? translations[lang].onlineStatus : translations[lang].offlineStatus}
            aria-label={isOnline ? translations[lang].onlineStatus : translations[lang].offlineStatus}
          >
            <span className="navbar__status-dot"></span>
            <span className="navbar__status-text">{isOnline ? translations[lang].onlineStatus : translations[lang].offlineStatus}</span>
          </div>

          {/* Language Selector */}
          <select
            className="navbar__lang-select"
            value={lang}
            onChange={(e) => onLanguageChange(e.target.value)}
            aria-label="Change Language"
            title="Change Language"
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>

          {/* Theme toggle */}
          <button 
            className="navbar__theme-toggle btn-icon"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {/* Logout Button (Desktop) */}
          {isAdmin && (
            <button 
              type="button"
              className="btn btn-ghost btn-sm navbar__logout-btn-desktop"
              onClick={onLogout}
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              {translations[lang].navLogout} 🚪
            </button>
          )}

          {/* Mobile menu toggle */}
          <button 
            className="navbar__hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
          >
            <span className={`navbar__hamburger-bar ${menuOpen ? 'navbar__hamburger-bar--open' : ''}`}></span>
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {menuOpen && (
        <div className="navbar__overlay" onClick={() => setMenuOpen(false)} />
      )}
    </nav>
  )
}

export default Navbar

