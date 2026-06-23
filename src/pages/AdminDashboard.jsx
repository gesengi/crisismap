import { useState, useEffect, useRef, useMemo } from 'react'
import { subscribeToReports, updateReport, deleteReport, translateText } from '../services/reportService'
import { getDamageLevel, getInfrastructureType, DAMAGE_LEVELS } from '../utils/constants'
import { translations } from '../utils/translations'
import { getReportRegion } from '../utils/mockFootprints'
import AnalyticsPage from './AnalyticsPage.jsx'
import ExportPage from './ExportPage.jsx'
import { trainLocalModel, resetLocalModel, isLocalModelActive } from '../services/aiClassifier'
import './AdminDashboard.css'

// Helper: Safe date parsing for Firestore Timestamps and ISO Strings
const parseDate = (ts) => {
  if (!ts) return new Date()
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

// Helper: Haversine distance calculation in meters
const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return Infinity
  const R = 6371e3 // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // in meters
}

function AdminDashboard({ showToast, lang = 'en' }) {
  const [reports, setReports] = useState([])
  const [activeTab, setActiveTab] = useState('queue') // 'queue' | 'analytics' | 'export' | 'tuning' | 'overrides'
  const [filterStatus, setFilterStatus] = useState('all') // 'all' | 'pending' | 'verified' | 'flagged'
  const [selectedRegion, setSelectedRegion] = useState('all')
  const [translatedDescriptions, setTranslatedDescriptions] = useState({})

  const availableRegions = useMemo(() => {
    const regionsSet = new Set()
    reports.forEach(report => {
      regionsSet.add(getReportRegion(report))
    })
    return Array.from(regionsSet).sort()
  }, [reports])

  // - Tuning states -
  const [isTuned, setIsTuned] = useState(false)
  const [trainingStatus, setTrainingStatus] = useState('idle') // 'idle' | 'training' | 'success' | 'error'
  const [trainingLogs, setTrainingLogs] = useState([])
  const [tuneFiles, setTuneFiles] = useState({
    minimal: [],
    partial: [],
    complete: []
  })

  // - ZIP Exporter state -
  const [exportCategoryFilter, setExportCategoryFilter] = useState('all') // 'all' | 'minimal' | 'partial' | 'complete'
  const [isExportingZip, setIsExportingZip] = useState(false)

  const trainingConsoleRef = useRef(null)

  // Subscribe to real-time report database updates
  useEffect(() => {
    const unsubscribe = subscribeToReports((data) => {
      setReports(data)
    })
    return () => unsubscribe()
  }, [])

  // Check if custom model is active on mount
  useEffect(() => {
    isLocalModelActive().then(setIsTuned)
  }, [])

  // Auto-scroll training logs console
  useEffect(() => {
    if (trainingConsoleRef.current) {
      trainingConsoleRef.current.scrollTop = trainingConsoleRef.current.scrollHeight
    }
  }, [trainingLogs])

  // - Verification / Vetting Handlers -
  const handleVerify = async (id) => {
    try {
      await updateReport(id, { status: 'verified' })
      showToast(translations[lang].msgVerified || 'Report verified!', 'success')
    } catch (err) {
      console.error('[Admin] Verification failed:', err)
      showToast(translations[lang].errVerifyFailed || 'Failed to verify report.', 'error')
    }
  }

  const handleFlag = async (id) => {
    try {
      await updateReport(id, { status: 'flagged' })
      showToast(translations[lang].msgFlagged || 'Report marked as Flagged/Archived.', 'warning')
    } catch (err) {
      console.error('[Admin] Flagging failed:', err)
      showToast(translations[lang].errFlagFailed || 'Failed to flag report.', 'error')
    }
  }

  const handleDelete = async (id) => {
    const confirmMsg = translations[lang].confirmDelete || 'Are you sure you want to permanently delete this report?'
    if (window.confirm(confirmMsg)) {
      try {
        await deleteReport(id)
        showToast(translations[lang].msgDeleted || 'Report permanently deleted.', 'success')
      } catch (err) {
        console.error('[Admin] Deletion failed:', err)
        showToast(translations[lang].errDeleteFailed || 'Failed to delete report.', 'error')
      }
    }
  }

  const handleUpdateSeverity = async (id, newSeverity, aiSuggestion) => {
    try {
      let userChoice = null
      if (aiSuggestion) {
        userChoice = newSeverity === aiSuggestion ? 'ai_accepted' : 'user_override'
      } else {
        userChoice = 'user_override'
      }
      await updateReport(id, { damageLevel: newSeverity, userChoice })
      showToast(translations[lang].msgSeverityUpdated || 'Severity level updated successfully!', 'success')
    } catch (err) {
      console.error('[Admin] Severity update failed:', err)
      showToast(translations[lang].errSeverityUpdateFailed || 'Failed to update severity.', 'error')
    }
  }

  const handleTranslateDescription = async (id, text) => {
    if (!text || !text.trim()) return

    if (translatedDescriptions[id]) {
      setTranslatedDescriptions(prev => ({
        ...prev,
        [id]: {
          ...prev[id],
          active: !prev[id].active
        }
      }))
      return
    }

    setTranslatedDescriptions(prev => ({
      ...prev,
      [id]: { text: '', loading: true, active: true }
    }))

    try {
      const translated = await translateText(text, lang)
      setTranslatedDescriptions(prev => ({
        ...prev,
        [id]: { text: translated, loading: false, active: true }
      }))
    } catch (err) {
      console.error('[Admin] Translation failed:', err)
      showToast('Translation failed.', 'error')
      setTranslatedDescriptions(prev => ({
        ...prev,
        [id]: { text: '', loading: false, active: false }
      }))
    }
  }

  // - Local Model Training Handlers -
  const handleFileChange = (label, files) => {
    setTuneFiles(prev => ({
      ...prev,
      [label]: Array.from(files)
    }))
  }

  const handleTrainModel = async () => {
    const dataset = []
    Object.keys(tuneFiles).forEach(label => {
      tuneFiles[label].forEach(file => {
        dataset.push({ file, label })
      })
    })

    const totalFiles = dataset.length
    if (totalFiles < 4) {
      showToast(translations[lang].errTuningMinFiles || 'Please upload at least 4 total files (ideally 2+ per category) to begin training.', 'warning')
      return
    }

    setTrainingStatus('training')
    setTrainingLogs([
      translations[lang].logCompiling || `[SYSTEM] Starting compilation for on-device training...`,
      (translations[lang].logCollected || `[DATASET] Collected {{count}} local samples.`).replace('{{count}}', totalFiles),
      translations[lang].logLockingCpu || `[SYSTEM] Locking CPU threads and opening WebGL channels...`
    ])

    try {
      await trainLocalModel(dataset, (epoch, loss, acc) => {
        setTrainingLogs(prev => [
          ...prev,
          `Epoch ${epoch}/30 - Loss: ${loss.toFixed(4)} - Accuracy: ${Math.round(acc * 100)}%`
        ])
      })
      setIsTuned(true)
      setTrainingStatus('success')
      showToast(translations[lang].msgTunedSuccess || 'On-device AI custom model trained successfully!', 'success')
    } catch (err) {
      console.error('[Tuning] Custom training failed:', err)
      setTrainingLogs(prev => [...prev, `❌ [ERROR] ${translations[lang].trainingLogsCrashed || 'Training crashed'}: ${err.message}`])
      setTrainingStatus('error')
      showToast(translations[lang].errTuningFailed || 'Training failed. Check console logs.', 'error')
    }
  }

  const handleResetTuning = async () => {
    const confirmMsg = translations[lang].confirmClearWeights || 'Are you sure you want to delete the custom model weights? This will restore the default AI system.'
    if (window.confirm(confirmMsg)) {
      const success = await resetLocalModel()
      if (success) {
        setIsTuned(false)
        setTrainingStatus('idle')
        setTuneFiles({ none: [], minor: [], major: [], destroyed: [] })
        showToast(translations[lang].msgWeightsCleared || 'Local custom weights cleared. Default AI active.', 'info')
      } else {
        showToast(translations[lang].msgNoWeightsFound || 'No local model weights were found to delete.', 'warning')
      }
    }
  }

  // - Training Dataset Export Handler -
  const handleExportZip = async () => {
    let overrides = reports.filter(r => r.userChoice === 'user_override')
    if (exportCategoryFilter !== 'all') {
      overrides = overrides.filter(r => r.damageLevel === exportCategoryFilter)
    }

    if (overrides.length === 0) {
      showToast(translations[lang].msgNoOverridesExport || 'No human-in-the-loop overrides found to export.', 'warning')
      return
    }

    setIsExportingZip(true)
    showToast(translations[lang].msgZipStarting || 'Starting ZIP compilation. Fetching photos...', 'info')

    try {
      const JSZipModule = await import('jszip')
      const JSZip = JSZipModule.default || JSZipModule
      const zip = new JSZip()

      let filesAddedCount = 0
      for (const report of overrides) {
        if (!report.photos || report.photos.length === 0) continue

        for (let idx = 0; idx < report.photos.length; idx++) {
          const photo = report.photos[idx]
          const filename = `${report.damageLevel}/${report.id}_${idx}.jpg`

          if (photo.startsWith('data:image/')) {
            // base64 url
            const base64Data = photo.split(',')[1]
            zip.file(filename, base64Data, { base64: true })
            filesAddedCount++
          } else if (photo.startsWith('http')) {
            // live url - fetch blob
            try {
              const res = await fetch(photo)
              const blob = await res.blob()
              zip.file(filename, blob)
              filesAddedCount++
            } catch (fetchErr) {
              console.warn(`[ZIP] Failed to fetch photo ${photo}:`, fetchErr)
            }
          }
        }
      }

      if (filesAddedCount === 0) {
        showToast(translations[lang].errZipNoImages || 'No valid photos were found inside the selected overrides to compile.', 'warning')
        setIsExportingZip(false)
        return
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const FileSaverModule = await import('file-saver')
      const FileSaver = FileSaverModule.default || FileSaverModule

      FileSaver.saveAs(content, `crisismap_active_learning_dataset_${exportCategoryFilter}_${Date.now()}.zip`)
      showToast(translations[lang].msgZipSuccess || 'Training dataset ZIP exported successfully!', 'success')
    } catch (err) {
      console.error('[ZIP] Failed to export ZIP:', err)
      showToast(translations[lang].errZipFailed || 'ZIP compilation failed.', 'error')
    } finally {
      setIsExportingZip(false)
    }
  }

  // - Auto-Feed Overrides to Local AI Tuning Directly -
  const handleAutoFeedTraining = async () => {
    const overrides = reports.filter(r => r.userChoice === 'user_override')
    if (overrides.length === 0) {
      showToast(translations[lang].msgNoOverridesFeed || 'No overrides found in database to feed training.', 'warning')
      return
    }

    const dataset = []
    overrides.forEach(report => {
      if (report.photos && report.photos.length > 0) {
        dataset.push({
          file: report.photos[0],
          label: report.damageLevel
        })
      }
    })

    if (dataset.length === 0) {
      showToast(translations[lang].msgNoPhotosFeed || 'No training photos found in the overrides dataset.', 'warning')
      return
    }

    setTrainingStatus('training')
    setTrainingLogs([
      translations[lang].logFeedStarting || `[SYSTEM] Starting active learning compiler pipeline...`,
      (translations[lang].logFeedAutoFed || `[DATASET] Auto-fed {{count}} corrected overrides from database.`).replace('{{count}}', dataset.length),
      translations[lang].logFeedLocking || `[SYSTEM] Locking GPU channels and loading neural head...`
    ])

    try {
      await trainLocalModel(dataset, (epoch, loss, acc) => {
        setTrainingLogs(prev => [
          ...prev,
          `Epoch ${epoch}/30 - Loss: ${loss.toFixed(4)} - Accuracy: ${Math.round(acc * 100)}%`
        ])
      })
      setIsTuned(true)
      setTrainingStatus('success')
      showToast(translations[lang].msgFeedSuccess || 'Local custom model successfully auto-trained on overrides!', 'success')
    } catch (err) {
      console.error('[Tuning] Auto-feed training failed:', err)
      setTrainingLogs(prev => [...prev, `❌ [ERROR] ${translations[lang].trainingLogsCrashed || 'Training crashed'}: ${err.message}`])
      setTrainingStatus('error')
      showToast(translations[lang].errFeedFailed || 'Auto-feed training failed.', 'error')
    }
  }

  // Map a useMemo on reports to flag duplicate submissions within 100 meters and 24 hours.
  const processedReports = useMemo(() => {
    return reports.map(r1 => {
      const date1 = parseDate(r1.timestamp)
      
      const duplicateOf = reports.find(r2 => {
        if (r1.id === r2.id) return false
        if (r1.infrastructureType !== r2.infrastructureType) return false
        
        const date2 = parseDate(r2.timestamp)
        const timeDiff = Math.abs(date1.getTime() - date2.getTime())
        if (timeDiff > 24 * 60 * 60 * 1000) return false // > 24 hours
        
        const dist = getDistanceInMeters(r1.latitude, r1.longitude, r2.latitude, r2.longitude)
        if (dist > 100) return false // > 100 meters
        
        // Flag the subsequent (newer) report as the potential duplicate of the older one
        return date2 < date1 || (date2.getTime() === date1.getTime() && r2.id < r1.id)
      })

      return {
        ...r1,
        isPotentialDuplicate: !!duplicateOf,
        duplicateRefId: duplicateOf ? duplicateOf.id : null
      }
    })
  }, [reports])

  // - Vetting Queue Filtering -
  const filteredQueueReports = processedReports.filter(report => {
    const status = report.status || 'pending'
    if (filterStatus !== 'all' && status !== filterStatus) return false
    if (selectedRegion !== 'all' && getReportRegion(report) !== selectedRegion) return false
    return true
  })

  const overrideReports = processedReports.filter(r => r.userChoice === 'user_override')

  return (
    <div className="admin-dashboard fade-in">
      <div className="admin-dashboard__header">
        <h1 className="admin-dashboard__title">{translations[lang].adminTitle}</h1>
        <p className="admin-dashboard__subtitle">
          {translations[lang].adminSubtitle}
        </p>
      </div>

      {/* Mobile Notice Bar */}
      <div className="admin-mobile-notice glass-panel">
        <span className="admin-mobile-notice__icon">📱</span>
        <span className="admin-mobile-notice__text">
          {translations[lang].mobileNotice}
        </span>
      </div>

      {/* Tabs Menu */}
      <nav className="admin-dashboard__tabs" role="navigation" aria-label="Dashboard navigation">
        <button 
          className={`admin-dashboard__tab-btn ${activeTab === 'queue' ? 'admin-dashboard__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          📥 {translations[lang].tabQueue} ({reports.filter(r => (r.status || 'pending') === 'pending').length} {translations[lang].pendingCount})
        </button>
        <button 
          className={`admin-dashboard__tab-btn ${activeTab === 'analytics' ? 'admin-dashboard__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          📊 {translations[lang].tabAnalytics}
        </button>
        <button 
          className={`admin-dashboard__tab-btn ${activeTab === 'tuning' ? 'admin-dashboard__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('tuning')}
        >
          🤖 {translations[lang].tabTuning} {isTuned && '🟢'}
        </button>
        <button 
          className={`admin-dashboard__tab-btn ${activeTab === 'overrides' ? 'admin-dashboard__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('overrides')}
        >
          🔄 {translations[lang].tabOverrides} ({overrideReports.length})
        </button>
        <button 
          className={`admin-dashboard__tab-btn ${activeTab === 'export' ? 'admin-dashboard__tab-btn--active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          📥 {translations[lang].tabGisExport}
        </button>
      </nav>

      {/* Dashboard View Routing */}
      <div className="admin-dashboard__content">
        
        {/* Vetting Queue */}
        {activeTab === 'queue' && (
          <div className="vetting-queue">
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className={`btn btn-sm ${filterStatus === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilterStatus('all')}
                >
                  {translations[lang].allReports} ({reports.length})
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${filterStatus === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilterStatus('pending')}
                >
                  📥 {translations[lang].btnPending} ({reports.filter(r => (r.status || 'pending') === 'pending').length})
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${filterStatus === 'verified' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilterStatus('verified')}
                >
                  ✅ {translations[lang].btnVerified} ({reports.filter(r => r.status === 'verified').length})
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${filterStatus === 'flagged' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilterStatus('flagged')}
                >
                  ⚠️ {translations[lang].btnFlagged} ({reports.filter(r => r.status === 'flagged').length})
                </button>
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="admin-filter-region" style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  📍 {lang === 'es' ? 'Región:' : lang === 'fr' ? 'Région:' : 'Region:'}
                </label>
                <select
                  id="admin-filter-region"
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md, 6px)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">{lang === 'es' ? 'Todas' : lang === 'fr' ? 'Toutes' : 'All Regions'}</option>
                  {availableRegions.map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="vetting-list">
              {filteredQueueReports.length > 0 ? (
                filteredQueueReports.map((report) => {
                  const damage = getDamageLevel(report.damageLevel)
                  const infra = getInfrastructureType(report.infrastructureType)
                  const status = report.status || 'pending'
                  const firstPhoto = report.photos && report.photos.length > 0 ? report.photos[0] : null
                  
                  const isHitlAvailable = Boolean(report.aiSuggestion)
                  const isHitlMatched = isHitlAvailable && (report.damageLevel === report.aiSuggestion)
                  const aiSuggestedMeta = isHitlAvailable ? getDamageLevel(report.aiSuggestion) : null

                  return (
                    <div key={report.id} className="vetting-card glass-panel">
                      <div className="vetting-card__photo-container">
                        {firstPhoto ? (
                          <img src={firstPhoto} alt="Damage evidence thumbnail" className="vetting-card__photo" />
                        ) : (
                          <div className="vetting-card__photo-placeholder">📸</div>
                        )}
                      </div>

                      <div className="vetting-card__details">
                        <div className="vetting-card__top">
                          <div className="vetting-card__meta-row">
                            <div className="vetting-card__badge-row">
                              {/* Dynamic Severity Modification Dropdown */}
                              <select
                                value={report.damageLevel}
                                onChange={(e) => handleUpdateSeverity(report.id, e.target.value, report.aiSuggestion)}
                                style={{
                                  padding: '4px 24px 4px 10px',
                                  borderRadius: '999px',
                                  fontSize: '0.72rem',
                                  fontWeight: '700',
                                  color: '#fff',
                                  backgroundColor: damage?.color || '#6b7280',
                                  border: 'none',
                                  cursor: 'pointer',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  appearance: 'none',
                                  WebkitAppearance: 'none',
                                  backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'8\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'3\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
                                  backgroundRepeat: 'no-repeat',
                                  backgroundPosition: 'right 8px center',
                                  backgroundSize: '10px'
                                }}
                              >
                                {DAMAGE_LEVELS.map(level => (
                                  <option key={level.value} value={level.value} style={{ backgroundColor: '#1e293b', color: '#fff' }}>
                                    {level.icon} {translations[lang][`dmgCard${level.value.charAt(0).toUpperCase() + level.value.slice(1)}Title`] || level.label}
                                  </option>
                                ))}
                              </select>
                              
                              <span className={`vetting-card__status-badge vetting-card__status-badge--${status}`}>
                                {status === 'pending' ? `📥 ${translations[lang].btnPending}` : status === 'verified' ? `✅ ${translations[lang].btnVerified}` : `⚠️ ${translations[lang].btnFlagged}`}
                              </span>

                              {report.isCloudValidated ? (
                                <span className={`vetting-card__cloud-badge vetting-card__cloud-badge--${report.isAutoVerified ? 'verified' : 'mismatch'}`}>
                                  {report.isAutoVerified 
                                    ? `✅ ${translations[lang].autoVerified}` 
                                    : `⚠️ ${translations[lang].mismatch} (Cloud: ${getDamageLevel(report.cloudSuggestedSeverity)?.label || report.cloudSuggestedSeverity})`
                                  }
                                </span>
                              ) : (
                                <span className="vetting-card__cloud-badge vetting-card__cloud-badge--pending">
                                  ⏳ {translations[lang].pending}
                                </span>
                              )}
                            </div>
                            <span className="vetting-card__time">
                              🕒 {parseDate(report.timestamp).toLocaleString()}
                            </span>
                          </div>

                          {report.isPotentialDuplicate && (
                            <div className="vetting-card__duplicate-banner">
                              ⚠️ {translations[lang].duplicateBanner.replace('{{id}}', report.duplicateRefId?.substring(0, 8))}
                            </div>
                          )}

                          <div className="vetting-card__description-container">
                            <p className="vetting-card__description">
                              {translatedDescriptions[report.id]?.active && !translatedDescriptions[report.id]?.loading ? (
                                <span>🌐 <em>{translatedDescriptions[report.id].text}</em></span>
                              ) : (
                                report.description || <em>{translations[lang].msgNoDescription || 'No description provided.'}</em>
                              )}
                            </p>
                            {report.description && (
                              <button
                                type="button"
                                className="btn-link vetting-card__translate-btn"
                                onClick={() => handleTranslateDescription(report.id, report.description)}
                                style={{ fontSize: '0.72rem', background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '0', marginTop: '2px', display: 'block' }}
                              >
                                {translatedDescriptions[report.id]?.loading ? (
                                  translations[lang].translating || 'Translating... ⏳'
                                ) : translatedDescriptions[report.id]?.active ? (
                                  translations[lang].showOriginal || 'Show Original ↩️'
                                ) : (
                                  translations[lang].translateBtn || 'Translate 🌐'
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="vetting-card__info-table">
                          {report.infrastructureName && (
                            <div className="vetting-card__info-item" style={{ gridColumn: 'span 2' }}>
                              <div className="vetting-card__info-label">{translations[lang].labelInfraName}</div>
                              <div className="vetting-card__info-value">{report.infrastructureName}</div>
                            </div>
                          )}
                          <div className="vetting-card__info-item">
                            <div className="vetting-card__info-label">{translations[lang].infraLabel}</div>
                            <div className="vetting-card__info-value">
                              {Array.isArray(report.infrastructureType)
                                ? report.infrastructureType.map(t => (getInfrastructureType(t)?.icon || '🏢') + ' ' + (translations[lang][t] || t)).join(', ')
                                : (infra?.icon || '🏢') + ' ' + (translations[lang][report.infrastructureType] || report.infrastructureType)
                              }
                              {report.infrastructureTypeOther && ` (${report.infrastructureTypeOther})`}
                            </div>
                          </div>
                          <div className="vetting-card__info-item">
                            <div className="vetting-card__info-label">{translations[lang].infoCoords}</div>
                            <div className="vetting-card__info-value" style={{ fontFamily: 'monospace' }}>
                              {report.latitude?.toFixed(5)}, {report.longitude?.toFixed(5)}
                            </div>
                          </div>
                          {report.crisisNature && (
                            <div className="vetting-card__info-item">
                              <div className="vetting-card__info-label">{translations[lang].labelCrisisNature}</div>
                              <div className="vetting-card__info-value">
                                {Array.isArray(report.crisisNature)
                                  ? report.crisisNature.map(n => translations[lang][`crisis${n.charAt(0).toUpperCase() + n.slice(1)}`] || n).join(', ')
                                  : (translations[lang][`crisis${report.crisisNature.charAt(0).toUpperCase() + report.crisisNature.slice(1)}`] || report.crisisNature)
                                }
                              </div>
                            </div>
                          )}
                          {report.needsDebrisClearing !== null && report.needsDebrisClearing !== undefined && (
                            <div className="vetting-card__info-item">
                              <div className="vetting-card__info-label">{translations[lang].labelDebrisClearing}</div>
                              <div className="vetting-card__info-value">
                                {report.needsDebrisClearing ? `⚠️ ${translations[lang].lblYes || 'Yes'}` : `✅ ${translations[lang].lblNo || 'No'}`}
                              </div>
                            </div>
                          )}
                          <div className="vetting-card__info-item" style={{ gridColumn: 'span 2' }}>
                            <div className="vetting-card__info-label">{translations[lang].infoAddress}</div>
                            <div className="vetting-card__info-value">{report.address}</div>
                          </div>
                          
                          {report.landmarkDescription && (
                            <div className="vetting-card__info-item" style={{ gridColumn: 'span 2' }}>
                              <div className="vetting-card__info-label">{translations[lang].infoLandmark}</div>
                              <div className="vetting-card__info-value">{report.landmarkDescription}</div>
                            </div>
                          )}
                          
                          {isHitlAvailable && (
                            <div className="vetting-card__info-item" style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                              <div className="vetting-card__info-label">{translations[lang].hitlLabel}</div>
                              <div className={`vetting-card__hitl ${isHitlMatched ? 'vetting-card__hitl--match' : 'vetting-card__hitl--override'}`}>
                                <span>🤖</span>
                                <span>
                                  {isHitlMatched 
                                    ? translations[lang].hitlMatched.replace('{{ai}}', aiSuggestedMeta?.label).replace('{{choice}}', report.userChoice)
                                    : translations[lang].hitlOverride.replace('{{ai}}', aiSuggestedMeta?.label).replace('{{user}}', damage?.label).replace('{{choice}}', report.userChoice)
                                  }
                                </span>
                              </div>
                            </div>
                          )}

                          {report.isCloudValidated && (
                            <div className="vetting-card__info-item" style={{ gridColumn: 'span 2', marginTop: '6px' }}>
                              <div className="vetting-card__info-label">{translations[lang].cloudAiTitle}</div>
                              <div className="vetting-card__cloud-analysis">
                                <div className="vetting-card__cloud-header">
                                  <span>✨ {translations[lang].cloudConfidence}: <strong>{Math.round((report.cloudConfidence || 0) * 100)}%</strong></span>
                                  <span>{translations[lang].cloudSuggested}: <strong>{getDamageLevel(report.cloudSuggestedSeverity)?.label || report.cloudSuggestedSeverity}</strong></span>
                                </div>
                                <p className="vetting-card__cloud-reason">"{report.cloudAnalysisReason}"</p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="vetting-card__actions">
                          <button 
                            type="button" 
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(report.id)}
                          >
                            {translations[lang].btnDelete} 🗑️
                          </button>
                          {status !== 'flagged' && (
                            <button 
                              type="button" 
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleFlag(report.id)}
                            >
                              {translations[lang].btnFlag} ⚠️
                            </button>
                          )}
                          {status !== 'verified' && (
                            <button 
                              type="button" 
                              className="btn btn-primary btn-sm"
                              onClick={() => handleVerify(report.id)}
                            >
                              {translations[lang].btnVerify} ✅
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)' }}>
                  {translations[lang].noReportsFilter}
                </div>
              )}
            </div>
          </div>
        )}

        {/* System Analytics */}
        {activeTab === 'analytics' && <AnalyticsPage lang={lang} />}

        {/* AI Model Tuning Tab */}
        {activeTab === 'tuning' && (
          <div className="tuning-panel glass-card fade-in">
            <div className="tuning-panel__header">
              <span className="tuning-panel__badge">{translations[lang].trlBadge}</span>
              <h2 className="tuning-panel__title">{translations[lang].tuningTitle}</h2>
              <p className="tuning-panel__subtitle">
                {translations[lang].tuningSubtitle}
              </p>
            </div>

            {/* Status Banner */}
            <div className={`tuning-status-banner banner--${isTuned ? 'active' : 'inactive'}`}>
              <span className="tuning-status-banner__icon">{isTuned ? '🟢' : '⚪'}</span>
              <div>
                <strong>{isTuned ? translations[lang].modelActive : translations[lang].modelInactive}</strong>
                <p>{isTuned 
                  ? translations[lang].modelActiveDesc 
                  : translations[lang].modelInactiveDesc}
                </p>
              </div>
              {isTuned && (
                <button type="button" className="btn btn-secondary btn-xs" onClick={handleResetTuning}>
                  🗑️ {translations[lang].btnClearWeights}
                </button>
              )}
            </div>

            <div className="tuning-grid">
              {/* Image Upload Inputs */}
              <div className="tuning-upload-column">
                <h3 className="tuning-section-title">{translations[lang].tuningStep1}</h3>
                <p className="tuning-section-subtitle">{translations[lang].tuningStep1Desc}</p>
                
                <div className="tuning-upload-list">
                  {/* Category Card: Minimal */}
                  <div className="tuning-upload-card">
                    <div className="tuning-upload-info">
                      <span className="tuning-category-icon">🟢</span>
                      <div>
                        <div className="tuning-category-label">{translations[lang].categoryMinimal || 'Minimal / No Damage'}</div>
                        <div className="tuning-category-desc">{tuneFiles.minimal.length} {translations[lang].filesSelectedCount}</div>
                      </div>
                    </div>
                    <label className="btn btn-secondary btn-sm file-upload-label">
                      {translations[lang].btnBrowse}
                      <input type="file" accept="image/*" multiple onChange={(e) => handleFileChange('minimal', e.target.files)} />
                    </label>
                  </div>

                  {/* Category Card: Partial */}
                  <div className="tuning-upload-card">
                    <div className="tuning-upload-info">
                      <span className="tuning-category-icon">⚠️</span>
                      <div>
                        <div className="tuning-category-label">{translations[lang].categoryPartial || 'Partially Damaged'}</div>
                        <div className="tuning-category-desc">{tuneFiles.partial.length} {translations[lang].filesSelectedCount}</div>
                      </div>
                    </div>
                    <label className="btn btn-secondary btn-sm file-upload-label">
                      {translations[lang].btnBrowse}
                      <input type="file" accept="image/*" multiple onChange={(e) => handleFileChange('partial', e.target.files)} />
                    </label>
                  </div>

                  {/* Category Card: Complete */}
                  <div className="tuning-upload-card">
                    <div className="tuning-upload-info">
                      <span className="tuning-category-icon">🏚️</span>
                      <div>
                        <div className="tuning-category-label">{translations[lang].categoryComplete || 'Completely Damaged'}</div>
                        <div className="tuning-category-desc">{tuneFiles.complete.length} {translations[lang].filesSelectedCount}</div>
                      </div>
                    </div>
                    <label className="btn btn-secondary btn-sm file-upload-label">
                      {translations[lang].btnBrowse}
                      <input type="file" accept="image/*" multiple onChange={(e) => handleFileChange('complete', e.target.files)} />
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    style={{ width: '100%' }}
                    onClick={handleTrainModel}
                    disabled={trainingStatus === 'training'}
                  >
                    {trainingStatus === 'training' ? `⚙️ ${translations[lang].btnTrainingModel}` : `🚀 ${translations[lang].btnTrainModel}`}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '100%', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                    onClick={handleAutoFeedTraining}
                    disabled={trainingStatus === 'training' || overrideReports.length === 0}
                  >
                    {translations[lang].btnAutoFeed}
                  </button>
                </div>
              </div>

              {/* Console logs output */}
              <div className="tuning-console-column">
                <h3 className="tuning-section-title">{translations[lang].tuningStep2}</h3>
                <p className="tuning-section-subtitle">{translations[lang].tuningStep2Desc}</p>
                
                <div className="tuning-console-logs" ref={trainingConsoleRef}>
                  {trainingLogs.length > 0 ? (
                    trainingLogs.map((log, idx) => (
                      <div key={idx} className="tuning-log-line">{log}</div>
                    ))
                  ) : (
                    <div className="tuning-log-placeholder">{translations[lang].waitingConsole}</div>
                  )}
                  {trainingStatus === 'training' && <div className="tuning-log-line cursor">█</div>}
                </div>
                
                {trainingStatus === 'success' && (
                  <div className="tuning-success-message">
                    {translations[lang].trainingSuccess}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI Overrides & Active Learning Tab */}
        {activeTab === 'overrides' && (
          <div className="overrides-panel glass-card fade-in">
            <div className="overrides-panel__header">
              <h2 className="overrides-panel__title">{translations[lang].overridesTitle}</h2>
              <p className="overrides-panel__subtitle">
                {translations[lang].overridesSubtitle}
              </p>
            </div>

            <div className="overrides-controls" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  {translations[lang].filterCategoryLabel}
                </label>
                <select
                  value={exportCategoryFilter}
                  onChange={(e) => setExportCategoryFilter(e.target.value)}
                  className="navbar__lang-select"
                  style={{ minWidth: '150px' }}
                >
                  <option value="all">{translations[lang].categoryAll}</option>
                  <option value="none">{translations[lang].categoryNone}</option>
                  <option value="minor">{translations[lang].categoryMinor}</option>
                  <option value="major">{translations[lang].categoryMajor}</option>
                  <option value="destroyed">{translations[lang].categoryDestroyed}</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleExportZip}
                  disabled={isExportingZip || overrideReports.length === 0}
                >
                  {isExportingZip ? translations[lang].btnGeneratingZip : translations[lang].btnExportZip}
                </button>

                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={handleAutoFeedTraining}
                  disabled={trainingStatus === 'training' || overrideReports.length === 0}
                  style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                >
                  {translations[lang].btnAutoFeed}
                </button>
              </div>
            </div>

            <div className="overrides-table-container">
              {overrideReports.length > 0 ? (
                <table className="overrides-table">
                  <thead>
                    <tr>
                      <th>{translations[lang].tblReportId}</th>
                      <th>{translations[lang].tblPhoto}</th>
                      <th>{translations[lang].tblAiSuggestion}</th>
                      <th>{translations[lang].tblHumanCorrection}</th>
                      <th>{translations[lang].tblInfrastructure}</th>
                      <th>{translations[lang].tblTimestamp}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overrideReports.map((report) => {
                      const firstPhoto = report.photos && report.photos.length > 0 ? report.photos[0] : null
                      const aiMeta = getDamageLevel(report.aiSuggestion)
                      const humanMeta = getDamageLevel(report.damageLevel)
                      const infra = getInfrastructureType(report.infrastructureType)

                      return (
                        <tr key={report.id} className="overrides-row">
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {report.id.substring(0, 8)}...
                          </td>
                          <td>
                            {firstPhoto ? (
                              <img src={firstPhoto} alt="Evidence" className="overrides-thumb" />
                            ) : (
                              <span>{translations[lang].noPhoto || 'No Photo'}</span>
                            )}
                          </td>
                          <td>
                            <span className="overrides-label-badge badge--ai">
                              {aiMeta?.icon} {translations[lang][`dmgCard${aiMeta?.value.charAt(0).toUpperCase() + aiMeta?.value.slice(1)}Title`] || report.aiSuggestion}
                            </span>
                          </td>
                          <td>
                            <span className="overrides-label-badge badge--human">
                              {humanMeta?.icon} {translations[lang][`dmgCard${humanMeta?.value.charAt(0).toUpperCase() + humanMeta?.value.slice(1)}Title`] || report.damageLevel}
                            </span>
                          </td>
                          <td>
                            {infra?.icon} {translations[lang][report.infrastructureType] || report.infrastructureType}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                            {parseDate(report.timestamp).toLocaleDateString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)' }}>
                  {translations[lang].noOverridesLogged}
                </div>
              )}
            </div>
          </div>
        )}

        {/* GIS Export Engine */}
        {activeTab === 'export' && <ExportPage showToast={showToast} lang={lang} />}
      </div>
    </div>
  )
}

export default AdminDashboard

