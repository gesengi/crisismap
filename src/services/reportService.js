/**
 * @file reportService.js
 * @description Report CRUD service for CrisisMap.
 *
 * Dual-mode service:
 *   • **Firebase mode** — reads/writes Firestore 'reports' collection and
 *     uploads photos to Firebase Storage.
 *   • **Mock mode** — persists to localStorage and generates UUIDs locally,
 *     allowing the app to function as a standalone demo.
 *
 * All public functions return Promises so consuming code doesn't need
 * to know which backend is active.
 */

import { IS_MOCK_MODE, db, storage } from './firebase.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const COLLECTION_NAME = 'reports';
const LOCAL_STORAGE_KEY = 'crisismap_reports';

/** Simulated async delay in mock mode (ms). */
const MOCK_DELAY = 120;

// ─── Helper: UUID generator (mock mode) ─────────────────────────────────────

/**
 * Generate a v4-style UUID using the Web Crypto API.
 * @returns {string}
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * Simulate async latency in mock mode so the UI behaves consistently.
 * @returns {Promise<void>}
 */
function mockDelay() {
  return new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
}

// ─── Anonymization ───────────────────────────────────────────────────────────

/**
 * Fields considered personally identifiable and stripped during anonymization.
 * @type {string[]}
 */
const PII_FIELDS = [
  'userName',
  'userEmail',
  'userId',
  'phoneNumber',
  'ipAddress',
  'deviceId'
];

/**
 * Strip PII fields from a report object.
 * Returns a shallow copy — does NOT mutate the original.
 *
 * @param {Object} report
 * @returns {Object} Anonymized copy of the report.
 */
export function anonymizeReport(report) {
  const cleaned = { ...report, isAnonymized: true };
  for (const field of PII_FIELDS) {
    delete cleaned[field];
  }
  // Reduce GPS precision to ~110 m (3 decimal places ≈ 111 m)
  if (cleaned.latitude != null) {
    cleaned.latitude = Math.round(cleaned.latitude * 1000) / 1000;
  }
  if (cleaned.longitude != null) {
    cleaned.longitude = Math.round(cleaned.longitude * 1000) / 1000;
  }
  return cleaned;
}

// ─── Local Storage Helpers (mock mode) ───────────────────────────────────────

/**
 * Read all reports from localStorage.
 * @returns {Array<Object>}
 */
function readLocalReports() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Write all reports to localStorage.
 * @param {Array<Object>} reports
 */
function writeLocalReports(reports) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reports));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new crisis report.
 *
 * @param {Object} reportData
 * @param {string[]} [reportData.photos] - Array of photo URLs (or File objects in Firebase mode).
 * @param {string} reportData.description
 * @param {'none'|'minor'|'major'|'destroyed'} reportData.damageLevel
 * @param {string} reportData.infrastructureType
 * @param {number} reportData.latitude
 * @param {number} reportData.longitude
 * @param {string} [reportData.address]
 * @param {boolean} [reportData.isAnonymized=false]
 * @param {string} [reportData.aiSuggestion]
 * @param {string} [reportData.userChoice]
 * @returns {Promise<Object>} The created report (with generated id and timestamp).
 */
export async function createReport(reportData) {
  const report = {
    id: reportData.id || generateId(),
    photos: reportData.photos || [],
    description: reportData.description || '',
    damageLevel: reportData.damageLevel || 'none',
    infrastructureType: reportData.infrastructureType || 'other',
    infrastructureName: reportData.infrastructureName || '',
    crisisNature: reportData.crisisNature || '',
    needsDebrisClearing: reportData.needsDebrisClearing ?? null,
    latitude: reportData.latitude ?? 0,
    longitude: reportData.longitude ?? 0,
    address: reportData.address || '',
    buildingId: reportData.buildingId || null,
    timestamp: reportData.timestamp || new Date().toISOString(),
    isAnonymized: reportData.isAnonymized || false,
    aiSuggestion: reportData.aiSuggestion || null,
    userChoice: reportData.userChoice || null,
    synced: reportData.synced ?? !IS_MOCK_MODE,
    
    // New Hybrid Cloud AI validation attributes
    isCloudValidated: reportData.isCloudValidated || false,
    cloudSuggestedSeverity: reportData.cloudSuggestedSeverity || null,
    cloudConfidence: reportData.cloudConfidence || null,
    cloudAnalysisReason: reportData.cloudAnalysisReason || null,
    isAutoVerified: reportData.isAutoVerified || false
  };

  // Anonymize if requested
  const finalReport = report.isAnonymized
    ? anonymizeReport(report)
    : report;

  if (IS_MOCK_MODE) {
    return createReportMock(finalReport);
  }
  return createReportFirebase(finalReport, reportData.photos);
}

/** @private Mock implementation */
async function createReportMock(report) {
  await mockDelay();
  const reports = readLocalReports();
  reports.unshift(report);
  writeLocalReports(reports);

  // Trigger cloud validation in background
  triggerCloudValidation(report.id, report.photos);

  return report;
}

/** @private Firebase implementation */
async function createReportFirebase(report, photoFiles) {
  const { collection, addDoc, serverTimestamp } = await import(
    'firebase/firestore'
  );
  const { ref, uploadBytes, getDownloadURL } = await import(
    'firebase/storage'
  );

  // Upload photo files to Storage if they are File/Blob objects
  const photoUrls = [];
  const filesToProcess = [];
  if (Array.isArray(photoFiles)) {
    for (const photo of photoFiles) {
      if (photo instanceof Blob) {
        const photoRef = ref(
          storage,
          `reports/${report.id}/${generateId()}.jpg`
        );
        await uploadBytes(photoRef, photo);
        const url = await getDownloadURL(photoRef);
        photoUrls.push(url);
        filesToProcess.push(photo);
      } else if (typeof photo === 'string') {
        photoUrls.push(photo); // Already a URL
        filesToProcess.push(photo);
      }
    }
  }

  const docData = {
    ...report,
    photos: photoUrls.length > 0 ? photoUrls : report.photos,
    timestamp: serverTimestamp()
  };
  delete docData.id; // Firestore auto-generates the doc ID

  const docRef = await addDoc(collection(db, COLLECTION_NAME), docData);
  const createdReport = { ...report, id: docRef.id, photos: docData.photos };

  // Trigger cloud validation in background using the files in memory
  triggerCloudValidation(docRef.id, filesToProcess.length > 0 ? filesToProcess : docData.photos);

  return createdReport;
}

/**
 * Convert a blob/file to Base64 data URL.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Background runner to evaluate report photo against Gemini 2.0 Flash API.
 */
async function triggerCloudValidation(reportId, photoFiles) {
  try {
    const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const photo = (photoFiles && photoFiles.length > 0) ? photoFiles[0] : null;

    if (!photo) {
      console.warn('[CrisisMap Cloud AI] No photo available for validation.');
      return;
    }

    let result;
    if (!geminiApiKey || IS_MOCK_MODE) {
      console.info('[CrisisMap Cloud AI] Running validation simulation (mock mode or missing API key)...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Calibrated simulation results
      const mockDescriptions = [
        'Visible diagonal cracks along the masonry support column. Risk of local facade collapse.',
        'Complete structural failure. Building collapsed into rubble stack with debris blocking adjacent street.',
        'Minor superficial damage. Window glazing fractured but structural load paths remain intact.',
        'No visible structural damage. Structure appears stable with zero external cracking.'
      ];
      
      const mockResults = [
        { severity: 'major', confidence: 0.88, reason: mockDescriptions[0] },
        { severity: 'destroyed', confidence: 0.96, reason: mockDescriptions[1] },
        { severity: 'minor', confidence: 0.78, reason: mockDescriptions[2] },
        { severity: 'none', confidence: 0.92, reason: mockDescriptions[3] }
      ];
      
      // Select pseudo-random index
      const seed = reportId.charCodeAt(0) || 0;
      result = mockResults[seed % mockResults.length];
    } else {
      console.info('[CrisisMap Cloud AI] Contacting Gemini 2.0 Flash API for validation...');
      
      let base64Data;
      let mimeType = 'image/jpeg';

      if (photo instanceof Blob) {
        base64Data = await blobToBase64(photo);
        mimeType = photo.type || 'image/jpeg';
      } else if (typeof photo === 'string') {
        const resp = await fetch(photo);
        const blob = await resp.blob();
        base64Data = await blobToBase64(blob);
        mimeType = blob.type || 'image/jpeg';
      } else {
        throw new Error('Unsupported photo format');
      }

      const base64Clean = base64Data.split(',')[1] || base64Data;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

      const payload = {
        contents: [
          {
            parts: [
              {
                text: "Analyze this photo of disaster infrastructure damage. Classify the damage level into exactly one of these categories: 'none', 'minor', 'major', or 'destroyed'. Determine your confidence level (0.0 to 1.0) and write a short 1-2 sentence description explaining the visible structural damage features (e.g., roof collapse, building rubble, windows broken, or no visible damage). You MUST respond with a valid JSON object matching exactly this schema: { \"severity\": \"none\" | \"minor\" | \"major\" | \"destroyed\", \"confidence\": number, \"reason\": string }. Do not include any markdown backticks, prefix text, or formatting. Return raw JSON text only."
              },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Clean
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const responseData = await response.json();
      const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error('Empty response from Gemini');
      }

      const jsonParsed = JSON.parse(rawText.trim());
      result = {
        severity: jsonParsed.severity || 'none',
        confidence: jsonParsed.confidence || 0.5,
        reason: jsonParsed.reason || 'Cloud AI classification complete.'
      };
    }

    // Update report status in backend
    let originalSeverity = 'none';
    if (IS_MOCK_MODE) {
      const reports = readLocalReports();
      const report = reports.find(r => r.id === reportId);
      if (report) originalSeverity = report.damageLevel;
    } else {
      const { doc, getDoc } = await import('firebase/firestore');
      const docRef = doc(db, COLLECTION_NAME, reportId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        originalSeverity = docSnap.data().damageLevel || 'none';
      }
    }

    const isAutoVerified = (result.severity === originalSeverity);

    console.info(`[CrisisMap Cloud AI] Saving validation results for report: ${reportId}`, result);
    await updateReport(reportId, {
      isCloudValidated: true,
      cloudSuggestedSeverity: result.severity,
      cloudConfidence: result.confidence,
      cloudAnalysisReason: result.reason,
      isAutoVerified: isAutoVerified
    });

  } catch (err) {
    console.error('[CrisisMap Cloud AI] Background validation failed:', err);
  }
}

/**
 * Retrieve reports with optional filters.
 *
 * @param {Object} [filters={}]
 * @param {string} [filters.damageLevel] - Filter by damage level.
 * @param {string} [filters.infrastructureType] - Filter by infrastructure type.
 * @param {number} [filters.limit=100] - Maximum number of reports to return.
 * @returns {Promise<Array<Object>>}
 */
export async function getReports(filters = {}) {
  if (IS_MOCK_MODE) {
    return getReportsMock(filters);
  }
  return getReportsFirebase(filters);
}

/** @private */
async function getReportsMock(filters) {
  await mockDelay();
  let reports = readLocalReports();

  if (filters.damageLevel) {
    reports = reports.filter((r) => r.damageLevel === filters.damageLevel);
  }
  if (filters.infrastructureType) {
    reports = reports.filter(
      (r) => r.infrastructureType === filters.infrastructureType
    );
  }

  const limit = filters.limit || 100;
  return reports.slice(0, limit);
}

/** @private */
async function getReportsFirebase(filters) {
  const {
    collection,
    query,
    where,
    orderBy,
    limit: firestoreLimit,
    getDocs
  } = await import('firebase/firestore');

  const constraints = [orderBy('timestamp', 'desc')];

  if (filters.damageLevel) {
    constraints.push(where('damageLevel', '==', filters.damageLevel));
  }
  if (filters.infrastructureType) {
    constraints.push(
      where('infrastructureType', '==', filters.infrastructureType)
    );
  }
  constraints.push(firestoreLimit(filters.limit || 100));

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Retrieve a single report by its ID.
 *
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getReportById(id) {
  if (IS_MOCK_MODE) {
    await mockDelay();
    const reports = readLocalReports();
    return reports.find((r) => r.id === id) || null;
  }

  const { doc, getDoc } = await import('firebase/firestore');
  const docRef = doc(db, COLLECTION_NAME, id);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

/**
 * Delete a report by its ID.
 *
 * @param {string} id
 * @returns {Promise<boolean>} `true` if successfully deleted.
 */
export async function deleteReport(id) {
  if (IS_MOCK_MODE) {
    await mockDelay();
    const reports = readLocalReports();
    const filtered = reports.filter((r) => r.id !== id);
    if (filtered.length === reports.length) return false;
    writeLocalReports(filtered);
    return true;
  }

  const { doc, deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, COLLECTION_NAME, id));
  return true;
}

/**
 * Update an existing report with new fields.
 *
 * @param {string} id - The ID of the report.
 * @param {Object} updatedFields - Key-value pairs to update.
 * @returns {Promise<Object>} The updated report data.
 */
export async function updateReport(id, updatedFields) {
  if (IS_MOCK_MODE) {
    await mockDelay();
    const reports = readLocalReports();
    const index = reports.findIndex((r) => r.id === id);
    if (index === -1) throw new Error('Report not found');
    reports[index] = { ...reports[index], ...updatedFields };
    writeLocalReports(reports);
    return reports[index];
  }

  const { doc, updateDoc } = await import('firebase/firestore');
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, updatedFields);
  return { id, ...updatedFields };
}

/**
 * Subscribe to real-time report updates.
 *
 * - **Firebase mode**: uses Firestore `onSnapshot` for live updates.
 * - **Mock mode**: polls localStorage every 3 seconds.
 *
 * @param {(reports: Array<Object>) => void} callback - Called with the latest reports array.
 * @returns {() => void} Unsubscribe / cleanup function.
 */
export function subscribeToReports(callback) {
  if (IS_MOCK_MODE) {
    // Poll localStorage as a simple substitute for real-time listeners
    const interval = setInterval(() => {
      callback(readLocalReports());
    }, 3000);

    // Immediately emit current state
    callback(readLocalReports());

    return () => clearInterval(interval);
  }

  // Firebase real-time listener — we need to handle the async import
  let unsubscribe = () => {};

  (async () => {
    const { collection, query, orderBy, onSnapshot } = await import(
      'firebase/firestore'
    );
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('timestamp', 'desc')
    );
    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const reports = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        callback(reports);
      },
      (error) => {
        console.error('[CrisisMap] Report subscription error:', error);
      }
    );
  })();

  return () => unsubscribe();
}

/**
 * Translate text into a target language using the Gemini API.
 * Falls back to simulation in mock mode or if the API key is missing.
 *
 * @param {string} text - The input text to translate.
 * @param {string} targetLang - The target language code (e.g. 'en', 'es').
 * @returns {Promise<string>} The translated text.
 */
export async function translateText(text, targetLang) {
  if (!text || !text.trim()) return '';
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!geminiApiKey || IS_MOCK_MODE) {
    await new Promise(resolve => setTimeout(resolve, 800));
    // Simulated translations for common languages
    const simulatedTranslations = {
      en: `[Translated to English]: ${text}`,
      es: `[Traducido al Español]: ${text}`,
      fr: `[Traduit en Français]: ${text}`,
      ru: `[Переведено на Русский]: ${text}`,
      zh: `[翻译成中文]: ${text}`,
      ar: `[ترجم إلى العربية]: ${text}`
    };
    return simulatedTranslations[targetLang] || simulatedTranslations['en'];
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    
    // Convert target language code to human-friendly name
    const langNames = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      ru: 'Russian',
      zh: 'Chinese',
      ar: 'Arabic'
    };
    const targetLangName = langNames[targetLang] || 'English';

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `Translate this text into standard, natural ${targetLangName}. Return ONLY the translation, without quotes, introductions, notes, markdown formatting, or explanations: "${text}"`
            }
          ]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Gemini translation error: ${response.statusText}`);
    }

    const responseData = await response.json();
    const resultText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultText) {
      throw new Error('Empty response from Gemini');
    }
    
    return resultText.trim();
  } catch (err) {
    console.error('[CrisisMap Cloud AI] Translation failed:', err);
    return `[Translation Failed]: ${text}`;
  }
}

