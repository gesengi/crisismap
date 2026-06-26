import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

import { getReports, subscribeToReports } from '../services/reportService'
import ReportCard from '../components/ReportCard.jsx'
import { DAMAGE_LEVELS, INFRASTRUCTURE_TYPES } from '../utils/constants'
import { findBuildingById, getFootprintsAround } from '../utils/mockFootprints'
import { translations } from '../utils/translations'
import './MapDashboard.css'

// ─── Generate Mock Data if database is empty ─────────────────────────────────
const generateMockDamageImage = (damageLevel) => {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = 224
  canvas.height = 224
  const ctx = canvas.getContext('2d')

  // Draw background gradient based on severity
  const grad = ctx.createLinearGradient(0, 0, 0, 224)
  if (damageLevel === 'minimal') {
    grad.addColorStop(0, '#3b82f6') // Sky blue
    grad.addColorStop(1, '#93c5fd')
  } else if (damageLevel === 'partial') {
    grad.addColorStop(0, '#eab308') // Yellow sky
    grad.addColorStop(1, '#fef08a')
  } else { // complete
    grad.addColorStop(0, '#6b7280') // Dusty gray sky
    grad.addColorStop(1, '#cbd5e1')
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 224, 224)

  // Draw ground
  ctx.fillStyle = damageLevel === 'complete' ? '#4b5563' : '#15803d'
  ctx.fillRect(0, 160, 224, 64)

  if (damageLevel === 'complete') {
    // Draw debris stack (collapsed house rubble)
    ctx.fillStyle = '#9ca3af'
    ctx.beginPath()
    ctx.moveTo(30, 170)
    ctx.lineTo(80, 120)
    ctx.lineTo(140, 140)
    ctx.lineTo(200, 180)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#4b5563'
    ctx.beginPath()
    ctx.moveTo(70, 180)
    ctx.lineTo(110, 130)
    ctx.lineTo(160, 150)
    ctx.lineTo(180, 180)
    ctx.closePath()
    ctx.fill()

    // Add wooden beams / wreckage lines (high edge density)
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(50, 160)
    ctx.lineTo(130, 110)
    ctx.moveTo(110, 170)
    ctx.lineTo(80, 120)
    ctx.moveTo(140, 150)
    ctx.lineTo(170, 110)
    ctx.stroke()

    // Add text label inside image
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('DESTROYED STRUCTURE', 40, 40)
  } else {
    // Draw building
    // Roof
    ctx.fillStyle = '#b91c1c'
    ctx.beginPath()
    ctx.moveTo(112, 50)
    ctx.lineTo(40, 90)
    ctx.lineTo(184, 90)
    ctx.closePath()
    ctx.fill()

    // Walls
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(50, 90, 124, 70)

    // Door
    ctx.fillStyle = '#78350f'
    ctx.fillRect(97, 120, 30, 40)

    // Windows
    ctx.fillStyle = '#93c5fd'
    ctx.fillRect(65, 105, 20, 20)
    ctx.fillRect(139, 105, 20, 20)

    if (damageLevel === 'partial') {
      // Draw small cracks (thin black lines)
      ctx.strokeStyle = '#1f2937'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(55, 95)
      ctx.lineTo(62, 105)
      ctx.lineTo(60, 115)
      ctx.moveTo(150, 120)
      ctx.lineTo(155, 135)
      ctx.stroke()

      ctx.fillStyle = '#000000'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('PARTIALLY DAMAGED', 68, 40)
    } else {
      // Clean status label
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText('NO VISIBLE DAMAGE', 52, 40)
    }
  }

  // Add random texture noise to simulate real photographic complexity
  const imgData = ctx.getImageData(0, 0, 224, 224)
  const data = imgData.data
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 15
    data[i] = Math.max(0, Math.min(255, data[i] + noise))
    data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise))
    data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise))
  }
  ctx.putImageData(imgData, 0, 0)

  return canvas.toDataURL('image/jpeg', 0.8)
}

const generateMockReports = () => {
  const levels = ['minimal', 'partial', 'complete']
  const types = ['residential', 'commercial', 'government', 'utility', 'transport', 'community', 'public_spaces', 'other']
  
  const descsByLevel = {
    minimal: [
      'Structure inspected. No structural or cosmetic damage observed. Intact.',
      'Facility operates normally. Checked for minor leaks, all clear.',
      'Evaluated structure safety: safe. Re-occupying.'
    ],
    partial: [
      'Cosmetic wall cracks and minor plaster peeling. Structure remains stable.',
      'Shallow cracks in drywall. A few shattered window panes.',
      'Minor water seepage along floor joints. Roof tiling undamaged.',
      'Severe concrete spalling on columns. Partial ceiling collapses.',
      'Major structural fractures in load-bearing walls. Evacuated.',
      'Bridge deck shifted slightly. Blocked off for vehicle safety.'
    ],
    complete: [
      'Total structural failure. Roof and floors completely collapsed.',
      'Structure reduced to debris heap. Active rescue triage.',
      'Hospital wing crumbled entirely. Debris clearing in progress.'
    ]
  }

  const mockReports = []

  // Snapped building footprint reports (overlapping version histories)
  const footprintScenarios = [
    {
      buildingId: 'building-nairobi-1',
      name: 'Nairobi Town Hall',
      address: 'Nairobi Town Hall, City Hall Way, Nairobi, Kenya',
      type: 'government',
      nature: 'earthquake',
      versions: [
        {
          delayHours: 48,
          level: 'partial',
          debris: false,
          desc: 'Small cosmetic plaster cracks on the outer columns. Structure appears fully safe.'
        },
        {
          delayHours: 24,
          level: 'partial',
          debris: false,
          desc: 'Earthquake tremors have worsened column cracking. Concrete chunks fell from the ceiling. Entry restricted.'
        },
        {
          delayHours: 4,
          level: 'complete',
          debris: true,
          desc: 'Main hall collapsed after severe aftershocks. Debris blocking City Hall Way. Active search and rescue.'
        }
      ]
    },
    {
      buildingId: 'building-nairobi-3',
      name: 'Community Health Center',
      address: 'Community Health Center, Ngong Rd, Nairobi, Kenya',
      type: 'community',
      nature: 'earthquake',
      versions: [
        {
          delayHours: 20,
          level: 'minimal',
          debris: false,
          desc: 'Facility inspected. No structural or cosmetic damage observed.'
        },
        {
          delayHours: 2,
          level: 'partial',
          debris: false,
          desc: 'Window glazing shattered in the north wing. Plaster dust on floors, but structure remains stable.'
        }
      ]
    },
    {
      buildingId: 'building-haiti-2',
      name: 'St. Francois de Sales Hospital',
      address: 'St. Francois de Sales Hospital, Rue Chareron, Port-au-Prince, Haiti',
      type: 'community',
      nature: 'earthquake',
      versions: [
        {
          delayHours: 72,
          level: 'partial',
          debris: false,
          desc: 'Minor cosmetic damage. Plaster cracks inside wards.'
        },
        {
          delayHours: 12,
          level: 'partial',
          debris: true,
          desc: 'Structural beams cracked. Emergency room roof collapsed partially. Patients evacuated to courtyard tents.'
        }
      ]
    }
  ]

  let mockIdx = 1
  footprintScenarios.forEach(scen => {
    const feature = findBuildingById(scen.buildingId)
    const centroid = feature ? feature.properties.centroid : [-1.278, 36.818]
    
    scen.versions.forEach(v => {
      mockReports.push({
        id: `mock-${mockIdx++}`,
        damageLevel: v.level,
        infrastructureType: scen.type,
        infrastructureName: scen.name,
        crisisNature: scen.nature,
        needsDebrisClearing: v.debris,
        description: v.desc,
        latitude: centroid[0],
        longitude: centroid[1],
        address: scen.address,
        buildingId: scen.buildingId,
        timestamp: new Date(Date.now() - v.delayHours * 60 * 60 * 1000).toISOString(),
        photos: [generateMockDamageImage(v.level)],
        isAnonymized: true,
        synced: true,
        status: 'pending'
      })
    })
  })

  // Add 15 general non-snapped mock reports for other cities
  const otherCenters = [
    { name: 'Istanbul, Turkey', coords: [41.01, 28.98] },
    { name: 'Manila, Philippines', coords: [14.60, 120.98] },
    { name: 'Mexico City, Mexico', coords: [19.43, -99.13] }
  ]
  const natures = ['earthquake', 'flood', 'tsunami', 'hurricane', 'wildfire', 'explosion', 'chemical', 'conflict', 'civil_unrest']

  for (let i = 0; i < 15; i++) {
    const center = otherCenters[i % otherCenters.length]
    const latOffset = (Math.random() - 0.5) * 0.08
    const lngOffset = (Math.random() - 0.5) * 0.08
    const damageLevel = levels[Math.floor(Math.random() * levels.length)]
    const infrastructureType = types[Math.floor(Math.random() * types.length)]
    const descriptions = descsByLevel[damageLevel]
    const description = descriptions[Math.floor(Math.random() * descriptions.length)]
    const crisisNature = natures[Math.floor(Math.random() * natures.length)]
    const needsDebrisClearing = (damageLevel === 'complete') ? (Math.random() > 0.3) : (Math.random() > 0.85)

    mockReports.push({
      id: `mock-${mockIdx++}`,
      damageLevel,
      infrastructureType,
      infrastructureName: `Structure in ${center.name.split(',')[0]}`,
      crisisNature,
      needsDebrisClearing,
      description,
      latitude: center.coords[0] + latOffset,
      longitude: center.coords[1] + lngOffset,
      address: `Zone offset near ${center.name}`,
      buildingId: null,
      timestamp: new Date(Date.now() - Math.random() * 48 * 60 * 60 * 1000).toISOString(),
      photos: [generateMockDamageImage(damageLevel)],
      isAnonymized: true,
      synced: true,
      status: 'pending'
    })
  }

  return mockReports
}

// ─── Custom Colored Leaflet Icons ───────────────────────────────────────────
const createCustomIcon = (damageLevel) => {
  const meta = DAMAGE_LEVELS.find(level => level.value === damageLevel)
  const color = meta ? meta.color : '#6b7280'
  const emoji = meta ? meta.icon : '❓'
  
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color}; 
        width: 36px; 
        height: 36px; 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        border-radius: 50%; 
        border: 2px solid white; 
        box-shadow: 0 3px 8px rgba(0,0,0,0.4);
      ">
        <span style="font-size: 1.15rem; line-height: 1;">${emoji}</span>
      </div>
    `,
    className: 'custom-marker-pin-wrapper',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  })
}

const parseDate = (ts) => {
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

function MapFlyTo({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.flyTo(position, 15, { duration: 0.8 })
    }
  }, [position, map])
  return null
}

function MapViewportHandler({ onViewportChange }) {
  const map = useMapEvents({
    moveend: () => {
      const center = map.getCenter()
      onViewportChange([center.lat, center.lng])
    }
  })
  return null
}

function MapDashboard({ showToast, lang = 'en' }) {
  const [reports, setReports] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [now] = useState(() => Date.now())
  const [viewportCenter, setViewportCenter] = useState(null)
  const [flyToPosition, setFlyToPosition] = useState(null)

  const footprints = useMemo(() => {
    const center = viewportCenter || [0, 20]
    const base = getFootprintsAround(center[0], center[1])
    const mergedFeatures = [...base.features]
    
    reports.forEach((rep) => {
      if (rep.buildingId && !mergedFeatures.some((f) => f.id === rep.buildingId)) {
        const feature = findBuildingById(rep.buildingId)
        if (feature) {
          mergedFeatures.push(feature)
        }
      }
    })
    
    return {
      type: "FeatureCollection",
      features: mergedFeatures
    }
  }, [viewportCenter, reports])

  // ── Filter States ──
  const [selectedDamageLevels, setSelectedDamageLevels] = useState({
    minimal: true,
    partial: true,
    complete: true,
  })
  const [selectedInfraType, setSelectedInfraType] = useState('')
  const [dateFilter, setDateFilter] = useState('all') // '24h', '48h', 'week', 'all'

  // Load reports and seed mock data if empty, and subscribe to real-time updates
  useEffect(() => {
    const fetchAndLoad = async () => {
      try {
        const data = await getReports()
        if (data.length === 0) {
          const mocks = generateMockReports()
          localStorage.setItem('crisismap_reports', JSON.stringify(mocks))
          setReports(mocks)
          showToast('Generated 20 mock crisis reports for demonstration purposes.', 'info')
        }
      } catch (err) {
        console.error('[MapDashboard] Fetch reports failed:', err)
        showToast('Error loading damage reports.', 'error')
      }
    }
    fetchAndLoad()

    const unsubscribe = subscribeToReports((data) => {
      if (data && data.length > 0) {
        setReports(data)
      }
    })

    return () => unsubscribe()
  }, [showToast])

  // ── Filter Logic ──
  const handleCheckboxChange = (level) => {
    setSelectedDamageLevels(prev => ({
      ...prev,
      [level]: !prev[level]
    }))
  }

  const clearFilters = () => {
    setSelectedDamageLevels({
      minimal: true,
      partial: true,
      complete: true,
    })
    setSelectedInfraType('')
    setDateFilter('all')
    showToast('Filters cleared successfully.', 'info')
  }

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      // 1. Damage Level (with backwards-compatible mapping for legacy values)
      const mappedLevel = {
        none: 'minimal',
        minor: 'partial',
        major: 'partial',
        destroyed: 'complete',
        minimal: 'minimal',
        partial: 'partial',
        complete: 'complete'
      }[report.damageLevel] || 'minimal';

      if (!selectedDamageLevels[mappedLevel]) return false

      // 2. Infrastructure Type
      if (selectedInfraType && report.infrastructureType !== selectedInfraType) return false

      // 3. Date range
      if (dateFilter !== 'all') {
        const reportTime = parseDate(report.timestamp).getTime()
        const diffHours = (now - reportTime) / (1000 * 60 * 60)

        if (dateFilter === '24h' && diffHours > 24) return false
        if (dateFilter === '48h' && diffHours > 48) return false
        if (dateFilter === 'week' && diffHours > 168) return false
      }

      return true
    })
  }, [reports, selectedDamageLevels, selectedInfraType, dateFilter, now])

  const groupedMapData = useMemo(() => {
    const groups = {}
    const generalReports = []

    filteredReports.forEach(report => {
      if (report.buildingId) {
        if (!groups[report.buildingId]) {
          groups[report.buildingId] = []
        }
        groups[report.buildingId].push(report)
      } else {
        generalReports.push(report)
      }
    })

    // Sort each building group newest first
    Object.keys(groups).forEach(bId => {
      groups[bId].sort((a, b) => parseDate(b.timestamp).getTime() - parseDate(a.timestamp).getTime())
    })

    return { groups, generalReports }
  }, [filteredReports])

  const getFeatureStyle = (feature) => {
    const buildingReports = groupedMapData.groups[feature.id]
    if (buildingReports && buildingReports.length > 0) {
      const newestReport = buildingReports[0]
      const damageMeta = DAMAGE_LEVELS.find(l => l.value === newestReport.damageLevel)
      const color = damageMeta ? damageMeta.color : '#3b82f6'
      return {
        color: color,
        weight: 2.5,
        fillColor: color,
        fillOpacity: 0.45
      }
    }
    
    return {
      color: 'var(--color-border-strong, #4b5563)',
      weight: 1.5,
      fillColor: 'transparent',
      fillOpacity: 0,
      dashArray: '3'
    }
  }

  return (
    <div className="map-dashboard fade-in">
      {/* Sidebar Filters Toggle Button */}
      <button 
        type="button" 
        className={`map-dashboard__toggle-btn btn btn-ghost btn-sm ${sidebarOpen ? 'map-dashboard__toggle-btn--active' : ''}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle filter settings"
      >
        <span>🔍</span>
        <span>{sidebarOpen ? (lang === 'es' ? 'Ocultar filtros' : lang === 'fr' ? 'Masquer les filtres' : 'Hide Filters') : (lang === 'es' ? 'Mostrar filtros' : lang === 'fr' ? 'Afficher les filtres' : 'Show Filters')}</span>
      </button>

      {/* Filter Sidebar (Collapsible) */}
      <aside className={`map-dashboard__sidebar glass-panel ${!sidebarOpen ? 'map-dashboard__sidebar--collapsed' : ''}`}>
        <div className="map-dashboard__sidebar-header">
          <h2 className="map-dashboard__sidebar-title">{translations[lang].navMap} {translations[lang].mapFilters || 'Filters'}</h2>
          <span>⚙️</span>
        </div>

        {/* Damage Level Checkboxes */}
        <div className="map-dashboard__filter-group">
          <label className="map-dashboard__filter-label">{translations[lang].stepDetail}</label>
          <div className="map-dashboard__checkbox-list">
            {DAMAGE_LEVELS.map(level => (
              <label key={level.value} className="map-dashboard__checkbox-item">
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

        {/* Infrastructure Dropdown */}
        <div className="map-dashboard__filter-group">
          <label className="map-dashboard__filter-label" htmlFor="filter-infra">{translations[lang].infraLabel || 'Infrastructure Type'}</label>
          <select 
            id="filter-infra" 
            className="map-dashboard__select"
            value={selectedInfraType}
            onChange={(e) => setSelectedInfraType(e.target.value)}
          >
            <option value="">{lang === 'es' ? 'Todos los tipos' : lang === 'fr' ? 'Tous les types' : 'All Types'}</option>
            {INFRASTRUCTURE_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.icon} {translations[lang][type.value] || type.label}
              </option>
            ))}
          </select>
        </div>


        {/* Date Filter Radio Buttons */}
        <div className="map-dashboard__filter-group">
          <label className="map-dashboard__filter-label">{translations[lang].mapTimePeriod || 'Time Period'}</label>
          <div className="map-dashboard__checkbox-list">
            <label className="map-dashboard__checkbox-item">
              <input 
                type="radio" 
                name="date-filter" 
                checked={dateFilter === 'all'} 
                onChange={() => setDateFilter('all')}
              />
              <span>{translations[lang].mapAllReports || 'All Reports'}</span>
            </label>
            <label className="map-dashboard__checkbox-item">
              <input 
                type="radio" 
                name="date-filter" 
                checked={dateFilter === '24h'} 
                onChange={() => setDateFilter('24h')}
              />
              <span>{translations[lang].mapLast24h || 'Last 24 Hours'}</span>
            </label>
            <label className="map-dashboard__checkbox-item">
              <input 
                type="radio" 
                name="date-filter" 
                checked={dateFilter === '48h'} 
                onChange={() => setDateFilter('48h')}
              />
              <span>{translations[lang].mapLast48h || 'Last 48 Hours'}</span>
            </label>
            <label className="map-dashboard__checkbox-item">
              <input 
                type="radio" 
                name="date-filter" 
                checked={dateFilter === 'week'} 
                onChange={() => setDateFilter('week')}
              />
              <span>{translations[lang].mapLast7d || 'Last 7 Days'}</span>
            </label>
          </div>
        </div>

        {/* Sidebar Footer Stats & Action */}
        <div className="map-dashboard__stats">
          <div>
            {(translations[lang].mapShowingReports || 'Showing {{count}} of {{total}} reports')
              .replace('{{count}}', filteredReports.length)
              .replace('{{total}}', reports.length)}
          </div>
          <button 
            type="button" 
            className="btn btn-ghost btn-sm"
            onClick={clearFilters}
            style={{ fontSize: '0.78rem', padding: '6px 10px' }}
          >
            {translations[lang].mapReset || 'Reset'}
          </button>
        </div>
      </aside>

      {/* Full-Screen Map Container */}
      <main className="map-dashboard__map-wrap">
        <MapContainer 
          center={[10, 20]} 
          zoom={3} 
          zoomControl={true}
          className="map-dashboard__map"
        >
          <TileLayer 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
            <MapFlyTo position={flyToPosition} />
            <MapViewportHandler onViewportChange={setViewportCenter} />
            <GeoJSON 
              key={`footprints-${footprints.features.length}-${viewportCenter ? viewportCenter[0] : 0}-${viewportCenter ? viewportCenter[1] : 20}`}
              data={footprints}
              style={getFeatureStyle}
            />
            {/* Grouped building footprint markers */}
            {Object.entries(groupedMapData.groups).map(([bId, buildingReports]) => {
              if (buildingReports.length === 0) return null
              const newestReport = buildingReports[0]
              const feature = findBuildingById(bId)
              const position = feature ? [feature.properties.centroid[0], feature.properties.centroid[1]] : [newestReport.latitude, newestReport.longitude]
            
            return (
              <Marker 
                key={bId}
                position={position} 
                icon={createCustomIcon(newestReport.damageLevel)}
              >
                <Popup closeButton={false}>
                  <ReportCard reports={buildingReports} lang={lang} />
                </Popup>
              </Marker>
            )
          })}

          {/* General non-snapped individual markers */}
          {groupedMapData.generalReports.map(report => (
            <Marker 
              key={report.id}
              position={[report.latitude, report.longitude]} 
              icon={createCustomIcon(report.damageLevel)}
            >
              <Popup closeButton={false}>
                <ReportCard report={report} lang={lang} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </main>

      {/* Floating Map Legend */}
      <div className="map-dashboard__legend glass-panel">
        <div className="map-dashboard__legend-title">{translations[lang].mapLegend || 'Legend'}</div>
        {DAMAGE_LEVELS.map(level => (
          <div key={level.value} className="map-dashboard__legend-item">
            <span className="map-dashboard__legend-dot" style={{ backgroundColor: level.color }} />
            <span>{translations[lang][`dmgCard${level.value.charAt(0).toUpperCase() + level.value.slice(1)}Title`] || level.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MapDashboard
