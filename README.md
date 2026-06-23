# 🗺️ CrisisMap

**Community-powered infrastructure damage reporting for sudden-onset crises.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-crisismap--cfa82.web.app-blue?style=flat-square)](https://crisismap-cfa82.web.app)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)
[![TRL](https://img.shields.io/badge/TRL-7%20%E2%80%93%20Production%20Ready-orange?style=flat-square)](https://en.wikipedia.org/wiki/Technology_readiness_level)

> Built for the **UNDP "Build the Future of Crisis Mapping" Challenge** — enabling communities to submit geotagged damage reports with on-device AI classification within the critical 48-hour post-crisis window.

---

## 🌍 Live Application

**https://crisismap-cfa82.web.app**

No installation required. Works in any modern browser on any device.

**Coordinator login (demo):**
```
Email:    admin@crisismap.org
Password: password123
```

---

## ✨ Key Features

| Feature | Details |
|---------|---------|
| 📸 **4-step Report Wizard** | Photo upload → AI classify → structured form → map pin |
| 🤖 **Edge AI Classification** | TensorFlow.js COCO-SSD runs on-device, no server required |
| 🗺️ **Building Footprint Geolocation** | Microsoft ML + OSM footprints for building-level precision |
| 📶 **Offline-First** | IndexedDB queue + Service Worker background sync |
| 🌐 **6 UN Languages** | AR (RTL), ZH, EN, FR, RU, ES — full layout switching |
| 🔒 **Anonymous Reporting** | No PII ever required or stored |
| 📊 **Coordinator Dashboard** | Vetting queue, analytics charts, spatial heatmaps |
| 📦 **GIS Export** | CSV, GeoJSON, Shapefile, GeoPackage, REST API |
| 🏅 **Gamification** | Badge rewards on verified submissions (anti-spam design) |
| 🔄 **Report Versioning** | Same-building submissions tracked with full damage history |

---

## 🏗️ Tech Stack

**Frontend**
- React 19 + Vite 8
- Leaflet.js + React-Leaflet (interactive maps)
- TensorFlow.js + COCO-SSD (on-device AI)
- Progressive Web App (Service Worker + IndexedDB)

**Backend**
- Google Cloud Firestore (auto-scaling NoSQL)
- Firebase Storage (photo hosting)
- Firebase Auth (anonymous + email/password)
- Firebase Hosting (global CDN)

**Export / GIS**
- GeoJSON, Shapefile (shpjs), GeoPackage, CSV
- RAPIDA-compatible data schema

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- Node.js 18+
- npm 9+
- A Firebase project (or use Mock Mode without one)

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/crisismap.git
cd crisismap
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
```bash
cp .env.example .env
```
Edit `.env` with your Firebase project credentials.  
**Leave it empty to run in Mock Mode** (local storage, no Firebase needed).

### 4. Start development server
```bash
npm run dev
```
Open http://localhost:5173

### 5. Build for production
```bash
npm run build
```

### 6. Deploy to Firebase Hosting
```bash
npx firebase deploy --only hosting
```

---

## 📁 Project Structure

```
crisis-map/
├── public/               # Static assets, PWA manifest, service worker
├── src/
│   ├── components/       # Reusable UI components (Navbar, Map, Toast...)
│   ├── pages/            # Route-level pages (Home, Report, Map, Admin...)
│   ├── services/         # Firebase, AI classifier, report service
│   ├── utils/            # Constants, translations, mock footprints
│   └── App.jsx           # Root component + routing
├── .env.example          # Environment variable template
├── firestore.rules       # Firestore security rules
├── storage.rules         # Firebase Storage security rules
├── firebase.json         # Firebase hosting config
└── vite.config.js        # Vite build config
```

---

## 🌐 Environment Variables

Copy `.env.example` to `.env` and fill in your Firebase config:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

> **Note:** If these are missing, the app runs in **Mock Mode** using localStorage — fully functional for demos without a Firebase account.

---

## 🔒 Security

- Community reporters use **anonymous authentication** — no email, name, or personal data required
- Coordinates are **anonymized to the building footprint centroid** — individual GPS precision never stored
- **Firestore security rules** prevent reporters from reading other reports
- Only coordinators with verified email credentials can access the vetting dashboard
- All data transmitted over **HTTPS / TLS 1.3**

---

## 📊 Data Schema (RAPIDA-Compatible)

Every submitted report stores:

```json
{
  "damageSeverity": "completely_damaged",
  "infrastructureTypes": ["community"],
  "infrastructureName": "St. François Clinic",
  "crisisTypes": ["earthquake"],
  "debrisRequired": "yes",
  "description": "Free text in any language",
  "lat": -18.7443,
  "lng": -72.3384,
  "footprintId": "way/123456789",
  "createdAt": "2025-01-15T14:23:00Z",
  "aiConfidence": 0.87,
  "status": "verified",
  "buildingVersionHistory": [...]
}
```

---

## 🤝 Contributing

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.

Built for UNDP's humanitarian mission. Free to use, adapt, and deploy for crisis response.

---

## 🙏 Acknowledgements

- [UNDP RAPIDA](https://www.undp.org) — Rapid Post-Crisis Integrated Digital Assessment
- [HOT OpenStreetMap](https://www.hotosm.org) — Building footprint data
- [Microsoft ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints) — Global footprint coverage
- [TensorFlow.js](https://www.tensorflow.org/js) — On-device AI inference
- [Leaflet.js](https://leafletjs.com) — Interactive maps
