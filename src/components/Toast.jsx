import { useEffect, useState } from 'react'
import './Toast.css'

/**
 * Toast notification component with auto-dismiss and slide animation
 */
function Toast({ message, type = 'info', onClose }) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true)
      setTimeout(onClose, 300)
    }, 3700)
    return () => clearTimeout(timer)
  }, [onClose])

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  }

  return (
    <div 
      className={`toast toast--${type} ${isExiting ? 'toast--exit' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <span className="toast__icon">{icons[type]}</span>
      <span className="toast__message">{message}</span>
      <button 
        className="toast__close" 
        onClick={() => { setIsExiting(true); setTimeout(onClose, 300) }}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  )
}

export default Toast

