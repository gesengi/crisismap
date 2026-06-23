const CACHE_NAME = 'crisismap-v23'
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/favicon.png',
  '/favicon.svg',
  '/icons.svg',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
]

// Install: Cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE)
    })
  )
  self.skipWaiting()
})

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// Fetch: Stale-while-revalidate strategy for static resources
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') {
    return
  }

  // Parse URL and only process http/https schemes (prevents chrome-extension errors)
  let url;
  try {
    url = new URL(event.request.url)
  } catch {
    return
  }
  
  if (!url.protocol.startsWith('http')) {
    return
  }

  // Bypass Firebase API/Auth services
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com')
  ) {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch latest version in the background to update the cache
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse)
              })
            }
          })
          .catch(() => {
            // Ignore background fetch errors (e.g. offline)
          })
        return cachedResponse
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== 'basic'
          ) {
            return networkResponse
          }

          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
          return networkResponse
        })
        .catch(() => {
          // If offline and request is page navigation, return index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html')
          }
        })
    })
  )
})
