import { useState, useEffect } from 'react'
import { classifyDamage } from '../services/aiClassifier'
import { INFRASTRUCTURE_TYPES, CRISIS_NATURES } from '../utils/constants'
import { translations } from '../utils/translations'
import './DamageClassifier.css'

const DAMAGE_CARDS = [
  {
    value: 'minimal',
    icon: '✅',
    color: '#22c55e',
  },
  {
    value: 'partial',
    icon: '⚠️',
    color: '#f59e0b',
  },
  {
    value: 'complete',
    icon: '🏚️',
    color: '#ef4444',
  },
]

function DamageClassifier({
  damageLevel,
  onDamageLevelChange,
  infrastructureType = [],
  onInfrastructureTypeChange,
  infrastructureTypeOther = '',
  onInfrastructureTypeOtherChange,
  infrastructureName,
  onInfrastructureNameChange,
  crisisNature = [],
  onCrisisNatureChange,
  needsDebrisClearing,
  onNeedsDebrisClearingChange,
  description,
  onDescriptionChange,
  photos = [],
  onAiResult,
  lang = 'en',
  collectionTimestamp,
  onCollectionTimestampChange,
  customSurvey = { livelihoodAffected: '', displacedFamilies: '', inaccessibleServices: [] },
  onCustomSurveyChange
}) {
  const [aiResult, setAiResult] = useState(null)
  const [isClassifying, setIsClassifying] = useState(false)
  const [activePhotoUrl, setActivePhotoUrl] = useState(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [surveyOpen, setSurveyOpen] = useState(false)

  const latestPhoto = photos[photos.length - 1]

  // Manage active photo URL
  useEffect(() => {
    if (latestPhoto) {
      const url = URL.createObjectURL(latestPhoto)
      Promise.resolve().then(() => {
        setActivePhotoUrl(url)
      })
      return () => {
        URL.revokeObjectURL(url)
      }
    } else {
      Promise.resolve().then(() => {
        setActivePhotoUrl(null)
      })
    }
  }, [latestPhoto])

  // Run AI classification when latest photo changes
  useEffect(() => {
    if (!latestPhoto) {
      Promise.resolve().then(() => {
        setAiResult(null)
      })
      return
    }

    let cancelled = false

    const runClassification = async () => {
      setIsClassifying(true)
      try {
        const result = await classifyDamage(latestPhoto)
        if (!cancelled) {
          setAiResult(result)
          if (onAiResult) onAiResult(result)
        }
      } catch (err) {
        console.warn('[DamageClassifier] AI classification failed:', err)
        if (!cancelled) setAiResult(null)
      } finally {
        if (!cancelled) setIsClassifying(false)
      }
    }

    runClassification()

    return () => {
      cancelled = true
    }
  }, [latestPhoto, onAiResult])

  // Handle step index updates during classification
  useEffect(() => {
    if (!isClassifying) {
      Promise.resolve().then(() => {
        setCurrentStepIndex(-1)
      })
      return
    }

    const stepsCount = 5
    let index = 0
    Promise.resolve().then(() => {
      setCurrentStepIndex(0)
    })

    const timer = setInterval(() => {
      index++
      if (index < stepsCount) {
        setCurrentStepIndex(index)
      } else {
        clearInterval(timer)
      }
    }, 450)

    return () => clearInterval(timer)
  }, [isClassifying])

  const maxDescriptionLength = 500

  const handleApplyAi = () => {
    if (aiResult?.suggestion && onDamageLevelChange) {
      onDamageLevelChange(aiResult.suggestion)
    }
  }

  // Classification progress animation steps
  const classificationSteps = [
    translations[lang].stepEdge,
    translations[lang].stepBoundary,
    translations[lang].stepFeature,
    translations[lang].stepTexture,
    translations[lang].stepProb,
  ]

  return (
    <div className="damage-classifier">
      {/* High-Tech AI Viewport */}
      <div className="damage-classifier__viewport-wrapper">
        <div className="damage-classifier__viewport-header">
          <h3 className="damage-classifier__viewport-title">
            <span className={`damage-classifier__pulse-dot ${isClassifying ? 'pulse--active' : ''}`} />
            {translations[lang].diagTitle}
          </h3>
          <span className="damage-classifier__viewport-badge">ON-DEVICE AI</span>
        </div>

        <div className="damage-classifier__viewport-grid">
          {/* Left/Top: Image Viewport */}
          <div className={`damage-classifier__screen ${isClassifying ? 'damage-classifier__screen--scanning' : ''}`}>
            {activePhotoUrl ? (
              <>
                <img
                  src={activePhotoUrl}
                  alt="Source crop"
                  className="damage-classifier__img"
                />
                <div className="damage-classifier__grid-overlay" />
                {isClassifying && <div className="damage-classifier__scanner-line" />}
                {aiResult?.method?.includes('Crop') && (
                  <span className="damage-classifier__crop-badge">
                    🎯 {translations[lang].buildingCropped}
                  </span>
                )}
              </>
            ) : (
              <div className="damage-classifier__empty-mode" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', border: 'none' }}>
                <span style={{ fontSize: '2rem' }}>📷</span>
                <p style={{ marginTop: '8px' }}>{translations[lang].waitingPhoto}</p>
              </div>
            )}
          </div>

          {/* Right/Bottom: Diagnostics Panel */}
          <div className="damage-classifier__diagnostics-panel">
            {isClassifying && (
              <div className="damage-classifier__steps-mode">
                <div className="damage-classifier__steps-title">
                  {translations[lang].pipelineTitle || 'ANALYSIS PIPELINE'}
                </div>
                <div className="damage-classifier__steps-list">
                  {classificationSteps.map((stepText, idx) => {
                    const isCompleted = idx < currentStepIndex
                    const isActive = idx === currentStepIndex
                    const statusClass = isCompleted ? 'step--completed' : isActive ? 'step--active' : 'step--pending'

                    return (
                      <div key={idx} className={`damage-classifier__step-item ${statusClass}`}>
                        <span className="damage-classifier__step-indicator">
                          {isCompleted ? '✓' : isActive ? '▶' : '○'}
                        </span>
                        <span>{stepText}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="damage-classifier__progress-bar-container">
                  <div
                    className="damage-classifier__progress-bar-fill"
                    style={{ width: `${((currentStepIndex + 1) / classificationSteps.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {aiResult && !isClassifying && (
              <div className="damage-classifier__verdict-mode fade-in">
                <div className="damage-classifier__verdict-header">
                  <span className="damage-classifier__verdict-label">
                    {translations[lang].metricSeverity}
                  </span>
                  <h3 className={`damage-classifier__verdict-title text-color--${aiResult.suggestion === 'complete' ? 'destroyed' : aiResult.suggestion === 'partial' ? 'minor' : 'none'}`}>
                    {translations[lang][`dmgCard${aiResult.suggestion.charAt(0).toUpperCase() + aiResult.suggestion.slice(1)}Title`] || aiResult.suggestion.toUpperCase()}
                  </h3>
                </div>

                <div className="damage-classifier__metric-row">
                  <span className="damage-classifier__metric-label">
                    {translations[lang].metricConf}
                  </span>
                  <span className="damage-classifier__metric-value">
                    {Math.round(aiResult.confidence * 100)}%
                  </span>
                </div>
                <div className="damage-classifier__gauge-bg">
                  <div
                    className={`damage-classifier__gauge-fill fill--${aiResult.suggestion === 'complete' ? 'destroyed' : aiResult.suggestion === 'partial' ? 'minor' : 'none'}`}
                    style={{ width: `${aiResult.confidence * 100}%` }}
                  />
                </div>

                <div className="damage-classifier__metrics-grid">
                  <div className="damage-classifier__metric-card">
                    <div className="damage-classifier__metric-key">
                      {translations[lang].metricFeature}
                    </div>
                    <div className="damage-classifier__metric-val" title={aiResult.detectedClass}>
                      {aiResult.detectedClass}
                    </div>
                  </div>

                  <div className="damage-classifier__metric-card">
                    <div className="damage-classifier__metric-key">
                      {translations[lang].metricLatency}
                    </div>
                    <div className="damage-classifier__metric-val">
                      {aiResult.processingTime} ms
                    </div>
                  </div>

                  <div className="damage-classifier__metric-card">
                    <div className="damage-classifier__metric-key">
                      {translations[lang].metricEdge}
                    </div>
                    <div className="damage-classifier__metric-val">
                      {aiResult.edgeDensity}
                    </div>
                  </div>

                  <div className="damage-classifier__metric-card">
                    <div className="damage-classifier__metric-key">
                      {translations[lang].metricGrey}
                    </div>
                    <div className="damage-classifier__metric-val">
                      {aiResult.grayValue}
                    </div>
                  </div>
                </div>

                {damageLevel !== aiResult.suggestion && onDamageLevelChange && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm damage-classifier__apply-btn"
                    onClick={handleApplyAi}
                  >
                    🤖 {translations[lang].applyAi}
                  </button>
                )}
              </div>
            )}

            {!activePhotoUrl && !isClassifying && !aiResult && (
              <div className="damage-classifier__empty-mode">
                {translations[lang].waitingPhoto}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* - Damage Severity Selector - */}
      <div className="damage-classifier__field">
        <label className="damage-classifier__label">
          {translations[lang].severityTitle} <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
        </label>
        <p className="damage-classifier__subtitle">
          {translations[lang].severityDesc}
        </p>

        <div className="damage-classifier__cards">
          {DAMAGE_CARDS.map((card) => {
            const isSelected = damageLevel === card.value
            const isAiSuggested = aiResult?.suggestion === card.value

            return (
              <div
                key={card.value}
                className={`damage-classifier__card ${
                  isSelected ? 'damage-classifier__card--selected' : ''
                } ${
                  isAiSuggested ? 'damage-classifier__card--ai-suggested' : ''
                }`}
                style={{
                  borderColor: isSelected ? card.color : 'var(--border-color)',
                  boxShadow: isSelected
                    ? `0 0 0 1px ${card.color}`
                    : 'none',
                }}
                onClick={() =>
                  onDamageLevelChange && onDamageLevelChange(card.value)
                }
              >
                {/* AI suggestion badge */}
                {isAiSuggested && !isClassifying && (
                  <div className="damage-classifier__ai-badge">
                    <span
                      className="damage-classifier__ai-badge-icon"
                      aria-hidden="true"
                    >
                      🤖
                    </span>
                    {translations[lang].aiSuggestionBadge}
                  </div>
                )}

                <span
                  className="damage-classifier__card-icon"
                  aria-hidden="true"
                >
                  {card.icon}
                </span>
                <div className="damage-classifier__card-content">
                  <div className="damage-classifier__card-title">
                    {translations[lang][`dmgCard${card.value.charAt(0).toUpperCase() + card.value.slice(1)}Title`]}
                  </div>
                  <div className="damage-classifier__card-desc">
                    {translations[lang][`dmgCard${card.value.charAt(0).toUpperCase() + card.value.slice(1)}Desc`]}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* - Infrastructure Name / Details - */}
      <div className="damage-classifier__field">
        <label
          className="damage-classifier__label"
          htmlFor="infrastructure-name"
        >
          {translations[lang].labelInfraName} <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
        </label>
        <input
          id="infrastructure-name"
          type="text"
          className="damage-classifier__input"
          value={infrastructureName}
          onChange={(e) => onInfrastructureNameChange(e.target.value)}
          placeholder={translations[lang].infraNamePlaceholder}
        />
      </div>

      {/* - Infrastructure Type Multi-Select Checklist - */}
      <div className="damage-classifier__field">
        <label className="damage-classifier__label">
          {translations[lang].infraLabel} <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
        </label>
        <div className="damage-classifier__checkbox-grid">
          {INFRASTRUCTURE_TYPES.map((type) => {
            const isChecked = Array.isArray(infrastructureType)
              ? infrastructureType.includes(type.value)
              : infrastructureType === type.value;
            return (
              <label 
                key={type.value} 
                className={`damage-classifier__checkbox-chip ${isChecked ? 'damage-classifier__checkbox-chip--checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    let newVal;
                    const currentArray = Array.isArray(infrastructureType)
                      ? infrastructureType
                      : infrastructureType
                      ? [infrastructureType]
                      : [];
                    if (e.target.checked) {
                      newVal = [...currentArray, type.value];
                    } else {
                      newVal = currentArray.filter((v) => v !== type.value);
                    }
                    onInfrastructureTypeChange(newVal);
                  }}
                />
                <span>{type.icon} {translations[lang][type.value] || type.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Conditional specify-other field */}
      {((Array.isArray(infrastructureType) && infrastructureType.includes('other')) || infrastructureType === 'other') && (
        <div className="damage-classifier__field" style={{ paddingLeft: '15px', borderLeft: '3px solid var(--accent-primary)' }}>
          <label className="damage-classifier__label" htmlFor="infra-other-specify" style={{ fontSize: '0.85rem' }}>
            {translations[lang].labelOtherSpecify || 'Other (please specify):'} <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
          </label>
          <input
            id="infra-other-specify"
            type="text"
            className="damage-classifier__input"
            value={infrastructureTypeOther}
            onChange={(e) => onInfrastructureTypeOtherChange(e.target.value)}
            placeholder="Please specify infrastructure type..."
          />
        </div>
      )}

      {/* - Nature of Crisis Multi-Select Checklist - */}
      <div className="damage-classifier__field">
        <label className="damage-classifier__label">
          {translations[lang].labelCrisisNature} <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
        </label>
        <div className="damage-classifier__crisis-groups">
          {CRISIS_NATURES.map((group) => (
            <div key={group.category} className="damage-classifier__crisis-group">
              <div className="damage-classifier__crisis-group-title">
                {translations[lang][group.labelKey] || group.category}
              </div>
              <div className="damage-classifier__crisis-grid">
                {group.items.map((item) => {
                  const isChecked = Array.isArray(crisisNature)
                    ? crisisNature.includes(item.value)
                    : crisisNature === item.value;
                  return (
                    <label 
                      key={item.value} 
                      className={`damage-classifier__checkbox-chip ${isChecked ? 'damage-classifier__checkbox-chip--checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          let newVal;
                          const currentArray = Array.isArray(crisisNature)
                            ? crisisNature
                            : crisisNature
                            ? [crisisNature]
                            : [];
                          if (e.target.checked) {
                            newVal = [...currentArray, item.value];
                          } else {
                            newVal = currentArray.filter((v) => v !== item.value);
                          }
                          onCrisisNatureChange(newVal);
                        }}
                      />
                      <span>{translations[lang][item.labelKey] || item.value}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* - Date/Time of Data Collection picker - */}
      <div className="damage-classifier__field">
        <label className="damage-classifier__label" htmlFor="collection-timestamp">
          {translations[lang].labelCollectionDate || 'Date and time of data collection'} <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
        </label>
        <input
          id="collection-timestamp"
          type="datetime-local"
          className="damage-classifier__input"
          value={collectionTimestamp ? collectionTimestamp.slice(0, 16) : ''}
          onChange={(e) => {
            const isoString = e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString();
            onCollectionTimestampChange(isoString);
          }}
        />
      </div>

      {/* - Debris Clearing - */}
      <div className="damage-classifier__field">
        <label className="damage-classifier__label">
          {translations[lang].labelDebrisClearing} <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
        </label>
        <div className="damage-classifier__debris-group">
          <button
            type="button"
            className={`damage-classifier__debris-btn damage-classifier__debris-btn--yes ${needsDebrisClearing === true ? 'damage-classifier__debris-btn--active' : ''}`}
            onClick={() => onNeedsDebrisClearingChange(true)}
          >
            ⚠️ {translations[lang].debrisClearingYes}
          </button>
          <button
            type="button"
            className={`damage-classifier__debris-btn damage-classifier__debris-btn--no ${needsDebrisClearing === false ? 'damage-classifier__debris-btn--active' : ''}`}
            onClick={() => onNeedsDebrisClearingChange(false)}
          >
            ✅ {translations[lang].debrisClearingNo}
          </button>
        </div>
      </div>

      {/* - Description - */}
      <div className="damage-classifier__field">
        <label
          className="damage-classifier__label"
          htmlFor="damage-description"
        >
          {translations[lang].descLabel} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-tertiary)' }}>({translations[lang].labelOptional || 'Optional'})</span>
        </label>
        <textarea
          id="damage-description"
          className="damage-classifier__textarea"
          value={description}
          onChange={(e) => {
            if (e.target.value.length <= maxDescriptionLength) {
              onDescriptionChange(e.target.value)
            }
          }}
          placeholder={translations[lang].descPlaceholder}
          maxLength={maxDescriptionLength}
        />
        <div className="damage-classifier__char-count">
          {description.length}/{maxDescriptionLength}
        </div>
      </div>

      {/* - Collapsible Community Survey Optional Module - */}
      <div className="damage-classifier__survey-collapsible">
        <button
          type="button"
          className="damage-classifier__survey-trigger"
          onClick={() => setSurveyOpen(!surveyOpen)}
        >
          <span>📋 {translations[lang].labelSurveyHeader || 'Community Survey (Optional Module)'}</span>
          <span className={`damage-classifier__survey-icon ${surveyOpen ? 'damage-classifier__survey-icon--open' : ''}`}>
            ▼
          </span>
        </button>
        
        {surveyOpen && (
          <div className="damage-classifier__survey-content">
            <div className="damage-classifier__survey-grid">
              {/* Survey Q1: Livelihood */}
              <div className="damage-classifier__field">
                <label className="damage-classifier__label" style={{ fontSize: '0.85rem' }}>
                  {translations[lang].qLivelihood || 'Has this crisis affected your primary source of income?'}
                </label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                  <label className="damage-classifier__checkbox-chip" style={{ padding: '8px 12px', flex: 1, justifyContent: 'center' }}>
                    <input
                      type="radio"
                      name="livelihoodAffected"
                      value="yes"
                      checked={customSurvey?.livelihoodAffected === 'yes'}
                      onChange={() => onCustomSurveyChange({ ...customSurvey, livelihoodAffected: 'yes' })}
                    />
                    <span>{translations[lang].yes || 'Yes'}</span>
                  </label>
                  <label className="damage-classifier__checkbox-chip" style={{ padding: '8px 12px', flex: 1, justifyContent: 'center' }}>
                    <input
                      type="radio"
                      name="livelihoodAffected"
                      value="no"
                      checked={customSurvey?.livelihoodAffected === 'no'}
                      onChange={() => onCustomSurveyChange({ ...customSurvey, livelihoodAffected: 'no' })}
                    />
                    <span>{translations[lang].no || 'No'}</span>
                  </label>
                </div>
              </div>

              {/* Survey Q2: Displaced */}
              <div className="damage-classifier__field">
                <label className="damage-classifier__label" style={{ fontSize: '0.85rem' }}>
                  {translations[lang].qDisplaced || 'Are there displaced families staying in this building?'}
                </label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                  <label className="damage-classifier__checkbox-chip" style={{ padding: '8px 12px', flex: 1, justifyContent: 'center' }}>
                    <input
                      type="radio"
                      name="displacedFamilies"
                      value="yes"
                      checked={customSurvey?.displacedFamilies === 'yes'}
                      onChange={() => onCustomSurveyChange({ ...customSurvey, displacedFamilies: 'yes' })}
                    />
                    <span>{translations[lang].yes || 'Yes'}</span>
                  </label>
                  <label className="damage-classifier__checkbox-chip" style={{ padding: '8px 12px', flex: 1, justifyContent: 'center' }}>
                    <input
                      type="radio"
                      name="displacedFamilies"
                      value="no"
                      checked={customSurvey?.displacedFamilies === 'no'}
                      onChange={() => onCustomSurveyChange({ ...customSurvey, displacedFamilies: 'no' })}
                    />
                    <span>{translations[lang].no || 'No'}</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Survey Q3: Services */}
            <div className="damage-classifier__field">
              <label className="damage-classifier__label" style={{ fontSize: '0.85rem' }}>
                {translations[lang].qServices || 'Which services are currently inaccessible?'}
              </label>
              <div className="damage-classifier__checkbox-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', marginTop: '4px' }}>
                {['Water', 'Electricity', 'Healthcare', 'Education', 'Markets'].map((service) => {
                  const servicesList = customSurvey?.inaccessibleServices || [];
                  const isChecked = servicesList.includes(service);
                  return (
                    <label 
                      key={service} 
                      className={`damage-classifier__checkbox-chip ${isChecked ? 'damage-classifier__checkbox-chip--checked' : ''}`}
                      style={{ padding: '8px 10px', fontSize: '0.82rem' }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          let newVal;
                          if (e.target.checked) {
                            newVal = [...servicesList, service];
                          } else {
                            newVal = servicesList.filter((s) => s !== service);
                          }
                          onCustomSurveyChange({ ...customSurvey, inaccessibleServices: newVal });
                        }}
                      />
                      <span>{service}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DamageClassifier
