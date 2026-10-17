// ==================== SERVICE WORKER ====================
// Bump this on every deploy — same-origin files are served cache-first, so a
// stale version here means returning visitors keep the old CSS/JS.
const CACHE_VERSION = 'quizzy-v33';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;

const APP_SHELL_FILES = [
    './',
    './question-cafe.html',
    './test-cafe.html',
    './notes-cafe.html',
    './index.html',
    './about.html',
    './contact.html',
    './privacy.html',
    './bookmarks.html',
    './test-bookmarks.html',
    './style.css',
    './quiz-core.css',
    './quiz-components.css',
    './test-cafe.css',
    './notes-cafe.css',
    './app-shell.js',
    './quiz-core.js',
    './quiz-acrolly-render.js',
    './quiz-pyqhub-render.js',
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
    './notes-cafe.js',
    './test-engine.js',
    './test-history.js',
    './test-bookmarks.js',
    './test-ui.js',
    './data/manifest.json',
    './data/test-manifest.json',
    './data/notes-manifest.json',
    './icons/icon-512x512.png',
    './icons/quizzy-logo.svg'
];

const CDN_URLS = [
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_Main-Regular.woff',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_Math-Italic.woff',
    'https://cdn.jsdelivr.net/npm/smiles-drawer@2.4.1/dist/smiles-drawer.min.js'
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

    // Data JSON files: network-first with cache fallback. ignoreSearch keeps the
    // fallback working even if a caller appends a cache-busting query string.
    if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
        e.respondWith(
            fetch(e.request).then(resp => {
                if (resp.ok) {
                    const clone = resp.clone();
                    caches.open(APP_SHELL_CACHE).then(cache => cache.put(e.request, clone));
                }
                return resp;
            }).catch(() => caches.match(e.request, { ignoreSearch: true }))
        );
        return;
    }

    // Image URLs (S3, Allen CDN, Cloudinary, ibb, etc.): cache-first with network fallback
    if (
        e.request.destination === 'image' ||
        url.hostname.includes('s3') ||
        url.hostname.includes('amazonaws.com') ||
        url.hostname.includes('allen') ||
        url.hostname.includes('cloudinary') ||
        url.hostname.includes('ibb.co') ||
        /\.(png|jpg|jpeg|gif|webp|svg)($|\?)/i.test(url.pathname)
    ) {
        e.respondWith(
            caches.open(CDN_CACHE).then(cache => {
                return cache.match(e.request).then(cached => {
                    if (cached) return cached;
                    return fetch(e.request).then(resp => {
                        if (resp.ok) cache.put(e.request, resp.clone());
                        return resp;
                    }).catch(() => {
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
