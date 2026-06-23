import { Link } from 'react-router-dom'
import { translations } from '../utils/translations'
import './HomePage.css'

/**
 * HomePage - The landing page of CrisisMap
 * Features a translatable high-impact hero section, a 4-step walk-through, key app benefits, and community impact stats.
 */
function HomePage({ lang = 'en' }) {
  const steps = [
    {
      step: '01',
      icon: '📸',
      title: translations[lang].step1Title,
      desc: translations[lang].step1Desc
    },
    {
      step: '02',
      icon: '📊',
      title: translations[lang].step2Title,
      desc: translations[lang].step2Desc
    },
    {
      step: '03',
      icon: '📍',
      title: translations[lang].step3Title,
      desc: translations[lang].step3Desc
    },
    {
      step: '04',
      icon: '⚙️',
      title: translations[lang].step4Title,
      desc: translations[lang].step4Desc
    }
  ]

  const features = [
    {
      icon: '🤖',
      title: translations[lang].featAiTitle,
      desc: translations[lang].featAiDesc
    },
    {
      icon: '📴',
      title: translations[lang].featOfflineTitle,
      desc: translations[lang].featOfflineDesc
    },
    {
      icon: '🔒',
      title: translations[lang].featPrivacyTitle,
      desc: translations[lang].featPrivacyDesc
    },
    {
      icon: '📥',
      title: translations[lang].featGisTitle,
      desc: translations[lang].featGisDesc
    },
    {
      icon: '🌐',
      title: translations[lang].featStackTitle,
      desc: translations[lang].featStackDesc
    },
    {
      icon: '⚡',
      title: translations[lang].featSyncTitle,
      desc: translations[lang].featSyncDesc
    }
  ]

  const stats = [
    { value: '1,247', label: translations[lang].impactReports },
    { value: '86', label: translations[lang].impactActive },
    { value: '530', label: translations[lang].impactVerified },
    { value: '< 48h', label: translations[lang].triageTurnaround }
  ]

  return (
    <div className="homepage fade-in">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__bg" />
        <div className="hero__content">
          <div className="hero__badge">
            <span className="hero__badge-pulse"></span>
            <span>{translations[lang].activeResponse}</span>
          </div>
          <h1 className="hero__title">
            {translations[lang].homeTitle}
          </h1>
          <p className="hero__subtitle">
            {translations[lang].homeSubtitle}
          </p>
          <div className="hero__actions">
            <Link to="/report" className="btn btn-primary btn-lg">
              📸 {translations[lang].homeCTA}
            </Link>
            <Link to="/map" className="btn btn-secondary btn-lg">
              🗺️ {translations[lang].navMap}
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works container">
        <div className="section-header">
          <h2 className="section-title">{translations[lang].howItWorks}</h2>
          <p className="section-subtitle">{translations[lang].howItWorksDesc}</p>
        </div>
        <div className="how-it-works__steps">
          {steps.map((item, idx) => (
            <div key={idx} className="step-card glass-card">
              <div className="step-card__number">{item.step}</div>
              <div className="step-card__icon">{item.icon}</div>
              <h3 className="step-card__title">{item.title}</h3>
              <p className="step-card__desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Key Features Section */}
      <section className="features-section container">
        <div className="section-header">
          <h2 className="section-title">{translations[lang].keyCapabilities}</h2>
          <p className="section-subtitle">{translations[lang].keyCapabilitiesDesc}</p>
        </div>
        <div className="features-grid">
          {features.map((feat, idx) => (
            <div key={idx} className="feature-card glass-card">
              <div className="feature-card__icon">{feat.icon}</div>
              <div className="feature-card__content">
                <h3 className="feature-card__title">{feat.title}</h3>
                <p className="feature-card__desc">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="stats-section__bg" />
        <div className="container stats-container">
          <h2 className="stats-section__title" style={{ color: 'var(--color-text-primary)', marginBottom: '32px', fontFamily: 'var(--font-heading)', fontSize: '1.4rem' }}>
            📊 {translations[lang].communityImpact}
          </h2>
          <div className="stats-grid">
            {stats.map((stat, idx) => (
              <div key={idx} className="stat-item">
                <div className="stat-item__value">{stat.value}</div>
                <div className="stat-item__label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default HomePage

