// ==================== OFFLINE STORAGE (IndexedDB) ====================
const QUIZZY_DB = 'QuizzyOfflineDB';
const QUIZZY_DB_VER = 2;

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

    // ==================== DOWNLOAD TOPIC WITH IMAGES ====================
    async downloadTopicForOffline(fileId, chapterId, topicId, questionsArray, progressCb) {
        const total = questionsArray.filter(q => q.image_url).length;
        let done = 0;

        for (const q of questionsArray) {
            if (q.image_url) {
                try {
                    const cached = await this.isImageCached(q.image_url);
                    if (!cached) {
                        const resp = await fetch(q.image_url);
                        if (resp.ok) {
                            const blob = await resp.blob();
                            await this.saveImage(q.image_url, blob);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to cache image:', q.image_url, e);
                }
                done++;
                if (progressCb) progressCb(done, total);
            }
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

        // Collect all image URLs
        const allImages = [];
        (normalizedData.chapters || []).forEach(ch => {
            (ch.topics || []).forEach(t => {
                (t.questions || []).forEach(q => {
                    if (q.image_url) allImages.push(q.image_url);
                });
            });
        });

        const total = allImages.length;
        let done = 0;

        for (const url of allImages) {
            try {
                const cached = await this.isImageCached(url);
                if (!cached) {
                    const resp = await fetch(url);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        await this.saveImage(url, blob);
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
            totalQuestions: normalizedData.chapters.reduce((sum, ch) =>
                sum + (ch.topics || []).reduce((s, t) => s + (t.questions || []).length, 0), 0),
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
    btnElement.innerHTML = '⏳ 0%';

    try {
        await offlineStorage.downloadTopicForOffline(
            fileId, chapterId, topicIdx.toString(), qs,
            (done, total) => {
                const pct = Math.round((done / total) * 100);
                btnElement.innerHTML = `⏳ ${pct}%`;
            }
        );
        btnElement.innerHTML = '✅ Downloaded';
        btnElement.classList.add('downloaded');
    } catch (e) {
        console.error('Download failed:', e);
        btnElement.innerHTML = '❌ Failed';
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
    btnElement.innerHTML = '⏳ Preparing...';

    try {
        await offlineStorage.downloadFileForOffline(
            fileName, normalizedData,
            (done, total) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 100;
                btnElement.innerHTML = `⏳ ${pct}%`;
            }
        );
        btnElement.innerHTML = '✅ Saved Offline';
        btnElement.classList.add('downloaded');
    } catch (e) {
        console.error('Download failed:', e);
        btnElement.innerHTML = '❌ Failed';
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
