import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap, GeoJSON } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { findBuildingById, getFootprintsAround } from '../utils/mockFootprints'
import { translations } from '../utils/translations'
import './LocationPicker.css'

// ─── Fix Leaflet default marker icons (broken by bundlers) ───────────────────

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

/** Default fallback: Nairobi, Kenya */
const DEFAULT_POSITION = [-1.2921, 36.8219]

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// ─── Internal: Map click handler ─────────────────────────────────────────────

/**
 * Listens for map click events and forwards the new position.
 */
function MapClickHandler({ onLocationChange }) {
  useMapEvents({
    click(e) {
      onLocationChange([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

/**
 * Recenter map when position changes externally (GPS, etc.).
 */
function MapRecenter({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.flyTo(position, map.getZoom(), { duration: 0.8 })
    }
  }, [position, map])
  return null
}

// ─── LocationPicker Component ────────────────────────────────────────────────

/**
 * LocationPicker — Interactive Leaflet map with GPS detection and geocoding.
 *
 * @param {Object}   props
 * @param {[number, number]} props.position - [lat, lng] of the marker.
 * @param {Function} props.onPositionChange - Callback: receives [lat, lng].
 * @param {string}   props.address - Current reverse-geocoded address.
 * @param {Function} props.onAddressChange - Callback: receives address string.
 */
function LocationPicker({
  position,
  onPositionChange,
  address,
  onAddressChange,
  landmarkDescription = '',
  onLandmarkChange,
  buildingId = null,
  onBuildingIdChange,
  lang = 'en'
}) {
  const [isLocating, setIsLocating] = useState(false)
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false)
  const [selectedBuildingName, setSelectedBuildingName] = useState('')
  const geocodeTimerRef = useRef(null)
  const hasAutoLocated = useRef(false)

  // Sync selectedBuildingName when buildingId changes externally
  useEffect(() => {
    if (buildingId) {
      const feature = findBuildingById(buildingId)
      if (feature) {
        Promise.resolve().then(() => {
          setSelectedBuildingName(feature.properties.name)
        })
      }
    } else {
      Promise.resolve().then(() => {
        setSelectedBuildingName('')
      })
    }
  }, [buildingId])

  // Attach event handler to each building footprint polygon
  const onEachFeature = (feature, layer) => {
    layer.on({
      click: (e) => {
        L.DomEvent.stopPropagation(e)
        const { centroid, name, address: buildingAddress } = feature.properties
        if (centroid) {
          onPositionChange([centroid[0], centroid[1]])
          onAddressChange(`${name}, ${buildingAddress}`)
          if (onBuildingIdChange) onBuildingIdChange(feature.id)
        }
      }
    })
  }

  // ── Auto-detect GPS on mount ──
  useEffect(() => {
    if (hasAutoLocated.current) return
    hasAutoLocated.current = true

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos = [pos.coords.latitude, pos.coords.longitude]
          onPositionChange(newPos)
        },
        () => {
          // GPS unavailable — use default
          if (!position) {
            onPositionChange(DEFAULT_POSITION)
          }
        },
        { enableHighAccuracy: true, timeout: 8000 }
      )
    } else if (!position) {
      onPositionChange(DEFAULT_POSITION)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reverseGeocode = async (lat, lng) => {
    setIsGeocodingAddress(true)
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          headers: { 'Accept-Language': 'en' },
        }
      )
      if (!resp.ok) throw new Error('Geocode request failed')
      const data = await resp.json()
      onAddressChange(data.display_name || 'Address not found')
    } catch {
      onAddressChange('Unable to determine address')
    } finally {
      setIsGeocodingAddress(false)
    }
  }

  // ── Reverse geocode whenever position changes ──
  useEffect(() => {
    if (!position) return

    // Debounce geocoding
    clearTimeout(geocodeTimerRef.current)
    geocodeTimerRef.current = setTimeout(() => {
      reverseGeocode(position[0], position[1])
    }, 500)

    return () => clearTimeout(geocodeTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.[0], position?.[1]])

  // ── "Use My Location" button ──
  const handleUseMyLocation = useCallback(() => {
    if (!('geolocation' in navigator)) return

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPositionChange([pos.coords.latitude, pos.coords.longitude])
        setIsLocating(false)
      },
      () => {
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [onPositionChange])

  // Handle map / marker click
  const handleLocationChange = useCallback(
    (newPos) => {
      onPositionChange(newPos)
    },
    [onPositionChange]
  )

  const currentPosition = position || DEFAULT_POSITION

  const lat = currentPosition[0]
  const lng = currentPosition[1]

  const footprints = useMemo(() => {
    return getFootprintsAround(lat, lng)
  }, [lat, lng])

  return (
    <div className="location-picker">
      {/* Map */}
      <div className="location-picker__map-wrap">
        <MapContainer
          center={currentPosition}
          zoom={15}
          className="location-picker__map"
          scrollWheelZoom={true}
        >
          <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
          <GeoJSON 
            key={`footprints-${footprints.features.length}-${currentPosition[0]}-${currentPosition[1]}`}
            data={footprints} 
            style={() => ({
              color: 'var(--color-safety, #3b82f6)',
              weight: 2,
              fillColor: 'var(--color-safety, #3b82f6)',
              fillOpacity: 0.25,
              dashArray: '4'
            })}
            onEachFeature={onEachFeature}
          />
          <Marker
            position={currentPosition}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const latlng = e.target.getLatLng()
                handleLocationChange([latlng.lat, latlng.lng])
                if (onBuildingIdChange) onBuildingIdChange(null)
              },
            }}
          />
          <MapClickHandler onLocationChange={(pos) => {
            handleLocationChange(pos)
            if (onBuildingIdChange) onBuildingIdChange(null)
          }} />
          <MapRecenter position={currentPosition} />
        </MapContainer>
        
        {/* Floating Jump to Footprints Hotspots */}
        <div className="location-picker__jump-bar">
          <span className="location-picker__jump-title">
            🗺️ {translations[lang].jumpToFootprints || 'Jump to Footprints:'}
          </span>
          <div className="location-picker__jump-btns">
            <button
              type="button"
              className="location-picker__jump-btn"
              onClick={() => handleLocationChange([-1.279, 36.820])}
            >
              Nairobi
            </button>
            <button
              type="button"
              className="location-picker__jump-btn"
              onClick={() => handleLocationChange([18.540, -72.340])}
            >
              Port-au-Prince
            </button>
          </div>
        </div>
      </div>

      {/* Selected Footprint Feedback */}
      <div className="location-picker__building-status">
        <strong>🏢 {translations[lang].buildingSelected}</strong>{' '}
        <span style={{ color: selectedBuildingName ? 'var(--color-safety)' : 'var(--color-text-tertiary)', fontWeight: '600' }}>
          {selectedBuildingName || translations[lang].noBuildingSelected}
        </span>
      </div>

      {/* Coordinates */}
      <div className="location-picker__coords">
        <div className="location-picker__coord-item">
          <span className="location-picker__coord-label">Lat</span>
          <span className="location-picker__coord-value">
            {currentPosition[0].toFixed(6)}
          </span>
        </div>
        <span className="location-picker__coord-sep" aria-hidden="true" />
        <div className="location-picker__coord-item">
          <span className="location-picker__coord-label">Lng</span>
          <span className="location-picker__coord-value">
            {currentPosition[1].toFixed(6)}
          </span>
        </div>
      </div>

      {/* Address */}
      <div
        className={`location-picker__address${
          isGeocodingAddress ? ' location-picker__address--loading' : ''
        }`}
      >
        <span className="location-picker__address-icon" aria-hidden="true">
          📍
        </span>
        <span className="location-picker__address-text">
          {isGeocodingAddress
            ? 'Looking up address…'
            : address || translations[lang].tapFootprint}
        </span>
      </div>

      {/* Landmark Text Fallback */}
      <div className="location-picker__landmark-group">
        <label className="location-picker__landmark-label" htmlFor="landmark-input">
          🗺️ {translations[lang].landmarkLabel}
        </label>
        <input 
          type="text" 
          id="landmark-input"
          value={landmarkDescription}
          onChange={(e) => onLandmarkChange(e.target.value)}
          placeholder={translations[lang].landmarkPlaceholder}
          className="location-picker__landmark-input"
        />
      </div>

      {/* GPS Button */}
      <button
        type="button"
        className={`location-picker__gps-btn${
          isLocating ? ' location-picker__gps-btn--locating' : ''
        }`}
        onClick={handleUseMyLocation}
        disabled={isLocating}
        aria-label="Use my current GPS location"
      >
        <span className="location-picker__gps-btn-icon" aria-hidden="true">
          📡
        </span>
        {isLocating ? translations[lang].gpsLocating : translations[lang].gpsUseMy}
      </button>

      <p className="location-picker__note">
        Drag the marker or tap the map to adjust the location. GPS accuracy may
        vary depending on your device.
      </p>
    </div>
  )
}

export default LocationPicker
