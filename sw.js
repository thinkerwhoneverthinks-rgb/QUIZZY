// ==================== SERVICE WORKER ====================
// Bump this on every deploy — same-origin files are served cache-first, so a
// stale version here means returning visitors keep the old CSS/JS.
const CACHE_VERSION = 'quizzy-v3';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

const APP_SHELL_FILES = [
    './',
    './question-cafe.html',
    './index.html',
    './about.html',
    './contact.html',
    './privacy.html',
    './bookmarks.html',
    './style.css',
    './quiz-core.css',
    './quiz-components.css',
    './app-shell.js',
    './quiz-core.js',
    './quiz-nav.js',
    './quiz-screens.js',
    './quiz-render.js',
    './quiz-test.js',
    './quiz-interact.js',
    './quiz-review.js',
    './quiz-bookmarks.js',
    './quiz-offline.js',
    './quiz-custom-test.js',
    './quiz-history.js',
    './data/manifest.json',
    './icons/icon-512x512.png',
    './icons/quizzy-logo.svg'
];

const CDN_URLS = [
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
    'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js'
];

// Install: cache app shell
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(APP_SHELL_CACHE).then(cache => {
            return cache.addAll(APP_SHELL_FILES).catch(err => {
                console.warn('Some shell files failed to cache:', err);
                // Cache what we can
                return Promise.allSettled(
                    APP_SHELL_FILES.map(url => cache.add(url).catch(() => null))
                );
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== APP_SHELL_CACHE && key !== CDN_CACHE)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: strategy based on request type
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // CDN resources: cache-first with network fallback
    if (url.hostname === 'cdn.jsdelivr.net') {
        e.respondWith(
            caches.open(CDN_CACHE).then(cache => {
                return cache.match(e.request).then(cached => {
                    if (cached) return cached;
                    return fetch(e.request).then(resp => {
                        if (resp.ok) cache.put(e.request, resp.clone());
                        return resp;
                    });
                });
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // Data JSON files: network-first with cache fallback
    if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
        e.respondWith(
            fetch(e.request).then(resp => {
                if (resp.ok) {
                    const clone = resp.clone();
                    caches.open(APP_SHELL_CACHE).then(cache => cache.put(e.request, clone));
                }
                return resp;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // Image URLs (cloudinary etc): cache-first
    if (url.hostname.includes('cloudinary') || url.hostname.includes('ibb.co') || url.hostname.includes('i.ibb.co')) {
        e.respondWith(
            caches.open(CDN_CACHE).then(cache => {
                return cache.match(e.request).then(cached => {
                    if (cached) return cached;
                    return fetch(e.request).then(resp => {
                        if (resp.ok) cache.put(e.request, resp.clone());
                        return resp;
                    }).catch(() => {
                        // Return a placeholder for offline images
                        return new Response('', { status: 404, statusText: 'Offline' });
                    });
                });
            })
        );
        return;
    }

    // App shell files: cache-first with network fallback
    if (url.origin === self.location.origin) {
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) return cached;
                return fetch(e.request).then(resp => {
                    if (resp.ok) {
                        const clone = resp.clone();
                        caches.open(APP_SHELL_CACHE).then(cache => cache.put(e.request, clone));
                    }
                    return resp;
                });
            }).catch(() => {
                // Offline fallback for navigation
                if (e.request.mode === 'navigate') {
                    return caches.match('./question-cafe.html');
                }
            })
        );
        return;
    }

    // Default: network-first
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
