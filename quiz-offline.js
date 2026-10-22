// ==================== OFFLINE STORAGE (IndexedDB) ====================
const QUIZZY_DB = 'QuizzyOfflineDB';
const QUIZZY_DB_VER = 2;

const MATHJAX_OFFLINE_URLS = [
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_Main-Regular.woff',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_Main-Bold.woff',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_Main-Italic.woff',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_Math-Italic.woff',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_Math-BoldItalic.woff',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_Size1-Regular.woff',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_Size2-Regular.woff',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/output/chtml/fonts/woff-v2/MathJax_AMS-Regular.woff',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/input/tex/extensions/noerrors.js',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/input/tex/extensions/mhchem.js',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/input/tex/extensions/cancel.js',
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/input/tex/extensions/enclose.js',
    'https://cdn.jsdelivr.net/npm/smiles-drawer@2.4.1/dist/smiles-drawer.min.js'
];

class QuizOfflineStorage {
    constructor() {
        this.db = null;
    }

    async open() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(QUIZZY_DB, QUIZZY_DB_VER);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('quizData')) {
                    db.createObjectStore('quizData', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('images')) {
                    db.createObjectStore('images', { keyPath: 'url' });
                }
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('customTests')) {
                    db.createObjectStore('customTests', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('testResults')) {
                    db.createObjectStore('testResults', { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    // ==================== QUIZ DATA ====================
    async saveQuizData(fileId, normalizedData) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('quizData', 'readwrite');
            tx.objectStore('quizData').put({
                id: fileId,
                data: normalizedData,
                savedAt: Date.now()
            });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async getQuizData(fileId) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('quizData', 'readonly');
            const req = tx.objectStore('quizData').get(fileId);
            req.onsuccess = () => resolve(req.result ? req.result.data : null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async deleteQuizData(fileId) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('quizData', 'readwrite');
            tx.objectStore('quizData').delete(fileId);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async getAllQuizDataKeys() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('quizData', 'readonly');
            const req = tx.objectStore('quizData').getAllKeys();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    // ==================== IMAGE CACHING ====================
    async saveImage(url, blob) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('images', 'readwrite');
            tx.objectStore('images').put({ url, blob, savedAt: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async getImage(url) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('images', 'readonly');
            const req = tx.objectStore('images').get(url);
            req.onsuccess = () => resolve(req.result ? req.result.blob : null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async isImageCached(url) {
        const blob = await this.getImage(url);
        return blob !== null;
    }

    async deleteImagesForFile(fileId) {
        // Get the quiz data to find all image URLs
        const data = await this.getQuizData(fileId);
        if (!data || !data.chapters) return;
        const db = await this.open();
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        data.chapters.forEach(ch => {
            (ch.topics || []).forEach(t => {
                (t.questions || []).forEach(q => {
                    if (q.image_url) store.delete(q.image_url);
                });
            });
        });
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // ==================== METADATA ====================
    async saveMetadata(id, meta) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('metadata', 'readwrite');
            tx.objectStore('metadata').put({ id, ...meta, updatedAt: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async getMetadata(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('metadata', 'readonly');
            const req = tx.objectStore('metadata').get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async getAllMetadata() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('metadata', 'readonly');
            const req = tx.objectStore('metadata').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    // ==================== CUSTOM TESTS ====================
    async saveCustomTest(testConfig) {
        const db = await this.open();
        const id = testConfig.id || `test_${Date.now()}`;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('customTests', 'readwrite');
            tx.objectStore('customTests').put({ ...testConfig, id, savedAt: Date.now() });
            tx.oncomplete = () => resolve(id);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async getCustomTest(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('customTests', 'readonly');
            const req = tx.objectStore('customTests').get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async getAllCustomTests() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('customTests', 'readonly');
            const req = tx.objectStore('customTests').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    async deleteCustomTest(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('customTests', 'readwrite');
            tx.objectStore('customTests').delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // ==================== TEST RESULTS ====================
    async saveTestResult(result) {
        const db = await this.open();
        const id = result.id || `result_${Date.now()}`;
        return new Promise((resolve, reject) => {
            const tx = db.transaction('testResults', 'readwrite');
            tx.objectStore('testResults').put({ ...result, id, savedAt: Date.now() });
            tx.oncomplete = () => resolve(id);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async getAllTestResults() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('testResults', 'readonly');
            const req = tx.objectStore('testResults').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    // Helper: Collect all possible image URLs from an array of questions (including inline HTML)
    extractAllImagesFromQuestions(questionsArray) {
        const urls = new Set();
        const normalize = (u) => {
            if (!u || typeof u !== 'string') return null;
            let str = u.trim();
            if (str.startsWith('//')) str = 'https:' + str;
            return str.length > 0 ? str : null;
        };
        const addUrl = (u) => {
            const clean = normalize(u);
            if (clean && !clean.startsWith('data:')) urls.add(clean);
        };
        const scanHtml = (html) => {
            if (!html || typeof html !== 'string') return;
            const imgRegex = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
            let m;
            while ((m = imgRegex.exec(html)) !== null) {
                if (m[1]) addUrl(m[1]);
            }
        };

        (questionsArray || []).forEach(q => {
            if (!q) return;
            // Explicit image fields
            if (q.image_url) addUrl(q.image_url);
            if (Array.isArray(q.images)) q.images.forEach(addUrl);
            if (q.explanation_image) addUrl(q.explanation_image);
            if (Array.isArray(q.explanation_images)) q.explanation_images.forEach(addUrl);
            if (Array.isArray(q.optionImages)) q.optionImages.forEach(addUrl);

            // Inline images within text fields
            scanHtml(q.question);
            scanHtml(q.explanation);
            scanHtml(q.solution);
            scanHtml(q.solution_text);
            scanHtml(q.hint);

            if (Array.isArray(q.options)) {
                q.options.forEach(opt => {
                    if (typeof opt === 'string') {
                        scanHtml(opt);
                    } else if (opt && typeof opt === 'object') {
                        if (opt.image || opt.imageUrl || opt.img) addUrl(opt.image || opt.imageUrl || opt.img);
                        if (opt.text) scanHtml(opt.text);
                    }
                });
            }

            // Translations (Hindi, etc.)
            if (q.translations && q.translations.hi) {
                const hi = q.translations.hi;
                if (hi.image_url) addUrl(hi.image_url);
                if (hi.image) addUrl(hi.image);
                if (Array.isArray(hi.images)) hi.images.forEach(addUrl);
                if (hi.explanation_image) addUrl(hi.explanation_image);
                if (Array.isArray(hi.explanation_images)) hi.explanation_images.forEach(addUrl);
                if (Array.isArray(hi.optionImages)) hi.optionImages.forEach(addUrl);
                scanHtml(hi.question);
                scanHtml(hi.explanation);
                scanHtml(hi.solution);
                scanHtml(hi.hint);
                if (Array.isArray(hi.options)) {
                    hi.options.forEach(opt => {
                        if (typeof opt === 'string') scanHtml(opt);
                        else if (opt && typeof opt === 'object') {
                            if (opt.image || opt.imageUrl || opt.img) addUrl(opt.image || opt.imageUrl || opt.img);
                            if (opt.text) scanHtml(opt.text);
                        }
                    });
                }
            }

            // Match-the-following diagrams
            if (q.matchLists) {
                (q.matchLists.listI?.items || []).forEach(it => {
                    const u = it.image_url || it.image || it.imageUrl;
                    if (u) addUrl(u);
                    if (it.text) scanHtml(it.text);
                });
                (q.matchLists.listII?.items || []).forEach(it => {
                    const u = it.image_url || it.image || it.imageUrl;
                    if (u) addUrl(u);
                    if (it.text) scanHtml(it.text);
                });
            }
        });
        return Array.from(urls);
    }

    // Helper: Pre-cache MathJax bundle and webfonts into CDN_CACHE
    async precacheMathJax(cdnCache) {
        if (!cdnCache || !navigator.onLine) return;
        for (const u of MATHJAX_OFFLINE_URLS) {
            try {
                const match = await cdnCache.match(u);
                if (!match) {
                    const resp = await fetch(u);
                    if (resp.ok) await cdnCache.put(u, resp);
                }
            } catch (err) { /* ignore single asset failure */ }
        }
    }

    // ==================== DOWNLOAD TOPIC WITH IMAGES ====================
    async downloadTopicForOffline(fileId, chapterId, topicId, questionsArray, progressCb) {
        const allImages = this.extractAllImagesFromQuestions(questionsArray);
        const total = allImages.length;
        let done = 0;

        let cdnCache = null;
        try {
            if ('caches' in window) {
                const keys = await caches.keys();
                const cdnKey = keys.find(k => k.endsWith('-cdn')) || 'quizzy-v38-cdn';
                cdnCache = await caches.open(cdnKey);
                // Pre-cache math typesetting engine for offline math formulas
                await this.precacheMathJax(cdnCache);
            }
        } catch (e) { /* ignore */ }

        for (const url of allImages) {
            try {
                const cached = await this.isImageCached(url);
                if (!cached && navigator.onLine) {
                    const resp = await fetch(url);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        await this.saveImage(url, blob);
                        if (cdnCache) {
                            try {
                                await cdnCache.put(new Request(url), new Response(blob.slice(0), {
                                    headers: { 'Content-Type': blob.type || 'image/png' }
                                }));
                            } catch (err) { /* ignore cross-origin cache errors */ }
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to cache image for offline:', url, e);
            }
            done++;
            if (progressCb) progressCb(done, total);
        }

        // Save download metadata
        const metaId = `${fileId}__${chapterId}__${topicId}`;
        await this.saveMetadata(metaId, {
            fileId, chapterId, topicId,
            questionCount: questionsArray.length,
            imageCount: total,
            downloadedAt: Date.now(),
            status: 'complete'
        });
    }

    async isTopicDownloaded(fileId, chapterId, topicId) {
        const metaId = `${fileId}__${chapterId}__${topicId}`;
        const meta = await this.getMetadata(metaId);
        return meta && meta.status === 'complete';
    }

    async deleteTopicOffline(fileId, chapterId, topicId) {
        const metaId = `${fileId}__${chapterId}__${topicId}`;
        const db = await this.open();
        const tx = db.transaction('metadata', 'readwrite');
        tx.objectStore('metadata').delete(metaId);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // ==================== FULL FILE DOWNLOAD ====================
    async downloadFileForOffline(fileName, normalizedData, progressCb) {
        // Save the quiz data JSON
        await this.saveQuizData(fileName, normalizedData);

        // Collect all questions across all chapters, topics, sections, and flat structures
        const allQuestions = [];
        (normalizedData.chapters || []).forEach(ch => {
            (ch.topics || []).forEach(t => {
                (t.questions || []).forEach(q => allQuestions.push(q));
            });
            if (Array.isArray(ch.questions)) {
                ch.questions.forEach(q => allQuestions.push(q));
            }
        });
        if (Array.isArray(normalizedData.questions)) {
            normalizedData.questions.forEach(q => allQuestions.push(q));
        }
        if (Array.isArray(normalizedData.sections)) {
            normalizedData.sections.forEach(s => (s.questions || []).forEach(q => allQuestions.push(q)));
        }

        const allImages = this.extractAllImagesFromQuestions(allQuestions);
        const total = allImages.length;
        let done = 0;

        let cdnCache = null;
        try {
            if ('caches' in window) {
                const keys = await caches.keys();
                const cdnKey = keys.find(k => k.endsWith('-cdn')) || 'quizzy-v38-cdn';
                cdnCache = await caches.open(cdnKey);
                // Pre-cache math typesetting engine for offline math formulas
                await this.precacheMathJax(cdnCache);
            }
        } catch (e) { /* ignore */ }

        for (const url of allImages) {
            try {
                const cached = await this.isImageCached(url);
                if (!cached && navigator.onLine) {
                    const resp = await fetch(url);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        await this.saveImage(url, blob);
                        if (cdnCache) {
                            try {
                                await cdnCache.put(new Request(url), new Response(blob.slice(0), {
                                    headers: { 'Content-Type': blob.type || 'image/png' }
                                }));
                            } catch (err) { /* ignore cross-origin cache errors */ }
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to cache image:', url, e);
            }
            done++;
            if (progressCb) progressCb(done, total);
        }

        await this.saveMetadata(`file__${fileName}`, {
            fileName,
            totalQuestions: allQuestions.length,
            totalImages: total,
            downloadedAt: Date.now(),
            status: 'complete'
        });
    }

    async isFileDownloaded(fileName) {
        const meta = await this.getMetadata(`file__${fileName}`);
        return meta && meta.status === 'complete';
    }

    async deleteFileOffline(fileName) {
        await this.deleteImagesForFile(fileName);
        await this.deleteQuizData(fileName);
        const db = await this.open();
        const tx = db.transaction('metadata', 'readwrite');
        tx.objectStore('metadata').delete(`file__${fileName}`);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // ==================== STORAGE USAGE ====================
    async getStorageEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            return {
                usage: est.usage || 0,
                quota: est.quota || 0,
                usageMB: ((est.usage || 0) / 1024 / 1024).toFixed(1),
                quotaMB: ((est.quota || 0) / 1024 / 1024).toFixed(0),
                percentUsed: est.quota ? ((est.usage / est.quota) * 100).toFixed(1) : 0
            };
        }
        return { usage: 0, quota: 0, usageMB: '?', quotaMB: '?', percentUsed: 0 };
    }

    // ==================== GET OFFLINE IMAGE URL ====================
    async getOfflineImageUrl(originalUrl) {
        const blob = await this.getImage(originalUrl);
        if (blob) {
            return URL.createObjectURL(blob);
        }
        return originalUrl; // fallback to network
    }
}

// Global instance
const offlineStorage = new QuizOfflineStorage();

// ==================== UI HELPERS FOR DOWNLOAD ====================
async function downloadTopicUI(fileId, chapterId, topicIdx, btnElement) {
    if (!topics || !topics[topicIdx]) return;

    const topic = topics[topicIdx];
    const qs = topic.questions || [];
    const originalText = btnElement.innerHTML;

    // Check storage
    const est = await offlineStorage.getStorageEstimate();
    if (est.usage > 500 * 1024 * 1024) {
        if (!confirm(`⚠️ Storage usage is over 500MB (${est.usageMB}MB used). Downloading more may slow your device. Continue?`)) {
            return;
        }
    }

    btnElement.disabled = true;
    btnElement.innerHTML = '⏳';

    try {
        await offlineStorage.downloadTopicForOffline(
            fileId, chapterId, topicIdx.toString(), qs,
            (done, total) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 100;
                btnElement.innerHTML = `⏳ ${pct}%`;
            }
        );
        btnElement.innerHTML = '✅';
        btnElement.classList.add('downloaded');
        btnElement.title = 'Available offline (click to remove)';
        btnElement.disabled = false;
    } catch (e) {
        console.error('Download failed:', e);
        btnElement.innerHTML = '❌';
        setTimeout(() => {
            btnElement.innerHTML = originalText;
            btnElement.disabled = false;
        }, 2000);
    }
}

async function downloadFileUI(fileName, normalizedData, btnElement) {
    const originalText = btnElement.innerHTML;

    const est = await offlineStorage.getStorageEstimate();
    if (est.usage > 500 * 1024 * 1024) {
        if (!confirm(`⚠️ Storage usage is over 500MB (${est.usageMB}MB used). Downloading more content may slow your device. Continue?`)) {
            return;
        }
    }

    btnElement.disabled = true;
    btnElement.innerHTML = '⏳';

    try {
        await offlineStorage.downloadFileForOffline(
            fileName, normalizedData,
            (done, total) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 100;
                btnElement.innerHTML = `⏳ ${pct}%`;
            }
        );
        btnElement.innerHTML = '✅';
        btnElement.classList.add('downloaded');
        btnElement.title = 'Available offline (click to remove)';
        btnElement.disabled = false;
    } catch (e) {
        console.error('Download failed:', e);
        btnElement.innerHTML = '❌';
        setTimeout(() => {
            btnElement.innerHTML = originalText;
            btnElement.disabled = false;
        }, 2000);
    }
}

async function checkAndShowOfflineStatus() {
    const indicator = document.getElementById('offlineIndicator');
    if (!indicator) return;

    if (!navigator.onLine) {
        indicator.classList.add('show');
        indicator.textContent = '📴 Offline Mode';
    } else {
        indicator.classList.remove('show');
    }
}

window.addEventListener('online', checkAndShowOfflineStatus);
window.addEventListener('offline', checkAndShowOfflineStatus);
