# Changelog

All notable changes to CrisisMap are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2025-06-23

### 🎉 Initial Production Release

**Frontend**
- 4-step guided damage report wizard (photo → classify → details → map → submit)
- On-device AI image classification via TensorFlow.js COCO-SSD (no server required)
- Interactive Leaflet.js map with OpenStreetMap base layer and building footprint overlays
- Building footprint snap-to-centroid for precise, unambiguous geolocation
- Landmark text description fallback when GPS is unavailable
- Full 6 UN language support: Arabic (RTL), Chinese, English, French, Russian, Spanish
- Language toggle in navbar with full layout direction switching for RTL
- Progressive Web App (PWA) — installable, offline-capable
- Gamification: Explorer, Responder, Guardian, Crisis Hero badges on verified submissions

**Backend**
- Google Cloud Firestore database with auto-scaling to 500,000+ records
- Firebase Storage for compressed photo hosting (<500KB per image)
- Firebase Auth: anonymous reporters + email/password coordinator role
- Offline-first: IndexedDB queue with Service Worker background sync
- Report versioning: same-building submissions tracked with full damage history
- Haversine-based near-duplicate detection within 25-meter radius

**Coordinator Console**
- Real-time vetting queue (Verify / Flag / Reject)
- Filter by status, region, and infrastructure type
- Auto-translation of foreign-language descriptions via LibreTranslate
- AI Model Tuning panel for crisis-specific fine-tuning via transfer learning
- Analytics: damage breakdown, infrastructure type, crisis type, time-series charts
- Spatial hotspot visualisation

**GIS Export**
- CSV (UTF-8, RAPIDA-compatible schema)
- GeoJSON (WGS84 decimal coordinates)
- Shapefile ZIP (.shp + .dbf + .prj + .shx)
- GeoPackage (.gpkg, OGC standard)
- REST API endpoint for UNDP pipeline integration

**Infrastructure**
- Deployed to Firebase Hosting (global CDN, 150+ edge nodes)
- Firestore security rules: reporters write-only, coordinators full CRUD
- `.env`-based configuration with Mock Mode fallback for zero-config demos
- ESLint configured for React hooks and refresh rules
