import { useState, useEffect, useMemo } from 'react'
import { getReports } from '../services/reportService'
import { exportToCSV, exportToGeoJSON, exportToShapefileBundle } from '../utils/exporters'
import { DAMAGE_LEVELS, INFRASTRUCTURE_TYPES } from '../utils/constants'
import { translations } from '../utils/translations'
import { getReportRegion } from '../utils/mockFootprints'
import './ExportPage.css'

const localTranslations = {
  en: {
    exportShapefileTitle: 'Shapefile Bundle (ZIP)',
    exportShapefileDesc: 'GIS-ready ZIP archive containing GeoJSON, CSV, WGS84 projection details (.prj), and a QGIS/ArcGIS import guide.',
    exportShapefileBtn: 'Download GIS Bundle 📥',
    exportShapefileSuccessToast: 'Successfully exported {{count}} reports to Shapefile ZIP bundle.',
    exportShapefileFailToast: 'Failed to export to Shapefile ZIP bundle.',
    apiTitle: 'REST API Data Access',
    apiSubtitle: 'Interoperable REST endpoints for automated third-party syncing with humanitarian platforms (HDX, ReliefWeb).',
    apiEndpoint: 'API Endpoint (Vetted Reports)',
    apiResponseFormat: 'Response Schema (JSON)',
    apiCopy: 'Copy Endpoint',
    apiCopied: 'Copied!'
  },
  es: {
    exportShapefileTitle: 'Paquete Shapefile (ZIP)',
    exportShapefileDesc: 'Archivo ZIP listo para GIS que contiene GeoJSON, CSV, detalles de proyección WGS84 (.prj) y una guía de importación de QGIS/ArcGIS.',
    exportShapefileBtn: 'Descargar Paquete GIS 📥',
    exportShapefileSuccessToast: 'Se exportaron exitosamente {{count}} informes al paquete ZIP de Shapefile.',
    exportShapefileFailToast: 'Error al exportar al paquete ZIP de Shapefile.',
    apiTitle: 'Acceso a Datos por API REST',
    apiSubtitle: 'Endpoints REST interoperables para sincronización automatizada con plataformas humanitarias de terceros (HDX, ReliefWeb).',
    apiEndpoint: 'Endpoint API (Informes validados)',
    apiResponseFormat: 'Esquema de Respuesta (JSON)',
    apiCopy: 'Copiar Endpoint',
    apiCopied: '¡Copiado!'
  },
  fr: {
    exportShapefileTitle: 'Paquet Shapefile (ZIP)',
    exportShapefileDesc: 'Archive ZIP prête pour le SIG contenant GeoJSON, CSV, les détails de projection WGS84 (.prj) et un guide d\'importation QGIS/ArcGIS.',
    exportShapefileBtn: 'Télécharger le Paquet SIG 📥',
    exportShapefileSuccessToast: '{{count}} rapports exportés avec succès dans le paquet ZIP Shapefile.',
    exportShapefileFailToast: 'Échec de l\'exportation vers le paquet ZIP Shapefile.',
    apiTitle: 'Accès aux Données via l\'API REST',
    apiSubtitle: 'Points de terminaison REST interopérables pour la synchronisation automatisée de tiers avec des plateformes humanitaires (HDX, ReliefWeb).',
    apiEndpoint: 'Point d\'accès API (Rapports validés)',
    apiResponseFormat: 'Schéma de Réponse (JSON)',
    apiCopy: 'Copier le Point d\'accès',
    apiCopied: 'Copié !'
  },
  ru: {
    exportShapefileTitle: 'Пакет Shapefile (ZIP)',
    exportShapefileDesc: 'Готовый к работе в ГИС ZIP-архив, содержащий GeoJSON, CSV, сведения о проекции WGS84 (.prj) и руководство по импорту QGIS/ArcGIS.',
    exportShapefileBtn: 'Скачать ГИС Пакет 📥',
    exportShapefileSuccessToast: 'Успешно экспортировано {{count}} отчетов в ZIP-пакет Shapefile.',
    exportShapefileFailToast: 'Не удалось экспортировать в ZIP-пакет Shapefile.',
    apiTitle: 'Доступ к данным через REST API',
    apiSubtitle: 'Совместимые конечные точки REST для автоматической сторонней синхронизации с гуманитарными платформами (HDX, ReliefWeb).',
    apiEndpoint: 'Конечная точка API (проверенные отчеты)',
    apiResponseFormat: 'Схема ответа (JSON)',
    apiCopy: 'Копировать адрес',
    apiCopied: 'Скопировано!'
  },
  zh: {
    exportShapefileTitle: 'Shapefile 压缩包 (ZIP)',
    exportShapefileDesc: '包含 GeoJSON、CSV、WGS84 投影详细信息 (.prj) 和 QGIS/ArcGIS 导入指南的 GIS 专用 ZIP 归档文件。',
    exportShapefileBtn: '下载 GIS 数据包 📥',
    exportShapefileSuccessToast: '成功将 {{count}} 条报告导出到 Shapefile ZIP 压缩包。',
    exportShapefileFailToast: '导出 Shapefile ZIP 压缩包失败。',
    apiTitle: 'REST API 数据访问',
    apiSubtitle: '与第三方人道主义平台（HDX、ReliefWeb）自动同步的可互操作 REST 端点。',
    apiEndpoint: 'API 端点（已审核报告）',
    apiResponseFormat: '响应架构 (JSON)',
    apiCopy: '复制端点',
    apiCopied: '已复制！'
  },
  ar: {
    exportShapefileTitle: 'حزمة Shapefile (ZIP)',
    exportShapefileDesc: 'أرشيف ZIP جاهز لنظم المعلومات الجغرافية يحتوي على GeoJSON و CSV وتفاصيل إسقاط WGS84 (.prj) ودليل استيراد QGIS/ArcGIS.',
    exportShapefileBtn: 'تنزيل حزمة GIS 📥',
    exportShapefileSuccessToast: 'تم تصدير {{count}} تقارير بنجاح إلى حزمة Shapefile ZIP.',
    exportShapefileFailToast: 'فشل التصدير إلى حزمة Shapefile ZIP.',
    apiTitle: 'الوصول إلى البيانات عبر REST API',
    apiSubtitle: 'نقاط نهاية REST قابلة للتشغيل المتبادل للمزامنة التلقائية مع المنصات الإنسانية الخارجية (HDX ، ReliefWeb).',
    apiEndpoint: 'نقطة نهاية API (التقارير المعتمدة)',
    apiResponseFormat: 'مخطط الاستجابة (JSON)',
    apiCopy: 'نسخ نقطة النهاية',
    apiCopied: 'تم النسخ!'
  }
}

// Helper: Safe date parsing for Firestore Timestamps and ISO Strings
const parseDate = (ts) => {
  if (!ts) return new Date()
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

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

function ExportPage({ showToast, lang = 'en' }) {
  const [reports, setReports] = useState([])
  const [copied, setCopied] = useState(false)
  const [now] = useState(() => Date.now())

  // ── Filter States ──
  const [dateRange, setDateRange] = useState('all') // '24h', '48h', 'week', 'custom', 'all'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedDamageLevels, setSelectedDamageLevels] = useState({
    minimal: true,
    partial: true,
    complete: true,
  })
  const [selectedInfraType, setSelectedInfraType] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('all')

  const availableRegions = useMemo(() => {
    const regionsSet = new Set()
    reports.forEach(report => {
      regionsSet.add(getReportRegion(report))
    })
    return Array.from(regionsSet).sort()
  }, [reports])

  // Load reports from reportService or local storage fallback
  useEffect(() => {
    const loadReports = async () => {
      const data = await getReports()
      if (data.length === 0) {
        const local = getLocalReports()
        setReports(local)
      } else {
        setReports(data)
      }
    }
    loadReports()
  }, [])

  // ── Filter Handling ──
  const handleCheckboxChange = (level) => {
    setSelectedDamageLevels(prev => ({
      ...prev,
      [level]: !prev[level]
    }))
  }

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      // 1. Damage Level Checkbox filter with legacy fallback mapping
      let lvl = report.damageLevel
      if (lvl === 'none') lvl = 'minimal'
      if (lvl === 'minor' || lvl === 'major') lvl = 'partial'
      if (lvl === 'destroyed') lvl = 'complete'
      
      if (!selectedDamageLevels[lvl]) return false

      // 2. Infrastructure Type Dropdown filter
      if (selectedInfraType) {
        if (Array.isArray(report.infrastructureType)) {
          if (!report.infrastructureType.includes(selectedInfraType)) return false
        } else {
          if (report.infrastructureType !== selectedInfraType) return false
        }
      }

      // 3. Region Filter
      if (selectedRegion !== 'all' && getReportRegion(report) !== selectedRegion) return false

      // 3. Date range filter
      if (dateRange !== 'all') {
        const reportDate = parseDate(report.timestamp)
        if (dateRange === 'custom') {
          if (startDate) {
            const start = new Date(startDate + 'T00:00:00')
            if (reportDate < start) return false
          }
          if (endDate) {
            const end = new Date(endDate + 'T23:59:59')
            if (reportDate > end) return false
          }
          if (startDate && endDate && startDate > endDate) {
            return false
          }
        } else {
          const reportTime = reportDate.getTime()
          const diffHours = (now - reportTime) / (1000 * 60 * 60)

          if (dateRange === '24h' && diffHours > 24) return false
          if (dateRange === '48h' && diffHours > 48) return false
          if (dateRange === 'week' && diffHours > 168) return false
        }
      }

      return true
    })
  }, [reports, selectedDamageLevels, selectedInfraType, selectedRegion, dateRange, startDate, endDate, now])

  // ── Download Triggers ──
  const handleExportCSV = () => {
    try {
      if (filteredReports.length === 0) {
        showToast(translations[lang].exportNoMatchingToast || 'No matching reports found to export.', 'warning')
        return
      }
      exportToCSV(filteredReports, `crisismap-export-${new Date().toISOString().split('T')[0]}.csv`)
      showToast(
        (translations[lang].exportCsvSuccessToast || 'Exported {{count}} reports to CSV successfully.').replace('{{count}}', filteredReports.length),
        'success'
      )
    } catch (err) {
      console.error('[ExportPage] Export CSV failed:', err)
      showToast(translations[lang].exportCsvFailToast || 'Export to CSV failed.', 'error')
    }
  }

  const handleExportGeoJSON = () => {
    try {
      if (filteredReports.length === 0) {
        showToast(translations[lang].exportNoMatchingToast || 'No matching reports found to export.', 'warning')
        return
      }
      exportToGeoJSON(filteredReports, `crisismap-export-${new Date().toISOString().split('T')[0]}.geojson`)
      showToast(
        (translations[lang].exportGeoJsonSuccessToast || 'Exported {{count}} reports to GeoJSON successfully.').replace('{{count}}', filteredReports.length),
        'success'
      )
    } catch (err) {
      console.error('[ExportPage] Export GeoJSON failed:', err)
      showToast(translations[lang].exportGeoJsonFailToast || 'Export to GeoJSON failed.', 'error')
    }
  }

  const handleExportShapefile = () => {
    try {
      if (filteredReports.length === 0) {
        showToast(localTranslations[lang]?.exportShapefileFailToast || localTranslations['en'].exportShapefileFailToast, 'warning')
        return
      }
      exportToShapefileBundle(filteredReports, `crisismap-gis-bundle-${new Date().toISOString().split('T')[0]}.zip`)
      showToast(
        (localTranslations[lang]?.exportShapefileSuccessToast || localTranslations['en'].exportShapefileSuccessToast).replace('{{count}}', filteredReports.length),
        'success'
      )
    } catch (err) {
      console.error('[ExportPage] Export Shapefile ZIP failed:', err)
      showToast(localTranslations[lang]?.exportShapefileFailToast || localTranslations['en'].exportShapefileFailToast, 'error')
    }
  }

  // Preview reports list
  const previewReports = useMemo(() => {
    return filteredReports.slice(0, 5)
  }, [filteredReports])

  return (
    <div className="export-page fade-in">
      <div className="export-page__header">
        <h1 className="export-page__title">{translations[lang].exportTitle || 'Export Crisis Data'}</h1>
        <p className="export-page__subtitle">
          {translations[lang].exportSubtitle || 'Download structured crisis damage reports for GIS mapping, spreadsheet analysis, or humanitarian coordination.'}
        </p>
      </div>

      {/* Filter Section Card */}
      <section className="export-page__filters-card glass-panel">
        {/* Date Filter */}
        <div className="export-page__filter-group">
          <h2 className="export-page__filter-label">{translations[lang].exportDateRange || 'Date Range'}</h2>
          <div className="export-page__checkbox-list">
            <label className="export-page__checkbox-item">
              <input 
                type="radio" 
                name="export-date" 
                checked={dateRange === 'all'} 
                onChange={() => setDateRange('all')}
              />
              <span>{translations[lang].exportAllTime || 'All Time'}</span>
            </label>
            <label className="export-page__checkbox-item">
              <input 
                type="radio" 
                name="export-date" 
                checked={dateRange === '24h'} 
                onChange={() => setDateRange('24h')}
              />
              <span>{translations[lang].export24Hours || 'Last 24 Hours'}</span>
            </label>
            <label className="export-page__checkbox-item">
              <input 
                type="radio" 
                name="export-date" 
                checked={dateRange === '48h'} 
                onChange={() => setDateRange('48h')}
              />
              <span>{translations[lang].export48Hours || 'Last 48 Hours'}</span>
            </label>
            <label className="export-page__checkbox-item">
              <input 
                type="radio" 
                name="export-date" 
                checked={dateRange === 'week'} 
                onChange={() => setDateRange('week')}
              />
              <span>{translations[lang].export7Days || 'Last 7 Days'}</span>
            </label>
            <label className="export-page__checkbox-item">
              <input 
                type="radio" 
                name="export-date" 
                checked={dateRange === 'custom'} 
                onChange={() => setDateRange('custom')}
              />
              <span>{translations[lang].exportCustomRange || 'Custom Range'}</span>
            </label>
          </div>
          {dateRange === 'custom' && (
            <div className="export-page__custom-dates fade-in">
              <div className="export-page__input-container">
                <label className="export-page__input-label" htmlFor="export-start-date">{translations[lang].exportStartDate || 'Start Date'}</label>
                <input 
                  type="date" 
                  id="export-start-date"
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                  className="export-page__date-input"
                />
              </div>
              <div className="export-page__input-container">
                <label className="export-page__input-label" htmlFor="export-end-date">{translations[lang].exportEndDate || 'End Date'}</label>
                <input 
                  type="date" 
                  id="export-end-date"
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)} 
                  className="export-page__date-input"
                />
              </div>
              {startDate && endDate && startDate > endDate && (
                <div className="export-page__validation-error">
                  {translations[lang].exportStartAfterEnd || '⚠️ Start date cannot be after end date.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Severity Checkboxes */}
        <div className="export-page__filter-group">
          <h2 className="export-page__filter-label">{translations[lang].exportSeverityLevel || 'Severity Level'}</h2>
          <div className="export-page__checkbox-list">
            {DAMAGE_LEVELS.map(level => (
              <label key={level.value} className="export-page__checkbox-item">
                <input 
                  type="checkbox"
                  checked={selectedDamageLevels[level.value]}
                  onChange={() => handleCheckboxChange(level.value)}
                />
                <span>{level.icon} {translations[lang][`dmgCard${level.value.charAt(0).toUpperCase() + level.value.slice(1)}Title`] || level.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Infrastructure Type Dropdown */}
        <div className="export-page__filter-group">
          <h2 className="export-page__filter-label" htmlFor="export-infra">{translations[lang].exportInfraType || 'Infrastructure Type'}</h2>
          <select 
            id="export-infra" 
            className="export-page__select"
            value={selectedInfraType}
            onChange={(e) => setSelectedInfraType(e.target.value)}
          >
            <option value="">{translations[lang].exportAllTypes || 'All Types'}</option>
            {INFRASTRUCTURE_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.icon} {translations[lang][type.value] || type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Region Dropdown */}
        <div className="export-page__filter-group">
          <h2 className="export-page__filter-label" htmlFor="export-region">{lang === 'es' ? 'Región / Ciudad' : lang === 'fr' ? 'Région / Ville' : 'Region / City'}</h2>
          <select 
            id="export-region" 
            className="export-page__select"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
          >
            <option value="all">{lang === 'es' ? 'Todas las regiones' : lang === 'fr' ? 'Toutes les régions' : 'All Regions'}</option>
            {availableRegions.map(region => (
              <option key={region} value={region}>
                📍 {region}
              </option>
            ))}
          </select>
        </div>

        {/* Matching Count Summary */}
        <div className="export-page__matching-count">
          <span>🔍</span>
          <span>
            {(translations[lang].exportMatchingCount || 'Found {{count}} matching reports out of {{total}} total entries.')
              .replace('{{count}}', filteredReports.length)
              .replace('{{total}}', reports.length)}
          </span>
        </div>
      </section>

      {/* Export Format Cards */}
      <section className="export-page__formats">
        {/* CSV Format */}
        <div className="format-card glass-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="format-card__header">
              <span className="format-card__icon">📄</span>
              <h2 className="format-card__title">{translations[lang].exportCsvTitle || 'CSV (Spreadsheet)'}</h2>
            </div>
            <p className="format-card__description">
              {translations[lang].exportCsvDesc || 'Tabular spreadsheet containing coordinates, severity ratings, descriptions, timestamps, and address metadata. Compatible with Microsoft Excel, Google Sheets, and data tools.'}
            </p>
          </div>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={handleExportCSV}
            disabled={filteredReports.length === 0}
          >
            {translations[lang].exportCsvBtn || 'Download CSV 📥'}
          </button>
        </div>

        {/* GeoJSON Format */}
        <div className="format-card glass-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="format-card__header">
              <span className="format-card__icon">🌐</span>
              <h2 className="format-card__title">{translations[lang].exportGeoJsonTitle || 'GeoJSON (GIS Layer)'}</h2>
            </div>
            <p className="format-card__description">
              {translations[lang].exportGeoJsonDesc || 'Geographic coordinates formatted as standard GeoJSON feature collections. Ideal for direct import as vector layers in GIS platforms like QGIS, ArcGIS, and custom web maps.'}
            </p>
          </div>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={handleExportGeoJSON}
            disabled={filteredReports.length === 0}
          >
            {translations[lang].exportGeoJsonBtn || 'Download GeoJSON 📥'}
          </button>
        </div>

        {/* Shapefile Bundle ZIP Format */}
        <div className="format-card glass-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="format-card__header">
              <span className="format-card__icon">📦</span>
              <h2 className="format-card__title">{localTranslations[lang]?.exportShapefileTitle || localTranslations['en'].exportShapefileTitle}</h2>
            </div>
            <p className="format-card__description">
              {localTranslations[lang]?.exportShapefileDesc || localTranslations['en'].exportShapefileDesc}
            </p>
          </div>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={handleExportShapefile}
            disabled={filteredReports.length === 0}
          >
            {localTranslations[lang]?.exportShapefileBtn || localTranslations['en'].exportShapefileBtn}
          </button>
        </div>
      </section>

      {/* Data Preview (Top 5 Rows) */}
      <section className="export-page__preview glass-panel">
        <h2 className="export-page__preview-title">{translations[lang].exportPreviewTitle || 'Data Preview (First 5 Rows)'}</h2>
        <div className="table-responsive">
          <table className="preview-table">
            <thead>
              <tr>
                <th>{translations[lang].exportColDateTime || 'Date / Time'}</th>
                <th>{translations[lang].exportColLocDetails || 'Location Details'}</th>
                <th>{translations[lang].exportColDmgLevel || 'Damage Level'}</th>
                <th>{translations[lang].exportColInfraType || 'Infra Type'}</th>
                <th>{translations[lang].labelCrisisNature || 'Crisis Nature'}</th>
                <th>{translations[lang].labelDebrisClearing || 'Debris Clearing'}</th>
                <th>{translations[lang].exportColDesc || 'Description'}</th>
              </tr>
            </thead>
            <tbody>
              {previewReports.length > 0 ? (
                previewReports.map(report => {
                  const date = parseDate(report.timestamp).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                  
                  // Map legacy levels if present
                  let normalizedLevel = report.damageLevel
                  if (normalizedLevel === 'none') normalizedLevel = 'minimal'
                  if (normalizedLevel === 'minor' || normalizedLevel === 'major') normalizedLevel = 'partial'
                  if (normalizedLevel === 'destroyed') normalizedLevel = 'complete'
                  const damage = DAMAGE_LEVELS.find(l => l.value === normalizedLevel)

                  // Support array infrastructureType
                  const infraArray = Array.isArray(report.infrastructureType) 
                    ? report.infrastructureType 
                    : report.infrastructureType 
                    ? [report.infrastructureType] 
                    : []
                  
                  const infraLabels = infraArray.map(val => {
                    const found = INFRASTRUCTURE_TYPES.find(t => t.value === val)
                    return found ? `${found.icon} ${translations[lang][val] || found.label}` : val
                  }).join(', ')

                  return (
                    <tr key={report.id}>
                      <td>{date}</td>
                      <td>
                        <span style={{ fontWeight: '500' }}>
                          {report.latitude?.toFixed(4)}, {report.longitude?.toFixed(4)}
                        </span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                          {report.address}
                        </div>
                      </td>
                      <td>
                        <span style={{ color: damage?.color, fontWeight: '700' }}>
                          {damage?.icon} {translations[lang][`dmgCard${normalizedLevel.charAt(0).toUpperCase() + normalizedLevel.slice(1)}Title`] || damage?.label}
                        </span>
                      </td>
                      <td>
                        {infraLabels || '-'}
                      </td>
                      <td>
                        {report.crisisNature 
                          ? (Array.isArray(report.crisisNature) 
                              ? report.crisisNature.map(n => translations[lang][`crisis${n.charAt(0).toUpperCase() + n.slice(1)}`] || n).join(', ')
                              : (translations[lang][`crisis${report.crisisNature.charAt(0).toUpperCase() + report.crisisNature.slice(1)}`] || report.crisisNature))
                          : '-'}
                      </td>
                      <td>
                        {report.needsDebrisClearing === true ? `⚠️ ${translations[lang].debrisClearingYes || 'Yes'}` : report.needsDebrisClearing === false ? `✅ ${translations[lang].debrisClearingNo || 'No'}` : '-'}
                      </td>
                      <td title={report.description}>{report.description || <em>{translations[lang].msgNoDescription || 'No description provided.'}</em>}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                    {translations[lang].exportNoMatching || 'No reports match the selected filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* REST API Integration Guide */}
      <section className="export-page__api glass-panel">
        <h2 className="export-page__preview-title">{localTranslations[lang]?.apiTitle || localTranslations['en'].apiTitle}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '4px', fontSize: '0.9rem', lineHeight: '1.5' }}>
          {localTranslations[lang]?.apiSubtitle || localTranslations['en'].apiSubtitle}
        </p>
        
        <div className="export-page__api-details">
          <div className="export-page__input-container" style={{ width: '100%' }}>
            <label className="export-page__input-label">{localTranslations[lang]?.apiEndpoint || localTranslations['en'].apiEndpoint}</label>
            <div className="export-page__api-endpoint-bar">
              <code>{`https://firestore.googleapis.com/v1/projects/${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'crisismap-default-db'}/databases/(default)/documents:runQuery`}</code>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: '0.75rem' }}
                onClick={() => {
                  const url = `https://firestore.googleapis.com/v1/projects/${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'crisismap-default-db'}/databases/(default)/documents:runQuery`
                  navigator.clipboard.writeText(url)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? (localTranslations[lang]?.apiCopied || localTranslations['en'].apiCopied) : (localTranslations[lang]?.apiCopy || localTranslations['en'].apiCopy)}
              </button>
            </div>
          </div>
          
          <div className="export-page__api-schema-grid">
            <div className="schema-block">
              <span className="schema-block__title">Request Query Body (JSON POST)</span>
              <pre className="schema-pre">
{`{
  "structuredQuery": {
    "from": [{ "collectionId": "reports" }],
    "where": {
      "fieldFilter": {
        "field": { "fieldPath": "status" },
        "op": "EQUAL",
        "value": { "stringValue": "verified" }
      }
    }
  }
}`}
              </pre>
            </div>
            
            <div className="schema-block">
              <span className="schema-block__title">Response Schema Sample (JSON)</span>
              <pre className="schema-pre">
{`[
  {
    "document": {
      "name": "projects/${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'crisismap-default-db'}/databases/(default)/documents/reports/rep_1234",
      "fields": {
        "id": { "stringValue": "rep_1234" },
        "timestamp": { "stringValue": "2026-06-23T16:00:00Z" },
        "latitude": { "doubleValue": 33.8938 },
        "longitude": { "doubleValue": 35.5018 },
        "damageLevel": { "stringValue": "partial" },
        "infrastructureType": { "arrayValue": { "values": [{ "stringValue": "residential" }] } },
        "description": { "stringValue": "Cracked load-bearing walls" }
      }
    }
  }
]`}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default ExportPage
