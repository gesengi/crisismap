import { useState, useEffect, useMemo } from 'react'
import { Doughnut, Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler
} from 'chart.js'

import { getReports } from '../services/reportService'
import { DAMAGE_LEVELS, INFRASTRUCTURE_TYPES } from '../utils/constants'
import { translations } from '../utils/translations'
import './AnalyticsPage.css'

// Register ChartJS elements
ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler
)

// Helper: Seed mock data if localStorage is empty (ensures page has data)
const getLocalReports = () => {
  const raw = localStorage.getItem('crisismap_reports')
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

// Helper: Safe date parsing for Firestore Timestamps and ISO Strings
const parseDate = (ts) => {
  if (!ts) return new Date()
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function AnalyticsPage({ lang = 'en' }) {
  const [reports, setReports] = useState([])

  useEffect(() => {
    const loadReports = async () => {
      // Fetch reports (using mock seed fallback if needed)
      const data = await getReports()
      // If reportService is empty, get from localStorage (seeded by Map Dashboard if visited first)
      if (data.length === 0) {
        const local = getLocalReports()
        setReports(local)
      } else {
        setReports(data)
      }
    }
    loadReports()
  }, [])

  // ─── Analytics Summary Calculations ──────────────────────────────────────────
  
  // 1. Total reports
  const totalReports = reports.length

  // 2. Most affected type
  const mostAffectedLabel = useMemo(() => {
    if (reports.length === 0) return 'N/A'
    const counts = {}
    reports.forEach(r => {
      if (Array.isArray(r.infrastructureType)) {
        r.infrastructureType.forEach(type => {
          counts[type] = (counts[type] || 0) + 1
        })
      } else if (r.infrastructureType) {
        counts[r.infrastructureType] = (counts[r.infrastructureType] || 0) + 1
      }
    })
    let maxType = 'other'
    let maxVal = 0
    Object.keys(counts).forEach(type => {
      if (counts[type] > maxVal) {
        maxVal = counts[type]
        maxType = type
      }
    })
    const meta = INFRASTRUCTURE_TYPES.find(t => t.value === maxType)
    return meta ? `${meta.icon} ${translations[lang][meta.value] || meta.label}` : maxType
  }, [reports, lang])

  // 3. City Stats (Top Affected Areas)
  const cityStats = useMemo(() => {
    const cities = ['Nairobi', 'Port-au-Prince', 'Istanbul', 'Manila', 'Mexico City']
    return cities.map(city => {
      // Find reports in this city (address contains city name or lat/lng approximation)
      const cityReports = reports.filter(r => r.address && r.address.includes(city))
      const completeCount = cityReports.filter(r => r.damageLevel === 'complete' || r.damageLevel === 'destroyed').length
      const partialCount = cityReports.filter(r => r.damageLevel === 'partial' || r.damageLevel === 'major' || r.damageLevel === 'minor').length
      const total = cityReports.length
      
      let severity = 'Low'
      if (completeCount > 1 || partialCount > 2) {
        severity = 'Critical'
      } else if (partialCount > 0 || completeCount > 0) {
        severity = 'High'
      } else if (total > 0) {
        severity = 'Moderate'
      }

      return {
        name: city,
        total,
        completeCount,
        severity,
        lastReport: cityReports.length > 0 ? parseDate(cityReports[0].timestamp).toLocaleDateString() : 'N/A'
      }
    }).sort((a, b) => b.total - a.total)
  }, [reports])

  // 4. Critical areas count (cities with 'Critical' status)
  const criticalAreasCount = useMemo(() => {
    return cityStats.filter(c => c.severity === 'Critical' || c.severity === 'High').length
  }, [cityStats])

  // ─── Chart Data Configurations ──────────────────────────────────────────────
  
  // 1. Doughnut Chart: Damage level distribution
  const doughnutData = useMemo(() => {
    const counts = { minimal: 0, partial: 0, complete: 0 }
    reports.forEach(r => {
      let lvl = r.damageLevel
      // Map legacy levels if present
      if (lvl === 'none') lvl = 'minimal'
      if (lvl === 'minor' || lvl === 'major') lvl = 'partial'
      if (lvl === 'destroyed') lvl = 'complete'

      if (counts[lvl] !== undefined) {
        counts[lvl]++
      }
    })

    return {
      labels: DAMAGE_LEVELS.map(l => translations[lang][`dmgCard${l.value.charAt(0).toUpperCase() + l.value.slice(1)}Title`] || l.label),
      datasets: [{
        data: DAMAGE_LEVELS.map(l => counts[l.value] || 0),
        backgroundColor: DAMAGE_LEVELS.map(l => l.color),
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 2,
        hoverOffset: 4
      }]
    }
  }, [reports, lang])

  // 2. Bar Chart: Reports by Infrastructure Type
  const barData = useMemo(() => {
    const counts = {}
    INFRASTRUCTURE_TYPES.forEach(t => { counts[t.value] = 0 })
    reports.forEach(r => {
      if (Array.isArray(r.infrastructureType)) {
        r.infrastructureType.forEach(type => {
          if (counts[type] !== undefined) {
            counts[type]++
          }
        })
      } else if (r.infrastructureType !== undefined) {
        if (counts[r.infrastructureType] !== undefined) {
          counts[r.infrastructureType]++
        }
      }
    })

    return {
      labels: INFRASTRUCTURE_TYPES.map(t => translations[lang][t.value] || t.label),
      datasets: [{
        label: translations[lang].analyticsReportsCount || 'Reports Count',
        data: INFRASTRUCTURE_TYPES.map(t => counts[t.value] || 0),
        backgroundColor: 'rgba(170, 59, 255, 0.45)',
        borderColor: 'rgba(170, 59, 255, 1)',
        borderWidth: 1.5,
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(170, 59, 255, 0.7)'
      }]
    }
  }, [reports, lang])

  // 3. Line Chart: Reports over the last 7 days
  const lineData = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - i)
      return d.toISOString().split('T')[0]
    }).reverse()

    const dailyCounts = dates.map(dateStr => {
      return reports.filter(r => {
        const d = parseDate(r.timestamp)
        return !isNaN(d.getTime()) && d.toISOString().split('T')[0] === dateStr
      }).length
    })

    // Format labels for readable display ("Jun 18")
    const formattedLabels = dates.map(d => {
      const [year, month, day] = d.split('-')
      const dateObj = new Date(year, month - 1, day)
      return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    })

    return {
      labels: formattedLabels,
      datasets: [{
        label: translations[lang].analyticsNewReports || 'New Reports',
        data: dailyCounts,
        fill: true,
        backgroundColor: 'rgba(192, 132, 252, 0.15)',
        borderColor: '#c084fc',
        borderWidth: 3,
        pointBackgroundColor: '#c084fc',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3
      }]
    }
  }, [reports, lang])

  // Chart layout customization options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#9ca3af',
          font: { family: 'Inter', size: 11, weight: '500' },
          padding: 15
        }
      },
      tooltip: {
        padding: 12,
        bodyFont: { family: 'Inter' },
        titleFont: { family: 'Outfit', weight: '700' }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#9ca3af', font: { family: 'Inter' } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#9ca3af', font: { family: 'Inter' }, stepSize: 1 }
      }
    }
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#9ca3af',
          font: { family: 'Inter', size: 11, weight: '500' },
          boxWidth: 12,
          padding: 12
        }
      }
    }
  }

  return (
    <div className="analytics-page fade-in">
      <div className="analytics-page__header">
        <h1 className="analytics-page__title">{translations[lang].analyticsTitle || 'Crisis Analytics Dashboard'}</h1>
        <p className="analytics-page__subtitle">
          {translations[lang].analyticsSubtitle || 'Real-time aggregated insights from community damage reports.'}
        </p>
      </div>

      {/* Summary Cards Row */}
      <div className="analytics-page__stats-grid">
        <div className="stat-card glass-panel">
          <div className="stat-card__icon-wrap">📊</div>
          <div className="stat-card__info">
            <span className="stat-card__value">{totalReports}</span>
            <span className="stat-card__label">{translations[lang].analyticsTotalReports || 'Total Reports'}</span>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-card__icon-wrap">⚠️</div>
          <div className="stat-card__info">
            <span className="stat-card__value">{criticalAreasCount}</span>
            <span className="stat-card__label">{translations[lang].analyticsCriticalZones || 'Critical Zones'}</span>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-card__icon-wrap">🏢</div>
          <div className="stat-card__info">
            <span className="stat-card__value" style={{ fontSize: '1.25rem', fontWeight: '700' }}>
              {mostAffectedLabel}
            </span>
            <span className="stat-card__label">{translations[lang].analyticsMostAffected || 'Most Affected'}</span>
          </div>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-card__icon-wrap">⏱️</div>
          <div className="stat-card__info">
            <span className="stat-card__value">&lt; 48h</span>
            <span className="stat-card__label">{translations[lang].analyticsResponseTime || 'Response Time'}</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="analytics-page__charts-grid">
        {/* Doughnut: Severity Distribution */}
        <div className="chart-card glass-panel">
          <h2 className="chart-card__title">{translations[lang].analyticsDmgDist || 'Damage Severity Distribution'}</h2>
          <div className="chart-card__body">
            {totalReports > 0 ? (
              <Doughnut data={doughnutData} options={doughnutOptions} />
            ) : (
              <p style={{ color: 'var(--text-tertiary)' }}>{translations[lang].analyticsNoData || 'No report data available.'}</p>
            )}
          </div>
        </div>

        {/* Bar: Reports by Infrastructure Type */}
        <div className="chart-card glass-panel">
          <h2 className="chart-card__title">{translations[lang].analyticsInfraDist || 'Reports by Infrastructure Type'}</h2>
          <div className="chart-card__body">
            {totalReports > 0 ? (
              <Bar data={barData} options={chartOptions} />
            ) : (
              <p style={{ color: 'var(--text-tertiary)' }}>{translations[lang].analyticsNoData || 'No report data available.'}</p>
            )}
          </div>
        </div>

        {/* Line: Daily Activity Trend */}
        <div className="chart-card glass-panel">
          <h2 className="chart-card__title">{translations[lang].analyticsTrend || '7-Day Submission Trend'}</h2>
          <div className="chart-card__body">
            {totalReports > 0 ? (
              <Line data={lineData} options={chartOptions} />
            ) : (
              <p style={{ color: 'var(--text-tertiary)' }}>{translations[lang].analyticsNoData || 'No report data available.'}</p>
            )}
          </div>
        </div>
      </div>

      {/* Top Affected Areas Table */}
      <div className="analytics-page__table-card glass-panel">
        <h2 className="analytics-page__table-title">{translations[lang].analyticsZonesSummary || 'Affected Zones Summary'}</h2>
        <div className="table-responsive">
          <table className="glass-table">
            <thead>
              <tr>
                <th>{translations[lang].analyticsColLocation || 'Location'}</th>
                <th>{translations[lang].analyticsColCount || 'Reports Count'}</th>
                <th>{translations[lang].analyticsColSeverity || 'Severity'}</th>
                <th>{translations[lang].analyticsColLast || 'Last Report'}</th>
              </tr>
            </thead>
            <tbody>
              {cityStats.map(city => {
                let badgeColor = 'rgba(34, 197, 94, 0.15)'
                let textColor = '#22c55e'
                if (city.severity === 'Critical') {
                  badgeColor = 'rgba(239, 68, 68, 0.15)'
                  textColor = '#ef4444'
                } else if (city.severity === 'High') {
                  badgeColor = 'rgba(249, 115, 22, 0.15)'
                  textColor = '#f97316'
                } else if (city.severity === 'Moderate') {
                  badgeColor = 'rgba(245, 158, 11, 0.15)'
                  textColor = '#f59e0b'
                }

                return (
                  <tr key={city.name}>
                    <td style={{ fontWeight: '600' }}>📍 {city.name}</td>
                    <td>{city.total}</td>
                    <td>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        backgroundColor: badgeColor,
                        color: textColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}>
                        {city.severity === 'Critical' 
                          ? (translations[lang].analyticsCritical || 'Critical') 
                          : city.severity === 'High' 
                          ? (translations[lang].analyticsHigh || 'High') 
                          : city.severity === 'Moderate' 
                          ? (translations[lang].analyticsModerate || 'Moderate') 
                          : (translations[lang].analyticsLow || 'Low')}
                      </span>
                    </td>
                    <td>{city.lastReport}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default AnalyticsPage
