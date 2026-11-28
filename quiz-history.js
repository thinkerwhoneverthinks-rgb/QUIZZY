
// ==================== EXERCISE ATTEMPTS & SESSION PROGRESS ====================
const EXERCISE_ATTEMPTS_KEY = 'quizzy-exercise-attempts';
const EXERCISE_SESSIONS_KEY = 'quizzy-exercise-sessions';
const MAX_EXERCISE_ATTEMPTS = 500;

function getExerciseAttempts() {
    try {
        const raw = JSON.parse(localStorage.getItem(EXERCISE_ATTEMPTS_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch (e) {
        return [];
    }
}

function saveExerciseAttempts(list) {
    const trimmed = (list || [])
        .slice()
        .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
        .slice(0, MAX_EXERCISE_ATTEMPTS);
    try {
        localStorage.setItem(EXERCISE_ATTEMPTS_KEY, JSON.stringify(trimmed));
    } catch (e) {
        console.warn('Could not save exercise attempt:', e);
    }
    return trimmed;
}

function getExerciseAttemptsByKey(exerciseKey) {
    return getExerciseAttempts().filter(a => a.exerciseKey === exerciseKey);
}

function getLatestExerciseAttempt(exerciseKey) {
    const list = getExerciseAttemptsByKey(exerciseKey);
    return list.length > 0 ? list[0] : null;
}

function saveExerciseAttempt(attempt) {
    if (!attempt || !attempt.exerciseKey) return;
    const list = getExerciseAttempts();
    list.unshift(attempt);
    saveExerciseAttempts(list);
}

function deleteExerciseAttemptsByKey(exerciseKey) {
    const list = getExerciseAttempts().filter(a => a.exerciseKey !== exerciseKey);
    saveExerciseAttempts(list);
}

function getExerciseSessions() {
    try {
        const raw = JSON.parse(localStorage.getItem(EXERCISE_SESSIONS_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
        return {};
    }
}

function saveExerciseSession(exerciseKey, data) {
    if (!exerciseKey) return;
    const sessions = getExerciseSessions();
    sessions[exerciseKey] = Object.assign({}, data, { updatedAt: Date.now() });
    try {
        localStorage.setItem(EXERCISE_SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
        console.warn('Could not save exercise session:', e);
    }
}

function getExerciseSession(exerciseKey) {
    if (!exerciseKey) return null;
    const sessions = getExerciseSessions();
    return sessions[exerciseKey] || null;
}

function clearExerciseSession(exerciseKey) {
    if (!exerciseKey) return;
    const sessions = getExerciseSessions();
    delete sessions[exerciseKey];
    try {
        localStorage.setItem(EXERCISE_SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
        console.warn('Could not clear exercise session:', e);
    }
}

/* ============================================================
   Quizzy — Study History
   Remembers what the user was solving (file → chapter → topics →
   question) so they can jump straight back to it later.
   Stored in localStorage; no question content is copied, only the
   coordinates needed to reopen it.
   ============================================================ */

const HISTORY_KEY = 'quizzy-history';
const CUSTOM_HISTORY_KEY = 'quizzy-custom-history';
const HISTORY_LIMIT = 40;
let activeHistoryTab = 'study'; // 'study' | 'custom'

function isCustomHistoryEntry(entry) {
    if (!entry) return false;
    if (entry.isCustom) return true;
    const chId = String(entry.chapterId || '');
    return !entry.file || chId.startsWith('custom_');
}

function getHistoryModuleTrail(entry) {
    if (!entry) return [];
    const filePath = entry.file || '';
    const chapLower = String(entry.chapterName || '').trim().toLowerCase();

    if (filePath && typeof manifestRoot !== 'undefined' && manifestRoot && typeof findManifestFileMeta === 'function') {
        const meta = findManifestFileMeta(manifestRoot, filePath, []);
        if (meta && Array.isArray(meta.trail)) {
            const cleanTrail = meta.trail
                .map(t => String(t).replace(/^[^\w\d(]+/, '').trim())
                .filter(Boolean);
            const steps = [...cleanTrail];
            if (meta.title && meta.title.trim().toLowerCase() !== chapLower &&
                (!steps.length || steps[steps.length - 1].toLowerCase() !== meta.title.trim().toLowerCase()) &&
                steps.length < 3) {
                steps.push(meta.title.trim());
            }
            if (steps.length > 0) return steps.slice(-3);
        }
    }

    if (Array.isArray(entry.sourceTrail) && entry.sourceTrail.length > 0) {
        return entry.sourceTrail.slice(-3);
    }

    if (filePath) {
        const dirs = String(filePath).replace(/\\/g, '/').split('/').filter(Boolean);
        dirs.pop();
        const cleanDirs = dirs
            .map(d => d.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim())
            .filter(Boolean);
        if (cleanDirs.length > 0) return cleanDirs.slice(-3);
    }

    return [];
}

function getCleanHistoryFileLabel(filePath, fallbackLabel) {
    if (filePath && typeof manifestRoot !== 'undefined' && manifestRoot && typeof findManifestFileMeta === 'function') {
        const meta = findManifestFileMeta(manifestRoot, filePath, []);
        if (meta && meta.title) return meta.title;
    }
    const raw = filePath || fallbackLabel || '';
    if (!raw || raw === 'Custom Test') return '';
    const base = String(raw).split('/').pop().split('\\').pop();
    return base
        .replace(/\.json$/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getCustomTestHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem(CUSTOM_HISTORY_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch (e) {
        return [];
    }
}

function saveCustomTestHistory(list) {
    try {
        localStorage.setItem(CUSTOM_HISTORY_KEY, JSON.stringify((list || []).slice(0, HISTORY_LIMIT)));
    } catch (e) {
        console.warn('Could not save custom test history:', e);
    }
}

function _migrateLegacyCustomHistory(list) {
    if (!Array.isArray(list) || list.length === 0) return list;
    const regular = [];
    const legacyCustom = [];
    list.forEach(item => {
        if (isCustomHistoryEntry(item)) legacyCustom.push(item);
        else regular.push(item);
    });
    if (legacyCustom.length > 0) {
        const existingCustom = getCustomTestHistory();
        const existingIds = new Set(existingCustom.map(c => c.id));
        const migrated = legacyCustom
            .filter(c => !existingIds.has(c.id))
            .map(c => ({
                id: c.id,
                isCustom: true,
                kind: c.mode === 'test' ? 'test' : 'practice',
                title: c.chapterName || 'Custom Practice',
                mode: c.mode || 'onebyone',
                topicNames: c.topicNames || [],
                questionRefs: c.questionRefs || [],
                qIndex: c.qIndex || 0,
                userAnswers: c.userAnswers || {},
                total: c.total || 0,
                revealed: c.revealed || 0,
                updatedAt: c.updatedAt || Date.now(),
                startedAt: c.startedAt || Date.now()
            }));
        if (migrated.length > 0) {
            saveCustomTestHistory([...migrated, ...existingCustom].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        }
        saveStudyHistory(regular);
    }
    return regular;
}

function getStudyHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const list = Array.isArray(raw) ? raw : [];
        if (list.some(isCustomHistoryEntry)) {
            return _migrateLegacyCustomHistory(list);
        }
        return list;
    } catch (e) {
        return [];
    }
}

function saveStudyHistory(list) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
    } catch (e) {
        console.warn('Could not save study history:', e);
    }
}

/* Sessions are identified by where they are, not when they started, so
   returning to the same topics in the same mode updates one entry. */
function historySessionId(file, chapterId, mode, topicNames) {
    return [file || '', chapterId || '', mode || '', (topicNames || []).join('|')].join('::');
}

function findLatestStudySessionForChapter(file, chapterId) {
    if (!file || !chapterId) return null;
    const list = getStudyHistory();
    return list.find(h => h && h.file === file && h.chapterId === chapterId) || null;
}

function recordCustomHistorySession(extra) {
    if (typeof isBookmarkSession !== 'undefined' && isBookmarkSession) return;
    if (!currentChapter || !questions || questions.length === 0) return;

    const meta = (typeof window !== 'undefined' && window._activeCustomSessionMeta) ? window._activeCustomSessionMeta : null;
    const sessionId = (meta && meta.id) || currentChapter.id || `custom_${Date.now()}`;
    const list = getCustomTestHistory();
    const existingIdx = list.findIndex(c => c.id === sessionId);

    const topicNames = [...new Set(questions.map(q => q.topicName).filter(Boolean))];
    const revealed = Object.keys(userAnswers || {}).filter(k => {
        const a = userAnswers[k];
        return a && (a.revealed || a.selected !== undefined || (a.userAnswer && String(a.userAnswer).trim() !== ''));
    }).length;

    const questionRefs = (meta && Array.isArray(meta.questionRefs) && meta.questionRefs.length === questions.length)
        ? meta.questionRefs
        : questions.map(q => ({
            f: q._srcFile || '',
            c: q._srcChapterId || '',
            t: q.topicName || '',
            id: q.id || ''
        }));

    const prev = existingIdx >= 0 ? list[existingIdx] : {};
    const entry = {
        id: sessionId,
        isCustom: true,
        kind: (extra && extra.kind) || prev.kind || (currentMode === 'test' ? 'test' : 'practice'),
        title: (meta && meta.title) || prev.title || currentChapter.name || 'Custom Session',
        mode: currentMode || prev.mode || 'onebyone',
        topicNames,
        questionRefs,
        qIndex: typeof currentQIndex === 'number' ? currentQIndex : 0,
        userAnswers: userAnswers || {},
        total: questions.length,
        revealed,
        submitted: Boolean((extra && extra.submitted) || prev.submitted),
        correct: extra && extra.correct !== undefined ? extra.correct : prev.correct,
        wrong: extra && extra.wrong !== undefined ? extra.wrong : prev.wrong,
        skipped: extra && extra.skipped !== undefined ? extra.skipped : prev.skipped,
        percentage: extra && extra.percentage !== undefined ? extra.percentage : prev.percentage,
        elapsedSec: extra && extra.elapsedSec !== undefined ? extra.elapsedSec : prev.elapsedSec,
        testTimeLimit: typeof testTimeLimit === 'number' ? testTimeLimit : prev.testTimeLimit,
        updatedAt: Date.now(),
        startedAt: prev.startedAt || Date.now()
    };

    if (typeof window !== 'undefined') {
        window._activeCustomSessionMeta = { id: entry.id, title: entry.title, questionRefs: entry.questionRefs };
    }

    if (existingIdx >= 0) list.splice(existingIdx, 1);
    list.unshift(entry);
    saveCustomTestHistory(list);
}

/* Called as the user moves through questions. Cheap enough to run on every
   render — it writes one small array. */
function recordStudySession(extra) {
    if (typeof isBookmarkSession !== 'undefined' && isBookmarkSession) return;
    if (!currentChapter || !questions || questions.length === 0) return;

    const chId = String(currentChapter.id || '');
    if (!currentFileName || chId.startsWith('custom_')) {
        recordCustomHistorySession(extra);
        return;
    }
    if (!currentMode || currentMode === 'test') return; // tests are scored, not resumed

    const topicNames = [...new Set(questions.map(q => q.topicName).filter(Boolean))];
    const topicIndexes = topicNames
        .map(name => (topics || []).findIndex(t => t.topic === name))
        .filter(i => i >= 0);

    const revealed = Object.keys(userAnswers || {})
        .filter(k => userAnswers[k] && userAnswers[k].revealed).length;

    const id = historySessionId(currentFileName, currentChapter.id, currentMode, topicNames);
    const list = getStudyHistory();
    const existing = list.findIndex(h => h.id === id);

    const cleanLabel = getCleanHistoryFileLabel(currentFileName);
    const sourceTrail = getHistoryModuleTrail({ file: currentFileName, chapterName: currentChapter.name });
    const entry = {
        id,
        file: currentFileName || '',
        fileLabel: cleanLabel || currentChapter.name || '',
        sourceTrail,
        chapterId: currentChapter.id,
        chapterName: currentChapter.name,
        topicNames,
        topicIndexes,
        mode: currentMode,
        qIndex: currentQIndex,
        userAnswers: userAnswers || {},
        total: questions.length,
        revealed,
        updatedAt: Date.now(),
        startedAt: existing >= 0 ? list[existing].startedAt : Date.now()
    };
    Object.assign(entry, extra || {});

    if (existing >= 0) list.splice(existing, 1);
    list.unshift(entry);
    saveStudyHistory(list);
}

function restoreSavedTopicProgress() {
    if (typeof isBookmarkSession !== 'undefined' && isBookmarkSession) return;
    if (!currentChapter || !questions || questions.length === 0) return;
    if (!currentMode || currentMode === 'test') return;

    const topicNames = [...new Set(questions.map(q => q.topicName).filter(Boolean))];
    const id = historySessionId(currentFileName, currentChapter.id, currentMode, topicNames);
    const list = getStudyHistory();
    const saved = list.find(h => h.id === id);

    if (saved && saved.userAnswers) {
        userAnswers = saved.userAnswers || {};

        let firstUnsolved = -1;
        for (let i = 0; i < questions.length; i++) {
            if (!userAnswers[i] || !userAnswers[i].revealed) {
                firstUnsolved = i;
                break;
            }
        }

        if (firstUnsolved !== -1) {
            currentQIndex = firstUnsolved;
        } else {
            currentQIndex = questions.length - 1;
        }
    } else {
        userAnswers = {};
        currentQIndex = 0;
    }
}

function resetCurrentTopicProgress() {
    if (!confirm('Reset progress for this topic? All saved answers and progress will be cleared.')) return;

    if (currentChapter && questions && questions.length > 0 && currentMode && currentMode !== 'test') {
        const topicNames = [...new Set(questions.map(q => q.topicName).filter(Boolean))];
        const id = historySessionId(currentFileName, currentChapter.id, currentMode, topicNames);
        deleteStudySession(id);
    }

    userAnswers = {};
    currentQIndex = 0;

    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
        if (activeScreen.id === 'screenQuiz') renderQuestion();
        else if (activeScreen.id === 'screenFullQuiz') renderFullQuiz();
    }
}

function deleteStudySession(id) {
    saveStudyHistory(getStudyHistory().filter(h => h.id !== id));
    renderStudyHistory();
}

function deleteCustomHistorySession(id) {
    saveCustomTestHistory(getCustomTestHistory().filter(c => c.id !== id));
    renderStudyHistory();
}

function switchHistoryTab(tab) {
    activeHistoryTab = tab === 'custom' ? 'custom' : 'study';
    document.querySelectorAll('.history-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === activeHistoryTab);
    });
    renderStudyHistory();
}

function clearStudyHistory() {
    if (activeHistoryTab === 'custom') {
        if (!confirm('Clear your entire Custom Test History? Regular study history and bookmarks are not affected.')) return;
        saveCustomTestHistory([]);
    } else {
        if (!confirm('Clear your study history? Custom test history and bookmarks are not affected.')) return;
        saveStudyHistory([]);
    }
    renderStudyHistory();
}

// ==================== SCREEN ====================
function showStudyHistory(tab) {
    if (tab === 'custom' || tab === 'study') activeHistoryTab = tab;
    document.querySelectorAll('.history-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === activeHistoryTab);
    });
    renderStudyHistory();
    showScreen('screenHistory');
    if (typeof pushQuizHistory === 'function') {
        pushQuizHistory({ cafe: 'question', screen: 'screenHistory' });
    }
    if (typeof manifestRoot === 'undefined' || !manifestRoot) {
        fetch('data/manifest.json').then(r => r.json()).then(m => {
            manifestRoot = m;
            const histScreen = document.getElementById('screenHistory');
            if (histScreen && histScreen.classList.contains('active')) {
                renderStudyHistory();
            }
        }).catch(() => {});
    }
}

function timeAgo(ts) {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
    return new Date(ts).toLocaleDateString();
}

const MODE_LABELS = {
    onebyone: { icon: '🎯', name: 'One by One' },
    fullquiz: { icon: '📜', name: 'Full Quiz' },
    test: { icon: '⏱️', name: 'Test Mode' }
};

function renderCustomHistoryList(container) {
    const list = getCustomTestHistory();
    if (list.length === 0) {
        container.innerHTML = `
            <div class="history-empty">
                <div class="history-empty-icon">⚙️</div>
                <h3>No custom test history yet</h3>
                <p>Create a multi-topic Custom Test or Custom Practice and your sessions will appear here separately.</p>
                <button class="btn btn-primary" onclick="showCustomTestBuilder()">⚙️ Create Custom Test</button>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(c => {
        const isTest = c.kind === 'test' || c.mode === 'test';
        const modeLabel = isTest ? '⏱️ Custom Test' : (c.mode === 'fullquiz' ? '📜 Custom Scroll' : '🎯 Custom Practice');
        const total = c.total || 0;
        const done = c.revealed || 0;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const topicCount = Array.isArray(c.topicNames) ? c.topicNames.length : 0;
        const topicMeta = topicCount === 1
            ? escapeHtml(c.topicNames[0])
            : `${topicCount} topic${topicCount !== 1 ? 's' : ''}`;

        let statusText = isTest && c.submitted
            ? `Score: ${c.correct || 0}/${total} (${c.percentage || 0}%)`
            : `${done} of ${total} ${isTest ? 'answered' : 'revealed'}`;
        const canResume = Array.isArray(c.questionRefs) && c.questionRefs.length > 0 && c.questionRefs.some(r => r && r.f);
        const btnLabel = isTest && c.submitted ? '🔍 Review' : '▶ Resume';
        const safeId = String(c.id).replace(/'/g, "\\'");

        return `
            <div class="history-card" ${canResume ? `onclick="resumeCustomHistorySession('${safeId}')"` : ''}>
                <div class="history-card-top">
                    <span class="history-mode">${modeLabel}</span>
                    <span class="history-time">${timeAgo(c.updatedAt)}</span>
                </div>
                <div class="history-chapter">${escapeHtml(c.title || 'Custom Test')}</div>
                <div class="history-topic-summary">📌 ${topicMeta} · ${total} Qs</div>
                <div class="history-progress">
                    <div class="history-progress-track"><div class="history-progress-fill" style="width:${pct}%"></div></div>
                    <span class="history-position">${statusText}</span>
                </div>
                <div class="history-actions">
                    ${canResume ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); resumeCustomHistorySession('${safeId}')">${btnLabel}</button>` : ''}
                    <button class="history-delete" onclick="event.stopPropagation(); deleteCustomHistorySession('${safeId}')" title="Remove from custom history">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderStudyHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;

    document.querySelectorAll('.history-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === activeHistoryTab);
    });

    if (activeHistoryTab === 'custom') {
        renderCustomHistoryList(container);
        return;
    }

    const list = getStudyHistory();

    if (list.length === 0) {
        container.innerHTML = `
            <div class="history-empty">
                <div class="history-empty-icon">🕐</div>
                <h3>No study history yet</h3>
                <p>Start practising any topic and your session will show up here, ready to resume.</p>
                <button class="btn btn-primary" onclick="goToRoot()">☕ Browse Question Cafe</button>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(h => {
        const mode = MODE_LABELS[h.mode] || { icon: '📘', name: h.mode };
        const pct = h.total ? Math.round((h.revealed / h.total) * 100) : 0;
        const position = h.mode === 'fullquiz'
            ? `${h.revealed} of ${h.total} revealed`
            : `Question ${Math.min((h.qIndex || 0) + 1, h.total)} of ${h.total}`;
        const trailSteps = getHistoryModuleTrail(h);
        const trailHtml = trailSteps.length > 0
            ? `<div class="history-trail">📚 ${trailSteps.map(s => `<span>${escapeHtml(s)}</span>`).join('<span class="history-trail-sep">›</span>')}</div>`
            : '';
        const topicCount = Array.isArray(h.topicNames) ? h.topicNames.length : 0;
        const topicSummary = topicCount === 1
            ? escapeHtml(h.topicNames[0])
            : (topicCount > 1 ? `${topicCount} topics` : 'All topics');

        return `
            <div class="history-card" onclick="resumeStudySession('${h.id.replace(/'/g, "\\'")}')">
                <div class="history-card-top">
                    <span class="history-mode">${mode.icon} ${mode.name}</span>
                    <span class="history-time">${timeAgo(h.updatedAt)}</span>
                </div>
                <div class="history-chapter">${escapeHtml(h.chapterName)}</div>
                ${trailHtml}
                <div class="history-topic-summary">📌 ${topicSummary}</div>
                <div class="history-progress">
                    <div class="history-progress-track"><div class="history-progress-fill" style="width:${pct}%"></div></div>
                    <span class="history-position">${position}</span>
                </div>
                <div class="history-actions">
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); resumeStudySession('${h.id.replace(/'/g, "\\'")}')">▶ Resume</button>
                    <button class="history-delete" onclick="event.stopPropagation(); deleteStudySession('${h.id.replace(/'/g, "\\'")}')" title="Remove from history">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

async function resumeCustomHistorySession(id) {
    const entry = getCustomTestHistory().find(c => c.id === id);
    if (!entry || !Array.isArray(entry.questionRefs) || entry.questionRefs.length === 0) {
        alert('This custom session does not have enough saved data to resume.');
        return;
    }

    showScreen('screenLoading');
    try {
        const uniqueFiles = [...new Set(entry.questionRefs.map(r => r.f).filter(Boolean))];
        for (const f of uniqueFiles) {
            if (!loadedFiles[f]) {
                let raw = null;
                try { raw = await offlineStorage.getQuizData(f); } catch (e) {}
                if (!raw) {
                    const resp = await fetch(`data/${f}`);
                    if (resp.ok) raw = await resp.json();
                }
                if (raw) loadedFiles[f] = normalizeJsonData(raw, f);
            }
        }

        const rebuilt = [];
        entry.questionRefs.forEach(ref => {
            const data = loadedFiles[ref.f];
            if (!data || !Array.isArray(data.chapters)) return;
            const ch = data.chapters.find(c => c.id === ref.c) || data.chapters[0];
            if (!ch) return;
            const topicList = ch.topics || (ch.questions ? [{ topic: ch.name, questions: ch.questions }] : []);
            let foundQ = null;
            for (const t of topicList) {
                const match = (t.questions || []).find(q => ref.id && q.id === ref.id);
                if (match) {
                    foundQ = { ...match, topicName: ref.t || t.topic, _srcFile: ref.f, _srcChapterId: ch.id };
                    break;
                }
            }
            if (foundQ) rebuilt.push(foundQ);
        });

        if (rebuilt.length === 0) throw new Error('Source questions could not be found.');

        questions = rebuilt;
        userAnswers = entry.userAnswers || {};
        currentFileName = null;
        subjectData = null;
        currentChapter = { id: entry.id, name: entry.title || 'Custom Test' };
        window._activeCustomSessionMeta = { id: entry.id, title: entry.title, questionRefs: entry.questionRefs };

        const topicMap = new Map();
        rebuilt.forEach(q => {
            const tName = q.topicName || 'General';
            if (!topicMap.has(tName)) topicMap.set(tName, []);
            topicMap.get(tName).push(q);
        });
        topics = Array.from(topicMap.entries()).map(([topic, qs]) => ({ topic, questions: qs }));

        if (entry.kind === 'test' && entry.submitted) {
            currentMode = 'test';
            testSubmitted = true;
            testStartTime = entry.elapsedSec ? (Date.now() - entry.elapsedSec * 1000) : null;
            showResults();
            return;
        }

        currentMode = entry.mode === 'fullquiz' ? 'fullquiz' : (entry.kind === 'test' ? 'test' : 'onebyone');
        if (currentMode === 'test') {
            testSubmitted = false;
            testTimeLimit = entry.testTimeLimit || 1800;
            testStartTime = Date.now();
            showScreen('screenTestMode');
            renderTestMode();
            if (typeof renderQuestionGrid === 'function') renderQuestionGrid();
            startTestTimer();
            return;
        }

        let firstUnsolved = -1;
        for (let i = 0; i < questions.length; i++) {
            if (!userAnswers[i] || !userAnswers[i].revealed) { firstUnsolved = i; break; }
        }
        currentQIndex = firstUnsolved !== -1 ? firstUnsolved : questions.length - 1;

        if (currentMode === 'fullquiz') {
            showScreen('screenFullQuiz');
            renderFullQuiz();
        } else {
            showScreen('screenQuiz');
            renderQuestion();
        }
    } catch (e) {
        alert('Could not resume custom session: ' + e.message);
        showStudyHistory('custom');
    }
}

// ==================== RESUME ====================
async function resumeStudySession(id) {
    const entry = getStudyHistory().find(h => h.id === id);
    if (!entry) return;

    showScreen('screenLoading');

    try {
        let raw = loadedFiles[entry.file];
        if (!raw) {
            try {
                raw = await offlineStorage.getQuizData(entry.file);
            } catch (e) { /* fall through to network */ }
        }
        if (!raw) {
            const response = await fetch(`data/${entry.file}`);
            raw = await response.json();
        }
        const data = normalizeJsonData(raw, entry.file);
        loadedFiles[entry.file] = data;

        subjectData = data;
        currentFileName = entry.file;

        const chapter = (data.chapters || []).find(c => c.id === entry.chapterId);
        if (!chapter) throw new Error('That chapter is no longer in this file.');
        currentChapter = chapter;

        if (chapter.topics && chapter.topics.length > 0) {
            topics = chapter.topics;
        } else if (chapter.questions && chapter.questions.length > 0) {
            topics = [{ topic: chapter.name, questions: chapter.questions }];
        } else {
            throw new Error('That chapter has no questions.');
        }

        let chosen = entry.topicNames
            .map(name => topics.findIndex(t => t.topic === name))
            .filter(i => i >= 0);
        if (chosen.length === 0) chosen = (entry.topicIndexes || []).filter(i => topics[i]);
        if (chosen.length === 0) chosen = topics.map((_, i) => i);

        selectedTopics = chosen.sort((a, b) => a - b);
        questions = [];
        selectedTopics.forEach(i => {
            (topics[i].questions || []).forEach(q => {
                questions.push({ ...q, topicName: topics[i].topic });
            });
        });

        if (questions.length === 0) throw new Error('No questions left in that topic.');

        currentMode = entry.mode === 'fullquiz' ? 'fullquiz' : 'onebyone';
        userAnswers = entry.userAnswers || {};

        let firstUnsolved = -1;
        for (let i = 0; i < questions.length; i++) {
            if (!userAnswers[i] || !userAnswers[i].revealed) {
                firstUnsolved = i;
                break;
            }
        }
        if (firstUnsolved !== -1) {
            currentQIndex = firstUnsolved;
        } else {
            currentQIndex = questions.length - 1;
        }

        if (currentMode === 'fullquiz') {
            showScreen('screenFullQuiz');   // show first so render lands on a visible screen
            renderFullQuiz();
        } else {
            showScreen('screenQuiz');       // show first so render lands on a visible screen
            renderQuestion();
        }
    } catch (e) {
        alert('Could not resume this session: ' + e.message);
        showStudyHistory();
    }
}
