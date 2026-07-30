const CACHE_NAME = 'blademaster-v16';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css',
    './js/db.js',
    './js/api.js',
    './js/auth.js',
    './js/modules/customers.js',
    './js/modules/vendors.js',
    './js/modules/expenses.js',
    './js/modules/billing.js',
    './js/modules/ledger.js',
    './js/modules/reports.js',
    './js/modules/dashboard.js',
    './js/modules/profitloss.js',
    './js/app.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching App Shell static assets');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Removing old cache', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    const req = event.request;
    
    // Ignore non-GET requests or Google Apps Script API calls (handled via IndexedDB offline queue)
    if (req.method !== 'GET' || req.url.includes('script.google.com')) {
        return;
    }

    event.respondWith(
        caches.match(req).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached asset, fetch update in background
                fetch(req).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }
            return fetch(req).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, responseToCache));
                return networkResponse;
            });
        })
    );
});
