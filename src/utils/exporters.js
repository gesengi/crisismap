/**
 * @file exporters.js
 * @description Data export utilities for CrisisMap.
 * Exports crisis report data as CSV, GeoJSON, or a GIS-ready Shapefile/GeoPackage Bundle (ZIP)
 * for external analysis, GIS tools (QGIS, ArcGIS), or humanitarian data sharing (HDX).
 *
 * @requires file-saver — `npm install file-saver`
 * @requires jszip — `npm install jszip`
 */

import { saveAs } from 'file-saver';
import JSZip from 'jszip';

// ─── CSV Columns ─────────────────────────────────────────────────────────────
const CSV_COLUMNS = [
  'id',
  'timestamp',
  'latitude',
  'longitude',
  'damageLevel',
  'infrastructureName',
  'infrastructureType',
  'crisisNature',
  'needsDebrisClearing',
  'description',
  'address'
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Escape a single CSV field value.
 * Wraps in quotes if the value contains commas, quotes, or newlines.
 *
 * @param {*} value
 * @returns {string}
 */
function escapeCSVField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate CSV text content for reports.
 *
 * @param {Array<Object>} reports
 * @returns {string}
 */
function generateCSVContent(reports) {
  const header = CSV_COLUMNS.join(',');
  const rows = reports.map((report) =>
    CSV_COLUMNS.map((col) => escapeCSVField(report[col])).join(',')
  );
  return [header, ...rows].join('\n');
}

/**
 * Generate GeoJSON text content for reports.
 *
 * @param {Array<Object>} reports
 * @returns {string}
 */
function generateGeoJSONContent(reports) {
  const featureCollection = {
    type: 'FeatureCollection',
    features: reports.map((report) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          Number(report.longitude) || 0,
          Number(report.latitude) || 0
        ]
      },
      properties: {
        id: report.id || null,
        timestamp: report.timestamp || null,
        damageLevel: report.damageLevel || null,
        infrastructureName: report.infrastructureName || '',
        infrastructureType: report.infrastructureType || null,
        crisisNature: report.crisisNature || null,
        needsDebrisClearing: report.needsDebrisClearing ?? null,
        description: report.description || '',
        address: report.address || ''
      }
    }))
  };
  return JSON.stringify(featureCollection, null, 2);
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

/**
 * Export an array of report objects as a downloadable CSV file.
 *
 * @param {Array<Object>} reports - Report objects to export.
 * @param {string} [filename='crisismap-reports.csv'] - Download filename.
 */
export function exportToCSV(reports, filename = 'crisismap-reports.csv') {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error('exportToCSV requires a non-empty array of reports.');
  }
  const csvContent = generateCSVContent(reports);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, filename);
}

// ─── GeoJSON Export ──────────────────────────────────────────────────────────

/**
 * Export an array of report objects as a downloadable GeoJSON FeatureCollection.
 *
 * @param {Array<Object>} reports - Report objects to export.
 * @param {string} [filename='crisismap-reports.geojson'] - Download filename.
 */
export function exportToGeoJSON(reports, filename = 'crisismap-reports.geojson') {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error('exportToGeoJSON requires a non-empty array of reports.');
  }
  const jsonString = generateGeoJSONContent(reports);
  const blob = new Blob([jsonString], { type: 'application/geo+json;charset=utf-8;' });
  saveAs(blob, filename);
}

// ─── Shapefile Bundle (ZIP) Export ───────────────────────────────────────────

/**
 * Export an array of report objects as a downloadable GIS-ready ZIP archive
 * containing GeoJSON, CSV, WGS84 projection details (.prj), and a guide.
 *
 * @param {Array<Object>} reports - Report objects to export.
 * @param {string} [filename='crisismap-gis-bundle.zip'] - Download filename.
 */
export function exportToShapefileBundle(reports, filename = 'crisismap-gis-bundle.zip') {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error('exportToShapefileBundle requires a non-empty array of reports.');
  }

  const zip = new JSZip();

  // 1. Add GeoJSON
  const geojson = generateGeoJSONContent(reports);
  zip.file('crisismap-reports.geojson', geojson);

  // 2. Add CSV
  const csv = generateCSVContent(reports);
  zip.file('crisismap-reports.csv', csv);

  // 3. Add Projection PRJ file (WGS 84 / EPSG:4326)
  const prj = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  zip.file('crisismap-reports.prj', prj);

  // 4. Add README Instructions
  const readme = `========================================================================
CRISISMAP GIS DATA BUNDLE
========================================================================
This archive contains structural damage report datasets formatted for direct integration into standard Geographic Information Systems (GIS) like QGIS, ArcGIS Desktop, ArcGIS Pro, or web services like GeoServer.

FILES INCLUDED:
1. crisismap-reports.geojson
   - Standard GeoJSON format. Contains spatial point features for all submitted reports.
   - Ideal for direct import to modern GIS platforms.
   
2. crisismap-reports.csv
   - Tabular CSV format. Contains descriptive fields, timestamps, and geolocation attributes (Latitude/Longitude).
   - Compatible with GIS, spreadsheet programs (Excel, LibreOffice), and statistical environments (Python, R).

3. crisismap-reports.prj
   - Spatial reference projection file. Contains well-known text (WKT) specifying GCS_WGS_1984 (EPSG:4326).
   - Ensures correct coordinate alignment when using the CSV/GeoJSON files.

IMPORT INSTRUCTIONS FOR GIS CLIENTS:

Option A: Importing via QGIS
---------------------------
1. Open QGIS.
2. Drag-and-drop 'crisismap-reports.geojson' directly from your file manager into the QGIS layers panel.
3. The points will instantly plot on your canvas. Coordinates are projected automatically using EPSG:4326.

Option B: Importing CSV via ArcGIS Desktop / ArcGIS Pro
-------------------------------------------------------
1. Open ArcGIS Pro / ArcMap.
2. Choose "Add Data" -> "XY Event Data" or use the "XY Table To Point" geoprocessing tool.
3. Browse to select 'crisismap-reports.csv'.
4. Set the X Field as 'longitude' and the Y Field as 'latitude'.
5. For Coordinate System, browse and choose "GCS_WGS_1984" (or import 'crisismap-reports.prj').
6. Run the tool to import the vector points layer.

METADATA SCHEMA:
- id: Unique report identifier.
- timestamp: ISO 8601 / Epoch timestamp of collection or submission.
- latitude / longitude: Geodetic coordinates (WGS84).
- damageLevel: Classified structural damage status ('minimal', 'partial', 'complete').
- infrastructureName: User-defined name/identifier of structural site.
- infrastructureType: Array or string of selected infrastructure categories.
- crisisNature: Multi-select categories for natural, industrial, or civil hazards.
- needsDebrisClearing: Binary flag indicating if debris is blocking access.
- description: Textual description of visual damage or observation details.
- address: Auto-resolved reverse-geocoded location details if online.

This dataset was generated by the CrisisMap platform for UNDP crisis response mapping.
Generated on: ${new Date().toUTCString()}
`;
  zip.file('README.txt', readme);

  // 5. Build and save zip
  zip.generateAsync({ type: 'blob' }).then((blob) => {
    saveAs(blob, filename);
  });
}
