const CACHE_NAME = 'roomos-v5';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/api.js',
    './js/state.js',
    './js/store.js',
    './js/sync.js',
    './js/ui/login.js',
    './js/ui/group_setup.js',
    './js/ui/dashboard.js',
    './js/ui/roster.js',
    './js/ui/crew.js',
    './js/ui/rules.js',
    './js/ui/profile.js',
    './js/ui/transactions.js',
    './js/ui/chat.js',
    './js/ui/toast.js',
    './manifest.json',
    './icon.svg'
];

// Install: Cache Static Assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});

// Fetch: Network First, fall back to Cache for HTML/CSS/JS
// For API: We will handle that in the application layer (api.js) or here?
// Strategy: 
// 1. Static Assets -> Cache First (stale-while-revalidate could be better but Cache First is safer for offline)
// 2. API -> Network Only (handled by app logic for now, or we can intercept here)
// Let's stick to Stale-While-Revalidate for static assets to ensure updates
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignore API calls (handled by JS) and non-GET
    if (url.pathname.startsWith('/roomOS/server/') || request.method !== 'GET') {
        return;
    }

    // Strategy: Cache First for cross-origin requests (like Google Fonts)
    // This prevents CORS issues with opaque responses.
    if (url.origin !== self.location.origin) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                // Not in cache, fetch from network, cache it, and return it.
                // The response will be "opaque", but we can still cache it.
                const networkResponse = await fetch(request);
                cache.put(request, networkResponse.clone());
                return networkResponse;
            })
        );
        return; // Stop further execution for cross-origin requests
    }
    // Strategy: Stale-While-Revalidate for your own app assets (CSS, JS, etc.)
    // This serves from cache immediately for speed, then updates the cache in the background.
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const networkResponsePromise = fetch(request).then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
        });
        return cachedResponse || networkResponsePromise;
    }));
});
