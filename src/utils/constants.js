/**
 * @file constants.js
 * @description Application-wide constants for CrisisMap.
 * Central source of truth for damage classifications, infrastructure types,
 * map configuration, and app metadata.
 */

// ─── Damage Level Definitions ────────────────────────────────────────────────
/**
 * Standardized damage level classifications used throughout the app.
 * Each level includes a semantic color and icon for consistent UI rendering.
 *
 * @type {Array<{value: string, label: string, color: string, icon: string, description: string}>}
 */
export const DAMAGE_LEVELS = [
  {
    value: 'minimal',
    label: 'Minimal / No Damage',
    color: '#22c55e',
    icon: '✅',
    description: 'Structure is intact or has minimal cosmetic damage.'
  },
  {
    value: 'partial',
    label: 'Partially Damaged',
    color: '#f59e0b',
    icon: '⚠️',
    description: 'Repairable structural damage; remains usable with caution.'
  },
  {
    value: 'complete',
    label: 'Completely Damaged',
    color: '#ef4444',
    icon: '🏚️',
    description: 'Structurally unsafe, collapsed, or destroyed.'
  }
];

// ─── Infrastructure Type Definitions ─────────────────────────────────────────

/**
 * Categories of infrastructure that can be reported on.
 *
 * @type {Array<{value: string, label: string, icon: string}>}
 */
export const INFRASTRUCTURE_TYPES = [
  { value: 'residential', label: 'Residential Infrastructure', icon: '🏠' },
  { value: 'commercial', label: 'Commercial Infrastructure', icon: '🏢' },
  { value: 'government', label: 'Government Building', icon: '🏛️' },
  { value: 'utility', label: 'Utility Infrastructure', icon: '⚡' },
  { value: 'transport', label: 'Transport and Communication Infrastructure', icon: '🌉' },
  { value: 'community', label: 'Community Infrastructure', icon: '🏫' },
  { value: 'public_spaces', label: 'Public spaces/Recreation Infrastructure', icon: '⚽' },
  { value: 'other', label: 'Other', icon: '📍' }
];

// ─── Crisis Nature Definitions ───────────────────────────────────────────────

/**
 * Grouped categories of crisis natures as required by the UNDP guidelines.
 *
 * @type {Array<{category: string, labelKey: string, items: Array<{value: string, labelKey: string}>}>}
 */
export const CRISIS_NATURES = [
  {
    category: 'natural',
    labelKey: 'crisisNatureNatural',
    items: [
      { value: 'earthquake', labelKey: 'crisisEarthquake' },
      { value: 'flood', labelKey: 'crisisFlood' },
      { value: 'tsunami', labelKey: 'crisisTsunami' },
      { value: 'hurricane', labelKey: 'crisisHurricane' },
      { value: 'wildfire', labelKey: 'crisisWildfire' }
    ]
  },
  {
    category: 'technological',
    labelKey: 'crisisNatureTechnological',
    items: [
      { value: 'explosion', labelKey: 'crisisExplosion' },
      { value: 'chemical', labelKey: 'crisisChemical' }
    ]
  },
  {
    category: 'human',
    labelKey: 'crisisNatureHuman',
    items: [
      { value: 'conflict', labelKey: 'crisisConflict' },
      { value: 'civil_unrest', labelKey: 'crisisCivilUnrest' }
    ]
  }
];

// ─── Map Configuration ───────────────────────────────────────────────────────

/**
 * Default Leaflet map settings.
 * Uses OpenStreetMap tiles — no API key required for the prototype.
 *
 * @type {{
 *   defaultCenter: [number, number],
 *   defaultZoom: number,
 *   minZoom: number,
 *   maxZoom: number,
 *   tileUrl: string,
 *   attribution: string
 * }}
 */
export const MAP_CONFIG = {
  defaultCenter: [33.8938, 35.5018], // Beirut, Lebanon — common crisis mapping region
  defaultZoom: 13,
  minZoom: 3,
  maxZoom: 19,
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
};

// ─── Application Metadata ────────────────────────────────────────────────────

/**
 * General application configuration and branding.
 *
 * @type {{
 *   name: string,
 *   version: string,
 *   description: string,
 *   maxPhotoCount: number,
 *   maxPhotoSizeMB: number,
 *   defaultLanguage: string,
 *   supportedLanguages: string[]
 * }}
 */
export const APP_CONFIG = {
  name: 'CrisisMap',
  version: '1.0.0',
  description:
    'Real-time crisis mapping PWA for rapid damage assessment and humanitarian response.',
  maxPhotoCount: 5,
  maxPhotoSizeMB: 10,
  defaultLanguage: 'en',
  supportedLanguages: ['en', 'ar', 'fr', 'es', 'ru', 'zh']
};

/**
 * Look up a damage level object by its value key.
 *
 * @param {string} value - One of 'minimal', 'partial', 'complete'
 * @returns {{value: string, label: string, color: string, icon: string, description: string} | undefined}
 */
export function getDamageLevel(value) {
  return DAMAGE_LEVELS.find((level) => level.value === value);
}

/**
 * Look up an infrastructure type object by its value key.
 *
 * @param {string} value - e.g. 'residential', 'hospital'
 * @returns {{value: string, label: string, icon: string} | undefined}
 */
export function getInfrastructureType(value) {
  return INFRASTRUCTURE_TYPES.find((type) => type.value === value);
}
