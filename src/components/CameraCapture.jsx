import { useState, useRef, useCallback } from 'react'
import { translations } from '../utils/translations'
import './CameraCapture.css'

/**
 * CameraCapture - Multi-photo upload with drag-and-drop + camera capture.
 *
 * @param {Object}   props
 * @param {File[]}   props.photos     - Currently selected photo files.
 * @param {Function} props.onPhotosChange - Callback: receives the updated photos array.
 * @param {number}   [props.maxPhotos=4] - Maximum number of photos allowed.
 */
function CameraCapture({ photos = [], onPhotosChange, maxPhotos = 4, lang = 'en' }) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const dragCounterRef = useRef(0)

  // - Helpers -

  /** Filter to only image files and respect the max limit. */
  const addFiles = useCallback(
    (files) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith('image/')
      )
      const remaining = maxPhotos - photos.length
      if (remaining <= 0) return
      const toAdd = imageFiles.slice(0, remaining)
      if (toAdd.length > 0) {
        onPhotosChange([...photos, ...toAdd])
      }
    },
    [photos, maxPhotos, onPhotosChange]
  )

  const removePhoto = useCallback(
    (index) => {
      onPhotosChange(photos.filter((_, i) => i !== index))
    },
    [photos, onPhotosChange]
  )

  // - Drag-and-Drop Handlers -

  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragging(false)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files)
    }
  }

  // - File Input Handlers -

  const handleFileSelect = (e) => {
    if (e.target.files?.length) {
      addFiles(e.target.files)
    }
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  const openFilePicker = () => fileInputRef.current?.click()
  const openCamera = () => cameraInputRef.current?.click()

  const isFull = photos.length >= maxPhotos

  return (
    <div className="camera-capture">
      {/* Drop Zone */}
      <div
        className={`camera-capture__dropzone${
          isDragging ? ' camera-capture__dropzone--active' : ''
        }${photos.length > 0 ? ' camera-capture__dropzone--has-photos' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={!isFull ? openFilePicker : undefined}
        role="button"
        tabIndex={0}
        aria-label={translations[lang].ariaDrop}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!isFull) openFilePicker()
          }
        }}
      >
        {photos.length === 0 ? (
          <>
            <span className="camera-capture__drop-icon" aria-hidden="true">
              📷
            </span>
            <div className="camera-capture__drop-text">
              <div className="camera-capture__drop-title">
                {isDragging
                  ? translations[lang].dropActive
                  : translations[lang].dropInactive}
              </div>
              <div className="camera-capture__drop-subtitle">
                {translations[lang].clickBrowse.replace('{{max}}', maxPhotos)}
              </div>
            </div>
          </>
        ) : (
          <div className="camera-capture__drop-text">
            <div className="camera-capture__drop-subtitle">
              {isFull
                ? translations[lang].maxReached.replace('{{max}}', maxPhotos)
                : translations[lang].photosCount.replace('{{count}}', photos.length).replace('{{max}}', maxPhotos)}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {!isFull && (
        <div className="camera-capture__actions">
          <button
            type="button"
            className="camera-capture__btn camera-capture__btn--primary"
            onClick={openCamera}
            aria-label={translations[lang].ariaTake}
          >
            <span className="camera-capture__btn-icon" aria-hidden="true">
              📸
            </span>
            {translations[lang].takePhoto}
          </button>
          <button
            type="button"
            className="camera-capture__btn"
            onClick={openFilePicker}
            aria-label={translations[lang].ariaChoose}
          >
            <span className="camera-capture__btn-icon" aria-hidden="true">
              🖼️
            </span>
            {translations[lang].gallery}
          </button>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="camera-capture__file-input"
        onChange={handleFileSelect}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="camera-capture__file-input"
        onChange={handleFileSelect}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Photo Preview Grid */}
      {photos.length > 0 && (
        <div className="camera-capture__grid" role="list" aria-label="Uploaded photos">
          {photos.map((photo, index) => (
            <div
              key={`${photo.name}-${photo.lastModified}-${index}`}
              className="camera-capture__photo-card"
              role="listitem"
            >
              <img
                src={URL.createObjectURL(photo)}
                alt={`Uploaded photo ${index + 1}`}
                className="camera-capture__photo-img"
                onLoad={(e) => URL.revokeObjectURL(e.target.src)}
              />
              <div className="camera-capture__photo-overlay">
                <span className="camera-capture__photo-index">
                  {index + 1}/{maxPhotos}
                </span>
                <button
                  type="button"
                  className="camera-capture__photo-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    removePhoto(index)
                  }}
                  aria-label={`Remove photo ${index + 1}`}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Limit Info */}
      {photos.length > 0 && (
        <p className="camera-capture__limit">
          {translations[lang].photosSelected.replace('{{count}}', photos.length).replace('{{max}}', maxPhotos)}
        </p>
      )}
    </div>
  )
}

export default CameraCapture

