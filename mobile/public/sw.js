/**
 * Service Worker for DEX Mobile Application
 *
 * Advanced offline functionality with:
 * - Intelligent caching strategies
 * - Background sync for transactions
 * - Push notification handling
 * - Offline transaction queuing
 * - Cache-first strategies for better UX
 *
 * @version 1.0.0
 */

const CACHE_NAME = 'dex-v1.0.0';
const RUNTIME_CACHE = 'dex-runtime-v1.0.0';

// Cache strategies
const CACHE_STRATEGIES = {
  // Cache-first for static assets
  CACHE_FIRST: 'cache-first',
  // Network-first for dynamic content
  NETWORK_FIRST: 'network-first',
  // Stale-while-revalidate for frequently updated content
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate',
  // Network-only for real-time data
  NETWORK_ONLY: 'network-only'
};

// Resources to cache immediately
const PRECACHE_RESOURCES = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico'
];

// API endpoints that should be cached
const API_CACHE_PATTERNS = [
  '/api/tokens',
  '/api/tokens/list',
  '/api/prices',
  '/api/market/stats'
];

// Resources that should never be cached
const NEVER_CACHE_PATTERNS = [
  '/api/auth/',
  '/api/trading/execute',
  '/api/portfolio/balance',
  '/api/websocket',
  '/api/transactions/*'
];

// Install event - cache essential resources
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install');

  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => {
        console.log('[ServiceWorker] Caching essential resources');
        return cache.addAll(PRECACHE_RESOURCES);
      }),
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate');

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all pages
      self.clients.claim()
    ])
  );
});

// Fetch event - handle requests with appropriate caching strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests for caching
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Determine caching strategy
  const strategy = determineCachingStrategy(request.url);

  event.respondWith(handleRequest(request, strategy));
});

// Background sync for offline transactions
self.addEventListener('sync', event => {
  console.log('[ServiceWorker] Background sync:', event.tag);

  if (event.tag === 'background-sync') {
    event.waitUntil(syncOfflineTransactions());
  }
});

// Push notification handling
self.addEventListener('push', event => {
  console.log('[ServiceWorker] Push received');

  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/badge-icon.png',
      vibrate: [100, 50, 100],
      data: data.data,
      actions: [
        {
          action: 'view',
          title: 'View',
          icon: '/action-view.png'
        },
        {
          action: 'close',
          title: 'Close',
          icon: '/action-close.png'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification click handling
self.addEventListener('notificationclick', event => {
  console.log('[ServiceWorker] Notification click');

  event.notification.close();

  if (event.action === 'view') {
    // Open the app
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  }
});

// Message handling for communication with main thread
self.addEventListener('message', event => {
  console.log('[ServiceWorker] Message received:', event.data);

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_CACHE_STATUS') {
    event.ports[0].postMessage({
      type: 'CACHE_STATUS',
      data: getCacheStatus()
    });
  }

  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(clearAllCaches());
    event.ports[0].postMessage({
      type: 'CACHE_CLEARED',
      data: { success: true }
    });
  }
});

/**
 * Determine caching strategy for a request
 */
function determineCachingStrategy(url) {
  // Never cache certain patterns
  if (matchesPattern(url, NEVER_CACHE_PATTERNS)) {
    return CACHE_STRATEGIES.NETWORK_ONLY;
  }

  // Cache API endpoints with stale-while-revalidate
  if (matchesPattern(url, API_CACHE_PATTERNS)) {
    return CACHE_STRATEGIES.STALE_WHILE_REVALIDATE;
  }

  // Static assets with cache-first
  if (isStaticAsset(url)) {
    return CACHE_STRATEGIES.CACHE_FIRST;
  }

  // Default to network-first for dynamic content
  return CACHE_STRATEGIES.NETWORK_FIRST;
}

/**
 * Handle request based on caching strategy
 */
async function handleRequest(request, strategy) {
  switch (strategy) {
    case CACHE_STRATEGIES.CACHE_FIRST:
      return handleCacheFirst(request);

    case CACHE_STRATEGIES.NETWORK_FIRST:
      return handleNetworkFirst(request);

    case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
      return handleStaleWhileRevalidate(request);

    case CACHE_STRATEGIES.NETWORK_ONLY:
      return handleNetworkOnly(request);

    default:
      return fetch(request);
  }
}

/**
 * Cache-first strategy
 */
async function handleCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('[ServiceWorker] Cache-first fetch failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network-first strategy
 */
async function handleNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[ServiceWorker] Network-first fetch failed, trying cache');
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Stale-while-revalidate strategy
 */
async function handleStaleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  // Start network request
  const networkPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(error => {
    console.log('[ServiceWorker] Stale-while-revalidate network failed');
    return null;
  });

  // Return cached version immediately if available
  if (cached) {
    // Update cache in background
    networkPromise.then(response => {
      if (response) {
        cache.put(request, response);
      }
    });
    return cached;
  }

  // No cache available, wait for network
  const response = await networkPromise;
  if (response) {
    return response;
  }

  return new Response('Offline', { status: 503 });
}

/**
 * Network-only strategy
 */
async function handleNetworkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    return new Response('Network Error', { status: 503 });
  }
}

/**
 * Check if URL matches any pattern
 */
function matchesPattern(url, patterns) {
  return patterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(url);
    }
    return url.includes(pattern);
  });
}

/**
 * Check if URL is a static asset
 */
function isStaticAsset(url) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/.test(url);
}

/**
 * Sync offline transactions
 */
async function syncOfflineTransactions() {
  try {
    console.log('[ServiceWorker] Syncing offline transactions');

    // Get offline transactions from IndexedDB or localStorage
    const offlineTransactions = await getOfflineTransactions();

    for (const transaction of offlineTransactions) {
      try {
        // Attempt to sync transaction
        const response = await fetch('/api/transactions/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(transaction)
        });

        if (response.ok) {
          // Remove from offline storage
          await removeOfflineTransaction(transaction.id);
          console.log('[ServiceWorker] Transaction synced successfully:', transaction.id);
        }
      } catch (error) {
        console.error('[ServiceWorker] Failed to sync transaction:', transaction.id, error);
      }
    }
  } catch (error) {
    console.error('[ServiceWorker] Background sync failed:', error);
  }
}

/**
 * Get offline transactions (mock implementation)
 */
async function getOfflineTransactions() {
  // This would integrate with IndexedDB or localStorage
  // For now, return empty array
  return [];
}

/**
 * Remove offline transaction (mock implementation)
 */
async function removeOfflineTransaction(transactionId) {
  // This would remove from IndexedDB or localStorage
  console.log('[ServiceWorker] Removed offline transaction:', transactionId);
}

/**
 * Get cache status for monitoring
 */
async function getCacheStatus() {
  const cacheNames = await caches.keys();
  const cacheStatus = {};

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    cacheStatus[cacheName] = {
      size: keys.length,
      urls: keys.map(req => req.url)
    };
  }

  return cacheStatus;
}

/**
 * Clear all caches
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
  console.log('[ServiceWorker] All caches cleared');
}

// Handle errors in service worker
self.addEventListener('error', event => {
  console.error('[ServiceWorker] Error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[ServiceWorker] Unhandled promise rejection:', event.reason);
});
