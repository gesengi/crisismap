import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

import CameraCapture from '../components/CameraCapture.jsx'
import DamageClassifier from '../components/DamageClassifier.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import { createReport } from '../services/reportService'
import { savePendingReport } from '../services/offlineManager'
import { IS_MOCK_MODE } from '../services/firebase'
import { getDamageLevel, getInfrastructureType } from '../utils/constants'
import { translations } from '../utils/translations'
import './ReportPage.css'

// Helper: Compress image client-side to save offline memory and upload bandwidth
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (event) => {
      const img = new Image()
      img.src = event.target.result
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_WIDTH = 800
        const scale = MAX_WIDTH / img.width
        
        if (img.width > MAX_WIDTH) {
          canvas.width = MAX_WIDTH
          canvas.height = img.height * scale
        } else {
          canvas.width = img.width
          canvas.height = img.height
        }
        
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            })
            resolve(compressedFile)
          } else {
            resolve(file)
          }
        }, 'image/jpeg', 0.7)
      }
    }
  })
}

// ─── Fix Leaflet default marker icons ────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Convert File object to Base64 (needed for localStorage in Mock Mode)
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result)
    reader.onerror = (err) => reject(err)
  })
}

function ReportPage({ showToast, isOnline, lang = 'en' }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Form States ──
  const [photos, setPhotos] = useState([])
  const [damageLevel, setDamageLevel] = useState('')
  const [infrastructureType, setInfrastructureType] = useState([])
  const [infrastructureTypeOther, setInfrastructureTypeOther] = useState('')
  const [infrastructureName, setInfrastructureName] = useState('')
  const [crisisNature, setCrisisNature] = useState([])
  const [needsDebrisClearing, setNeedsDebrisClearing] = useState(null)
  const [description, setDescription] = useState('')
  const [position, setPosition] = useState(null) // [lat, lng]
  const [address, setAddress] = useState('')
  const [landmarkDescription, setLandmarkDescription] = useState('')
  const [buildingId, setBuildingId] = useState(null)
  const [isAnonymized, setIsAnonymized] = useState(true)

  const [collectionTimestamp, setCollectionTimestamp] = useState(new Date().toISOString())
  const [customSurvey, setCustomSurvey] = useState({ livelihoodAffected: '', displacedFamilies: '', inaccessibleServices: [] })

  // ── AI Suggestion Tracking ──
  const [aiSuggestion, setAiSuggestion] = useState(null)
  
  // ── Gamification Badge Popup state ──
  const [showBadgeModal, setShowBadgeModal] = useState(false)

  // Reset AI suggestion and damage level if user changes the photos (prevents sticky ratings)
  useEffect(() => {
    Promise.resolve().then(() => {
      setAiSuggestion(null)
      setDamageLevel('')
    })
  }, [photos])

  // Memoized photo object URLs for preview to prevent memory leaks
  const photoPreviews = useMemo(() => {
    return photos.map(file => URL.createObjectURL(file))
  }, [photos])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      photoPreviews.forEach(url => URL.revokeObjectURL(url))
    }
  }, [photoPreviews])

  // ── Step Navigation & Validation ──
  const handleNext = () => {
    if (step === 1 && photos.length === 0) {
      showToast(translations[lang].photoWarning, 'warning')
      return
    }
    if (step === 2) {
      if (!damageLevel) {
        showToast(translations[lang].errMissingDamage || 'Please confirm and select a damage severity level.', 'warning')
        return
      }
      if (!infrastructureName.trim()) {
        showToast(translations[lang].errMissingInfraName || 'Please enter the name or details of the infrastructure.', 'warning')
        return
      }
      const hasInfraType = Array.isArray(infrastructureType) ? infrastructureType.length > 0 : !!infrastructureType;
      if (!hasInfraType) {
        showToast(translations[lang].errMissingInfraType || 'Please select at least one infrastructure type.', 'warning')
        return
      }
      const otherNeedsSpecify = Array.isArray(infrastructureType) ? infrastructureType.includes('other') : infrastructureType === 'other';
      if (otherNeedsSpecify && !infrastructureTypeOther.trim()) {
        showToast(translations[lang].errMissingInfraOther || 'Please specify the other infrastructure type.', 'warning')
        return
      }
      const hasCrisisNature = Array.isArray(crisisNature) ? crisisNature.length > 0 : !!crisisNature;
      if (!hasCrisisNature) {
        showToast(translations[lang].errMissingCrisis || 'Please select the nature of the crisis.', 'warning')
        return
      }
      if (needsDebrisClearing === null) {
        showToast(translations[lang].errMissingDebris || 'Please indicate if debris clearing is required.', 'warning')
        return
      }
    }
    if (step === 3 && !position) {
      showToast(translations[lang].locationWarning, 'warning')
      return
    }
    setStep(prev => prev + 1)
  }

  const handleBack = () => {
    setStep(prev => prev - 1)
  }

  const handleAiResult = (result) => {
    setAiSuggestion(result.suggestion)
    // Auto-select the AI suggestion to make submission faster (HITL)
    if (!damageLevel) {
      setDamageLevel(result.suggestion)
      const severityLabel = translations[lang][`dmgCard${result.suggestion.charAt(0).toUpperCase() + result.suggestion.slice(1)}Title`] || result.suggestion
      showToast((translations[lang].aiClassified || 'AI classified damage level as "{{severity}}"').replace('{{severity}}', severityLabel), 'info')
    }
  }

  // ── Report Submission ──
  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      // 1. Determine user choice vs AI suggestion (Human-in-the-loop tracking)
      let userChoice = null
      if (aiSuggestion) {
        userChoice = damageLevel === aiSuggestion ? 'ai_accepted' : 'user_override'
      }

      // 2. Compress images client-side before sync to conserve storage and speed up transfers
      showToast(translations[lang].compressingPhotos || 'Compressing report images...', 'info')
      const compressedPhotos = await Promise.all(photos.map(file => compressImage(file)))

      // 3. Prepare report photos
      let finalPhotos = []
      if (IS_MOCK_MODE) {
        finalPhotos = await Promise.all(compressedPhotos.map(file => fileToBase64(file)))
      } else {
        finalPhotos = compressedPhotos
      }

      const reportData = {
        photos: finalPhotos,
        damageLevel,
        infrastructureType,
        infrastructureTypeOther,
        infrastructureName,
        crisisNature,
        needsDebrisClearing,
        description,
        latitude: position[0],
        longitude: position[1],
        address,
        buildingId,
        landmarkDescription,
        isAnonymized,
        aiSuggestion,
        userChoice,
        collectionTimestamp,
        customSurvey
      }

      // 4. Submit depending on online/offline state
      let submittedId = null
      if (isOnline) {
        showToast(translations[lang].submittingDb || 'Submitting report to the database...', 'info')
        const created = await createReport(reportData)
        submittedId = created.id
      } else {
        const offlineReport = {
          ...reportData,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          synced: false
        }
        await savePendingReport(offlineReport)
        submittedId = offlineReport.id
      }

      // Save report ID locally to check validation status later for badge awarding
      if (submittedId) {
        const myReports = JSON.parse(localStorage.getItem('crisismap_my_reports') || '[]')
        myReports.push(submittedId)
        localStorage.setItem('crisismap_my_reports', JSON.stringify(myReports))
      }

      // 5. Open success modal instead of direct redirect
      setShowBadgeModal(true)
    } catch (err) {
      console.error('[ReportPage] Submit failed:', err)
      showToast(translations[lang].errSubmitFailed || 'Failed to submit report. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Render Helpers ──
  const damageMeta = getDamageLevel(damageLevel)

  return (
    <div className="report-page fade-in">
      <div className="report-page__header">
        <h1 className="report-page__title">{translations[lang].reportTitle}</h1>
        <p className="report-page__subtitle">
          {translations[lang].reportSubtitle}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="step-progress">
        <div className="step-progress__bar-bg">
          <div 
            className="step-progress__bar-fill"
            style={{ width: `${((step - 1) / 3) * 100}%` }}
          />
        </div>
        <div className="step-progress__steps">
          <span className={`step-progress__step ${step >= 1 ? 'step-progress__step--active' : ''} ${step > 1 ? 'step-progress__step--completed' : ''}`}>
            📸 {translations[lang].stepPhoto}
          </span>
          <span className={`step-progress__step ${step >= 2 ? 'step-progress__step--active' : ''} ${step > 2 ? 'step-progress__step--completed' : ''}`}>
            📊 {translations[lang].stepDetail}
          </span>
          <span className={`step-progress__step ${step >= 3 ? 'step-progress__step--active' : ''} ${step > 3 ? 'step-progress__step--completed' : ''}`}>
            📍 {translations[lang].stepLocate}
          </span>
          <span className={`step-progress__step ${step >= 4 ? 'step-progress__step--active' : ''}`}>
            📝 {translations[lang].stepReview}
          </span>
        </div>
      </div>

      {/* Step Wizard Content */}
      <div className="report-page__card glass-card">
        <div className="report-page__content">
          {step === 1 && (
            <CameraCapture 
              photos={photos} 
              onPhotosChange={setPhotos} 
              maxPhotos={4}
              lang={lang}
            />
          )}

          {step === 2 && (
            <DamageClassifier
              damageLevel={damageLevel}
              onDamageLevelChange={setDamageLevel}
              infrastructureType={infrastructureType}
              onInfrastructureTypeChange={setInfrastructureType}
              infrastructureTypeOther={infrastructureTypeOther}
              onInfrastructureTypeOtherChange={setInfrastructureTypeOther}
              infrastructureName={infrastructureName}
              onInfrastructureNameChange={setInfrastructureName}
              crisisNature={crisisNature}
              onCrisisNatureChange={setCrisisNature}
              needsDebrisClearing={needsDebrisClearing}
              onNeedsDebrisClearingChange={setNeedsDebrisClearing}
              description={description}
              onDescriptionChange={setDescription}
              photos={photos}
              onAiResult={handleAiResult}
              lang={lang}
              collectionTimestamp={collectionTimestamp}
              onCollectionTimestampChange={setCollectionTimestamp}
              customSurvey={customSurvey}
              onCustomSurveyChange={setCustomSurvey}
            />
          )}

          {step === 3 && (
            <LocationPicker
              position={position}
              onPositionChange={setPosition}
              address={address}
              onAddressChange={setAddress}
              landmarkDescription={landmarkDescription}
              onLandmarkChange={setLandmarkDescription}
              buildingId={buildingId}
              onBuildingIdChange={setBuildingId}
              lang={lang}
            />
          )}

          {step === 4 && (
            <div className="review-summary">
              <h2 className="review-summary__section-title">{translations[lang].reviewTitle}</h2>
              <div className="review-summary__grid">
                
                {/* Visual Summary */}
                <div className="review-summary__section">
                  <div className="review-summary__item">
                    <span className="review-summary__label">{translations[lang].labelPhotos}:</span>
                    <div className="review-summary__photos">
                      {photoPreviews.map((url, idx) => (
                        <img 
                          key={idx} 
                          src={url} 
                          alt={`Captured upload ${idx + 1}`} 
                          className="review-summary__photo"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="review-summary__item">
                    <span className="review-summary__label">{translations[lang].labelDmgLevel}:</span>{' '}
                    <span className="review-summary__value">
                      {damageMeta?.icon} {translations[lang][`dmgCard${damageLevel.charAt(0).toUpperCase() + damageLevel.slice(1)}Title`] || damageMeta?.label}
                    </span>
                  </div>
                  <div className="review-summary__item">
                    <span className="review-summary__label">{translations[lang].labelInfraName}:</span>{' '}
                    <span className="review-summary__value">{infrastructureName}</span>
                  </div>
                  <div className="review-summary__item">
                    <span className="review-summary__label">{translations[lang].labelInfraType}:</span>{' '}
                    <span className="review-summary__value">
                      {Array.isArray(infrastructureType)
                        ? infrastructureType
                            .map((t) => {
                              const meta = getInfrastructureType(t)
                              const label = translations[lang][t] || meta?.label || t
                              const extraSpec = (t === 'other' && infrastructureTypeOther) ? ` (${infrastructureTypeOther})` : ''
                              return `${meta?.icon || ''} ${label}${extraSpec}`
                            })
                            .join(', ')
                        : (() => {
                            const meta = getInfrastructureType(infrastructureType)
                            const extraSpec = (infrastructureType === 'other' && infrastructureTypeOther) ? ` (${infrastructureTypeOther})` : ''
                            return `${meta?.icon || ''} ${translations[lang][infrastructureType] || meta?.label || infrastructureType}${extraSpec}`
                          })()}
                    </span>
                  </div>
                  <div className="review-summary__item">
                    <span className="review-summary__label">{translations[lang].labelCrisisNature}:</span>{' '}
                    <span className="review-summary__value">
                      {Array.isArray(crisisNature)
                        ? crisisNature
                            .map((n) => {
                              const labelKey = `crisis${n.charAt(0).toUpperCase() + n.slice(1)}`
                              return translations[lang][labelKey] || n
                            })
                            .join(', ')
                        : (() => {
                            const labelKey = `crisis${crisisNature.charAt(0).toUpperCase() + crisisNature.slice(1)}`
                            return translations[lang][labelKey] || crisisNature
                          })()}
                    </span>
                  </div>
                  <div className="review-summary__item">
                    <span className="review-summary__label">{translations[lang].labelDebrisClearing}:</span>{' '}
                    <span className="review-summary__value">
                      {needsDebrisClearing ? translations[lang].debrisClearingYes : translations[lang].debrisClearingNo}
                    </span>
                  </div>
                  {description && (
                    <div className="review-summary__item">
                      <span className="review-summary__label">{translations[lang].labelDesc}:</span>{' '}
                      <p className="review-summary__value" style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                        {description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Location Summary */}
                <div className="review-summary__section">
                  <div className="review-summary__item">
                    <span className="review-summary__label">{translations[lang].labelAddr}:</span>{' '}
                    <span className="review-summary__value">{address || translations[lang].detectingAddr}</span>
                  </div>
                  <div className="review-summary__item">
                    <span className="review-summary__label">{translations[lang].labelCoords}:</span>{' '}
                    <span className="review-summary__value">
                      {position ? `${position[0].toFixed(5)}, ${position[1].toFixed(5)}` : ''}
                    </span>
                  </div>

                  {position && (
                    <div className="review-summary__map-container">
                      <MapContainer 
                        center={position} 
                        zoom={15} 
                        zoomControl={false}
                        doubleClickZoom={false}
                        scrollWheelZoom={false}
                        dragging={false}
                        className="review-summary__map"
                      >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={position} />
                      </MapContainer>
                    </div>
                  )}

                  {landmarkDescription && (
                    <div className="review-summary__item">
                      <span className="review-summary__label">{translations[lang].labelLandmark}:</span>{' '}
                      <span className="review-summary__value">{landmarkDescription}</span>
                    </div>
                  )}

                  {/* Anonymity Selector */}
                  <div className="review-summary__item" style={{ marginTop: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={isAnonymized} 
                        onChange={(e) => setIsAnonymized(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span className="review-summary__value" style={{ fontWeight: '500' }}>
                        {translations[lang].stripPii}
                      </span>
                    </label>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '4px', paddingLeft: '26px' }}>
                      {translations[lang].piiDesc}
                    </p>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Row */}
        <div className={`report-page__actions ${step === 1 ? 'report-page__actions--single' : ''}`}>
          {step > 1 && (
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={handleBack}
              disabled={isSubmitting}
            >
              {translations[lang].backBtn}
            </button>
          )}

          {step < 4 ? (
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={handleNext}
            >
              {translations[lang].nextStepBtn}
            </button>
          ) : (
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? translations[lang].submittingReport : translations[lang].submitBtn}
            </button>
          )}
        </div>
      </div>

      {/* Vetting Queue Success Modal */}
      {showBadgeModal && (
        <div className="badge-modal-overlay">
          <div className="badge-modal glass-card fade-in">
            <div className="badge-modal__header">
              <span className="badge-modal__icon">📤</span>
              <h2 className="badge-modal__title">{translations[lang].submitSuccessTitle || 'Report Submitted!'}</h2>
            </div>
            <p className="badge-modal__subtitle">
              {translations[lang].submitSuccessDesc || 'Your report has been successfully recorded and sent to the coordinator vetting portal for review.'}
            </p>
            <div className="badge-modal__card" style={{ padding: '16px', background: 'rgba(255,255,255,0.03)' }}>
              <span className="badge-modal__badge-emoji" style={{ animation: 'pulse 2s infinite' }}>⏳</span>
              <h3 className="badge-modal__badge-title" style={{ fontSize: '1rem', marginTop: '8px' }}>
                {translations[lang].pendingVerificationTitle || 'Pending Verification'}
              </h3>
              <p className="badge-modal__badge-desc" style={{ fontSize: '0.82rem' }}>
                {translations[lang].pendingVerificationDesc || 'To protect accuracy, rewards are locked until crisis response managers verify the damage. We will notify you once verified.'}
              </p>
            </div>
            <button 
              type="button" 
              className="btn btn-primary" 
              onClick={() => {
                setShowBadgeModal(false)
                navigate('/map')
              }}
              style={{ marginTop: '20px', width: '100%', justifyContent: 'center' }}
            >
              {translations[lang].close || 'Close'} & {translations[lang].navMap || 'View Live Map'} 🗺️
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportPage
