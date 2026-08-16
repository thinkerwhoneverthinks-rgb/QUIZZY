/* ============================================================
   Quizzy — Study History
   Remembers what the user was solving (file → chapter → topics →
   question) so they can jump straight back to it later.
   Stored in localStorage; no question content is copied, only the
   coordinates needed to reopen it.
   ============================================================ */

const HISTORY_KEY = 'quizzy-history';
const HISTORY_LIMIT = 40;

function getStudyHistory() {
    try {
        const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
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

/* Called as the user moves through questions. Cheap enough to run on every
   render — it writes one small array. */
function recordStudySession(extra) {
    if (!currentChapter || !questions || questions.length === 0) return;
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

    const entry = {
        id,
        file: currentFileName || '',
        fileLabel: currentFileName
            ? currentFileName.replace('.json', '').replace(/_/g, ' ').replace(/,/g, ', ')
            : 'Custom Test',
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

function clearStudyHistory() {
    if (!confirm('Clear your entire study history? Bookmarks are not affected.')) return;
    saveStudyHistory([]);
    renderStudyHistory();
}

// ==================== SCREEN ====================
function showStudyHistory() {
    renderStudyHistory();
    showScreen('screenHistory');
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

function renderStudyHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;

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

        return `
            <div class="history-card" onclick="resumeStudySession('${h.id.replace(/'/g, "\\'")}')">
                <div class="history-card-top">
                    <span class="history-mode">${mode.icon} ${mode.name}</span>
                    <span class="history-time">${timeAgo(h.updatedAt)}</span>
                </div>
                <div class="history-chapter">${escapeHtml(h.chapterName)}</div>
                <div class="history-file">📚 ${escapeHtml(h.fileLabel)}</div>
                <div class="history-topics">
                    ${h.topicNames.length
                        ? h.topicNames.map(t => `<span class="history-topic-chip">${escapeHtml(t)}</span>`).join('')
                        : '<span class="history-topic-chip">All topics</span>'}
                </div>
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
            renderFullQuiz();
            showScreen('screenFullQuiz');
        } else {
            renderQuestion();
            showScreen('screenQuiz');
        }
    } catch (e) {
        alert('Could not resume this session: ' + e.message);
        showStudyHistory();
    }
}
