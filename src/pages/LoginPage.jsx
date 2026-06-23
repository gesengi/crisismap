import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, IS_MOCK_MODE } from '../services/firebase'
import { translations } from '../utils/translations'
import './LoginPage.css'

function LoginPage({ showToast, onLogin, lang = 'en' }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      showToast(translations[lang].loginErrorFields || 'Please fill in all fields.', 'warning')
      return
    }

    setIsLoading(true)
    try {
      if (IS_MOCK_MODE) {
        // Simulated local mock login
        await new Promise((resolve) => setTimeout(resolve, 800))
        if (email === 'admin@crisismap.org' && password === 'password123') {
          localStorage.setItem('crisismap_admin', 'true')
          showToast(translations[lang].loginSuccessMock || 'Mock Coordinator logged in successfully!', 'success')
          onLogin(true)
          navigate('/admin')
        } else {
          showToast(translations[lang].loginErrorMock || 'Invalid demo credentials. Use the ones shown below.', 'error')
        }
      } else {
        // Live Firebase Auth login
        const { signInWithEmailAndPassword } = await import('firebase/auth')
        await signInWithEmailAndPassword(auth, email, password)
        showToast(translations[lang].loginSuccessMsg || 'Coordinator logged in successfully!', 'success')
        onLogin(true)
        navigate('/admin')
      }
    } catch (err) {
      console.error('[LoginPage] Auth failed:', err)
      showToast(err.message || translations[lang].loginErrorFirebase || 'Authentication failed. Please check credentials.', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-page fade-in">
      <div className="login-page__card glass-card">
        <div className="login-page__header">
          <span className="login-page__logo-icon" aria-hidden="true">🔒</span>
          <h1 className="login-page__title">{translations[lang].loginTitle || 'Coordinator Access'}</h1>
          <p className="login-page__subtitle">
            {translations[lang].loginSubtitle || 'Log in to access crisis dashboards, verification queues, and GIS data exports.'}
          </p>
        </div>

        <form className="login-page__form" onSubmit={handleSubmit}>
          <div className="login-page__field">
            <label className="login-page__label" htmlFor="email-input">
              {translations[lang].loginEmail || 'Email Address'}
            </label>
            <input 
              id="email-input"
              type="email" 
              className="login-page__input" 
              placeholder="name@agency.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="login-page__field">
            <label className="login-page__label" htmlFor="password-input">
              {translations[lang].loginPassword || 'Password'}
            </label>
            <input 
              id="password-input"
              type="password" 
              className="login-page__input" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary login-page__submit-btn"
            disabled={isLoading}
          >
            {isLoading 
              ? (translations[lang].loginAuthenticating || 'Authenticating...') 
              : (translations[lang].loginSubmit || 'Sign In')}
          </button>
        </form>

        {IS_MOCK_MODE && (
          <div className="login-page__demo-box">
            <div className="login-page__demo-title">
              {translations[lang].loginDemoTitle || 'ℹ️ Demo Sandbox Environment'}
            </div>
            <div>
              {translations[lang].loginDemoText || 'No Firebase credentials detected. Use these demo credentials to access the admin panel:'}
              <div style={{ marginTop: '6px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                Email: admin@crisismap.org<br/>
                Password: password123
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LoginPage
