import { useMemo, useState } from 'react'
import { getDamageLevel, getInfrastructureType } from '../utils/constants'
import { translations } from '../utils/translations'
import './ReportCard.css'

/**
 * Format a timestamp into a human-readable relative string ("2 hours ago").
 * Falls back to locale date string for dates older than 7 days.
 *
 * @param {string|number} timestamp - ISO string or Unix ms timestamp
 * @returns {string} Relative time string
 */
function parseDate(ts) {
  if (!ts) return new Date()
  if (ts.toDate && typeof ts.toDate === 'function') {
    return ts.toDate()
  }
  if (ts.seconds) {
    return new Date(ts.seconds * 1000)
  }
  const d = new Date(ts)
  return isNaN(d.getTime()) ? new Date() : d
}

function formatRelativeTime(timestamp, lang = 'en') {
  const now = Date.now()
  const dateObj = parseDate(timestamp)
  const then = dateObj.getTime()
  const diffMs = now - then

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) {
    return translations[lang].timeJustNow || 'Just now'
  }
  if (minutes < 60) {
    if (minutes === 1) {
      return translations[lang].timeMinAgo || '1 min ago'
    }
    return (translations[lang].timeMinsAgo || '{{count}} mins ago').replace('{{count}}', minutes)
  }
  if (hours < 24) {
    if (hours === 1) {
      return translations[lang].timeHourAgo || '1 hour ago'
    }
    return (translations[lang].timeHoursAgo || '{{count}} hours ago').replace('{{count}}', hours)
  }
  if (days < 7) {
    if (days === 1) {
      return translations[lang].timeDayAgo || '1 day ago'
    }
    return (translations[lang].timeDaysAgo || '{{count}} days ago').replace('{{count}}', days)
  }

  return dateObj.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Compact damage report card.
 * Renders inside Leaflet map popups and can be reused in list/feed views.
 */
function ReportCard({ report: propReport, reports, className = '', lang = 'en' }) {
  const [activeIdx, setActiveIdx] = useState(0)

  // Determine active report (if array is passed, select active index, else use single report prop)
  const reportList = useMemo(() => {
    if (Array.isArray(reports) && reports.length > 0) {
      return reports
    }
    return propReport ? [propReport] : []
  }, [propReport, reports])

  const report = reportList[activeIdx] || propReport

  const damage = useMemo(() => {
    if (!report) return null
    return getDamageLevel(report.damageLevel)
  }, [report])

  // Helpers to format list/array inputs
  const formatInfraType = (infraVal) => {
    if (!infraVal) return ''
    if (Array.isArray(infraVal)) {
      return infraVal.map(v => translations[lang][v] || getInfrastructureType(v)?.label || v).join(', ')
    }
    return translations[lang][infraVal] || getInfrastructureType(infraVal)?.label || infraVal
  }

  const formatCrisisNature = (crisisVal) => {
    if (!crisisVal) return ''
    if (Array.isArray(crisisVal)) {
      return crisisVal.map(v => translations[lang][`crisis${v.charAt(0).toUpperCase() + v.slice(1)}`] || v).join(', ')
    }
    return translations[lang][`crisis${crisisVal.charAt(0).toUpperCase() + crisisVal.slice(1)}`] || crisisVal
  }

  if (!report) {
    return <div className="report-card report-card--empty">No report data</div>
  }

  const relativeTime = formatRelativeTime(report.timestamp, lang)
  const collectionTime = report.collectionTimestamp ? formatRelativeTime(report.collectionTimestamp, lang) : null

  const firstPhoto = report.photos && report.photos.length > 0 ? report.photos[0] : null

  return (
    <div className={`report-card ${className}`}>
      {/* Header — damage badge */}
      <div className="report-card__header">
        <span className={`report-card__badge report-card__badge--${report.damageLevel}`}>
          {damage?.icon ?? '❓'} {translations[lang][`dmgCard${report.damageLevel.charAt(0).toUpperCase() + report.damageLevel.slice(1)}Title`] || damage?.label || report.damageLevel}
        </span>
      </div>

      {/* Infrastructure details */}
      <div className="report-card__infra">
        <span className="report-card__infra-icon">🏠</span>
        <span style={{ fontWeight: '600' }}>
          {formatInfraType(report.infrastructureType)}
          {report.infrastructureTypeOther && ` (${report.infrastructureTypeOther})`}
        </span>
      </div>

      {report.infrastructureName && (
        <div className="report-card__infra-name" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', paddingLeft: '22px', marginBottom: '8px' }}>
          <strong>Name:</strong> {report.infrastructureName}
        </div>
      )}

      {/* Crisis nature */}
      {report.crisisNature && (
        <div className="report-card__meta-row" style={{ paddingLeft: '2px', fontSize: '0.82rem' }}>
          <span className="report-card__meta-icon">🌪️</span>
          <span><strong>Nature:</strong> {formatCrisisNature(report.crisisNature)}</span>
        </div>
      )}

      {/* Debris clearing status */}
      {report.needsDebrisClearing !== null && report.needsDebrisClearing !== undefined && (
        <div className="report-card__meta-row" style={{ paddingLeft: '2px', fontSize: '0.82rem', color: report.needsDebrisClearing ? 'var(--accent-primary)' : 'inherit' }}>
          <span className="report-card__meta-icon">🪵</span>
          <span><strong>Debris:</strong> {report.needsDebrisClearing ? translations[lang].debrisClearingYes : translations[lang].debrisClearingNo}</span>
        </div>
      )}

      {/* Description */}
      <p className="report-card__description">
        {report.description || <em>{translations[lang].msgNoDescription || 'No description provided.'}</em>}
      </p>

      {/* Photo thumbnail */}
      {firstPhoto && (
        <img
          className="report-card__thumbnail"
          src={firstPhoto}
          alt="Damage report photograph"
          loading="lazy"
        />
      )}

      {/* Custom Survey optional section */}
      {report.customSurvey && Object.keys(report.customSurvey).length > 0 && (
        <div className="report-card__survey" style={{ marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', fontSize: '0.78rem' }}>
          <div style={{ fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            📋 {translations[lang].labelSurveyHeader || 'Community Survey'}
          </div>
          {report.customSurvey.livelihoodAffected && (
            <div>• Income Affected: {report.customSurvey.livelihoodAffected === 'yes' ? translations[lang].yes : translations[lang].no}</div>
          )}
          {report.customSurvey.displacedFamilies && (
            <div>• Displaced families present: {report.customSurvey.displacedFamilies === 'yes' ? translations[lang].yes : translations[lang].no}</div>
          )}
          {report.customSurvey.inaccessibleServices && report.customSurvey.inaccessibleServices.length > 0 && (
            <div>• Inaccessible services: {report.customSurvey.inaccessibleServices.join(', ')}</div>
          )}
        </div>
      )}

      {/* Meta — time + coords */}
      <div className="report-card__meta" style={{ marginTop: '10px' }}>
        <div className="report-card__meta-row">
          <span className="report-card__meta-icon">🕐</span>
          <span>Submitted: {relativeTime}</span>
        </div>
        {collectionTime && (
          <div className="report-card__meta-row">
            <span className="report-card__meta-icon">📅</span>
            <span>Collected: {collectionTime}</span>
          </div>
        )}
        <div className="report-card__meta-row">
          <span className="report-card__meta-icon">📍</span>
          <span>
            {(report.lat ?? report.latitude)?.toFixed(4)}, {(report.lng ?? report.longitude)?.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Version timeline history popup */}
      {reportList.length > 1 && (
        <div className="report-card__timeline" style={{ borderTop: '1px solid var(--border-color)', marginTop: '10px', paddingTop: '8px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--accent-primary)', marginBottom: '6px' }}>
            ⏳ Damage History ({reportList.length} updates)
          </div>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {reportList.map((r, idx) => {
              const levelMeta = getDamageLevel(r.damageLevel)
              const timeStr = formatRelativeTime(r.timestamp, lang)
              return (
                <button
                  key={r.id || idx}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    border: activeIdx === idx ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                    background: activeIdx === idx ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    minWidth: '60px',
                    flexShrink: 0
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>{levelMeta?.icon || '❓'}</span>
                  <span style={{ whiteSpace: 'nowrap', color: activeIdx === idx ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>{timeStr}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportCard
