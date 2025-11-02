/**
 * Soba DEX - Service Worker for Progressive Web App
 * Enables offline functionality, caching, and push notifications
 */

const CACHE_NAME = 'soba-dex-v2.3.0';
const RUNTIME_CACHE = 'soba-runtime-v2.3.0';
const API_CACHE = 'soba-api-v2.3.0';

// Cache size limits
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_API_CACHE_AGE = 5 * 60 * 1000; // 5 minutes

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json',
  '/favicon.ico'
];

// API endpoints that can be cached
const CACHEABLE_API_PATTERNS = [
  /\/api\/tokens/,
  /\/api\/pools/,
  /\/api\/price/
];

// API endpoints that should never be cached
const NOCACHE_API_PATTERNS = [
  /\/api\/swap/,
  /\/api\/trade/,
  /\/api\/auth/
];

/**
 * Install Event
 * Pre-cache critical assets
 */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Installed successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Installation failed:', error);
      })
  );
});

/**
 * Activate Event
 * Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME &&
                cacheName !== RUNTIME_CACHE &&
                cacheName !== API_CACHE) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Activated successfully');
        return self.clients.claim();
      })
  );
});

/**
 * Fetch Event
 * Implement caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // API requests - Network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Static assets - Cache first, network fallback
  event.respondWith(handleStaticRequest(request));
});

/**
 * Handle API requests
 * Network first, with cache fallback
 */
async function handleApiRequest(request) {
  const url = new URL(request.url);

  // Don't cache sensitive endpoints
  if (NOCACHE_API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    try {
      return await fetch(request);
    } catch (error) {
      console.error('[Service Worker] API request failed:', error);
      return new Response(JSON.stringify({
        error: 'Network unavailable',
        offline: true
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Cacheable API endpoints
  if (CACHEABLE_API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    try {
      // Try network first
      const response = await fetch(request);

      if (response.ok) {
        // Clone and cache the response
        const cache = await caches.open(API_CACHE);
        cache.put(request, response.clone());
      }

      return response;
    } catch (error) {
      // Network failed, try cache
      console.log('[Service Worker] Network failed, trying cache for:', url.pathname);
      const cachedResponse = await caches.match(request);

      if (cachedResponse) {
        return cachedResponse;
      }

      // No cache available
      return new Response(JSON.stringify({
        error: 'No cached data available',
        offline: true
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Default: network only
  return fetch(request);
}

/**
 * Handle static asset requests
 * Cache first, network fallback
 */
async function handleStaticRequest(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Cache miss - fetch from network
  try {
    const response = await fetch(request);

    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.error('[Service Worker] Static asset fetch failed:', error);

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlineResponse = await caches.match('/offline.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }

    throw error;
  }
}

/**
 * Push Notification Event
 */
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received');

  let notification = {
    title: 'Soba DEX',
    body: 'You have a new notification',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200]
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notification = {
        ...notification,
        ...data
      };
    } catch (error) {
      notification.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      vibrate: notification.vibrate,
      data: notification.data,
      actions: notification.actions || []
    })
  );
});

/**
 * Notification Click Event
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked');

  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }

        // Open new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

/**
 * Background Sync Event
 */
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);

  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncTransactions());
  }
});

async function syncTransactions() {
  try {
    // Get pending transactions from IndexedDB
    // Send them to the server
    // Update status
    console.log('[Service Worker] Syncing transactions...');
    return true;
  } catch (error) {
    console.error('[Service Worker] Transaction sync failed:', error);
    throw error;
  }
}

/**
 * Message Event
 * Handle messages from the app
 */
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

console.log('[Service Worker] Loaded successfully');
