// ==================== NAVIGATION & HISTORY ROUTING ====================
let isQuizHistoryNavigating = false;

function pushQuizHistory(state, replace) {
    if (isQuizHistoryNavigating) return;
    try {
        if (replace) {
            history.replaceState(state, '');
        } else {
            if (history.state && history.state.screen === state.screen && history.state.dirLength === state.dirLength) {
                return;
            }
            history.pushState(state, '');
        }
    } catch (e) { /* ignore */ }
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    window.scrollTo(0, 0);
    // Typeset math on target screen synchronously without delay
    if (target) {
        if (typeof typesetMath === 'function') {
            typesetMath(target);
        } else if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(target, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\[', right: '\\]', display: true},
                    {left: '\\(', right: '\\)', display: false}
                ],
                throwOnError: false
            });
        }
    }
}

function showSubjects() {
    currentSubject = null;
    currentChapter = null;
    currentMode = null;
    closeGrid();
    stopTestTimer();
    showScreen('screenSubjects');
    pushQuizHistory({ cafe: 'question', screen: 'screenSubjects', dirLength: (typeof currentDirectory !== 'undefined' && currentDirectory) ? currentDirectory.length : 0 });
}

function showChapters() {
    closeGrid();
    if (subjectData && subjectData.chapters && subjectData.chapters.length > 1) {
        renderChapters();
        showScreen('screenChapters');
        pushQuizHistory({ cafe: 'question', screen: 'screenChapters' });
    } else {
        showSubjects();
    }
}

function showQuiz(startIndex) {
    if (!currentChapter) { showChapters(); return; }
    currentMode = 'onebyone';
    if (typeof startIndex === 'number') {
        currentQIndex = startIndex;
    } else if (typeof currentQIndex !== 'number') {
        currentQIndex = 0;
    }
    if (!userAnswers) userAnswers = {};
    showScreen('screenQuiz');   // show first so render lands on a visible screen
    if (typeof updateHeaderLangPills === 'function') updateHeaderLangPills();
    renderQuestion();
    if (typeof renderQuestionGrid === 'function') renderQuestionGrid();
    pushQuizHistory({ cafe: 'question', screen: 'screenQuiz' });
}

function showFullQuiz() {
    if (!currentChapter) { showChapters(); return; }
    currentMode = 'fullquiz';
    if (!userAnswers) userAnswers = {};
    showScreen('screenFullQuiz');   // show first so render lands on a visible screen
    if (typeof updateHeaderLangPills === 'function') updateHeaderLangPills();
    renderFullQuiz();
    if (typeof renderQuestionGrid === 'function') renderQuestionGrid();
    pushQuizHistory({ cafe: 'question', screen: 'screenFullQuiz' });
}

function switchQuizViewMode(mode) {
    if (mode === currentMode) return;
    currentMode = mode;
    if (currentMode === 'onebyone') {
        showScreen('screenQuiz');
        if (typeof updateHeaderLangPills === 'function') updateHeaderLangPills();
        renderQuestion();
        pushQuizHistory({ cafe: 'question', screen: 'screenQuiz' }, true);
    } else if (currentMode === 'fullquiz') {
        showScreen('screenFullQuiz');
        if (typeof updateHeaderLangPills === 'function') updateHeaderLangPills();
        renderFullQuiz();
        pushQuizHistory({ cafe: 'question', screen: 'screenFullQuiz' }, true);
        const card = document.getElementById(`fullQ-${currentQIndex}`);
        if (card) {
            setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        }
    }
    if (typeof renderQuestionGrid === 'function') renderQuestionGrid();
    if (typeof isGridOpen !== 'undefined' && isGridOpen && typeof closeGrid === 'function') {
        closeGrid();
    }
}

function showTestConfig() {
    selectedTopics = [];
    topicQuestionCounts = {};
    restoreAllQuestions();
    renderTestConfig();
    showScreen('screenTestConfig');
    pushQuizHistory({ cafe: 'question', screen: 'screenTestConfig' });
}

// ==================== MODE SELECTION ====================
function selectMode(mode) {
    currentMode = mode;
    if (currentMode === 'test') {
        showTestConfig();
    } else {
        showTopicSelect();
    }
}

function renderModeLangPicker() {
    const container = document.getElementById('modeLangPickerContainer');
    if (!container) return;
    const hasHi = questions && questions.some(q => q.translations && q.translations.hi);
    if (!hasHi) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
        <div style="display:inline-flex;align-items:center;gap:0.6rem;background:var(--bg-card);border:1px solid var(--border);border-radius:50px;padding:0.3rem 0.8rem;box-shadow:var(--shadow-sm);">
            <span style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">🌐 Language:</span>
            <div class="lang-pill-group">
                <button class="lang-pill ${currentLanguage === 'en' ? 'active' : ''}" onclick="setQuizLanguage('en'); renderModeLangPicker();">🇬🇧 English</button>
                <button class="lang-pill ${currentLanguage === 'hi' ? 'active' : ''}" onclick="setQuizLanguage('hi'); renderModeLangPicker();">🇮🇳 हिन्दी</button>
            </div>
        </div>
    `;
}

function showModeSelect() {
    if (!currentChapter) { showChapters(); return; }
    stopTestTimer();
    document.getElementById('modeSelectTitle').textContent = currentChapter.name;
    renderModeLangPicker();
    showScreen('screenModeSelect');
    pushQuizHistory({ cafe: 'question', screen: 'screenModeSelect' });
}

// ==================== TOPIC SELECTION (One-by-One & Full Quiz) ====================
/* startPractice() narrows `questions` to the chosen topics, so rebuild the
   full set on re-entry — otherwise the counts and "Select All" would only
   reflect whatever subset was practised last. */
function restoreAllQuestions() {
    if (topics && topics.length > 0) {
        questions = topics.flatMap(t => (t.questions || []).map(q => ({ ...q, topicName: t.topic })));
    }
}

function showTopicSelect() {
    selectedTopics = []; // reset on fresh entry
    restoreAllQuestions();
    renderTopicSelect();
    showScreen('screenTopicSelect');
    pushQuizHistory({ cafe: 'question', screen: 'screenTopicSelect' });
}

let practiceOrder = 'topic'; // 'topic' or 'serial'

function isExerciseTopicRearranged() {
    if (typeof topics !== 'undefined' && topics && topics.length > 1) {
        return true;
    }
    if (!questions || questions.length <= 1) return false;
    for (let i = 1; i < questions.length; i++) {
        const prev = questions[i - 1].originalNumber;
        const curr = questions[i].originalNumber;
        if (typeof prev === 'number' && typeof curr === 'number' && curr < prev) {
            return true;
        }
    }
    return false;
}

function setPracticeOrder(order) {
    practiceOrder = order;
    if (typeof currentPracticeOrder !== 'undefined') currentPracticeOrder = order;
    renderTopicSelect();
}

function renderTopicSelect() {
    const container = document.getElementById('topicSelectListPractice');

    // Header shows the chapter (e.g. "Conceptual Questions") + chosen mode.
    const titleEl = document.getElementById('topicSelectTitle');
    const subtitleEl = document.getElementById('topicSelectSubtitle');
    const isRearranged = isExerciseTopicRearranged();
    if (titleEl) titleEl.textContent = currentChapter ? currentChapter.name : 'Select Topic';
    if (subtitleEl) {
        subtitleEl.textContent = (currentMode === 'fullquiz' ? 'Full Quiz' : 'One by One') +
            ' · ' + (isRearranged ? (practiceOrder === 'serial' ? 'Original serial order' : 'Topic-wise') : 'Serial order');
    }

    if (!topics || topics.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No topics available. All questions will be used.</p>';
        return;
    }

    const totalSelected = selectedTopics.reduce((sum, idx) => sum + (topics[idx].questions ? topics[idx].questions.length : 0), 0);
    const allSelected = selectedTopics.length === topics.length;

    const orderToggleHtml = isRearranged ? `
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.45rem 0.85rem;margin-bottom:0.75rem;">
            <span style="font-size:0.8rem;font-weight:600;color:var(--text-primary);">Question Order:</span>
            <div class="lang-pill-group">
                <button class="lang-pill ${practiceOrder === 'topic' ? 'active' : ''}" onclick="setPracticeOrder('topic')">🗂️ Topic-wise</button>
                <button class="lang-pill ${practiceOrder === 'serial' ? 'active' : ''}" onclick="setPracticeOrder('serial')">🔢 Original Serial</button>
            </div>
        </div>
    ` : '';

    container.innerHTML = `
        ${orderToggleHtml}
        <div class="topic-select-item select-all-row ${allSelected ? 'selected' : ''}" onclick="togglePracticeTopic('all')">
            <input type="checkbox" ${allSelected ? 'checked' : ''} onclick="event.stopPropagation(); togglePracticeTopic('all')">
            <div style="flex:1;">
                <label style="font-weight:700;color:var(--accent);cursor:pointer;">✓ Select All Topics</label>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">All ${questions.length} questions ${isRearranged ? (practiceOrder === 'serial' ? '(Original serial order 1..' + questions.length + ')' : '(Grouped topic-wise)') : 'in serial order'}</div>
            </div>
            <button class="download-file-btn" id="dlBtnAllTopics" onclick="event.stopPropagation(); downloadAllTopicsForOffline(this)" title="Download all topics for offline">⬇️</button>
            <span class="topic-meta-count">${questions.length} Qs</span>
        </div>
        <div style="border-top:1px solid var(--border);margin:0.5rem 0;"></div>
        ${topics.map((topic, i) => {
            const qCount = topic.questions ? topic.questions.length : 0;
            const isSelected = selectedTopics.includes(i);
            return `
                <div class="topic-select-item ${isSelected ? 'selected' : ''}" onclick="togglePracticeTopic(${i})">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); togglePracticeTopic(${i})">
                    <div style="flex:1;">
                        <label style="cursor:pointer;">${escapeHtml(topic.topic)}</label>
                        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">${qCount} questions</div>
                    </div>
                    <button class="download-file-btn" onclick="event.stopPropagation(); downloadSingleTopic(${i}, this)" title="Download topic offline">⬇️</button>
                    <span class="topic-meta-count">${qCount} Qs</span>
                </div>
            `;
        }).join('')}
    `;

    // Update the static action bar
    const actionBar = document.getElementById('topicSelectActions');
    if (actionBar) {
        actionBar.innerHTML = `
            <button class="btn btn-ghost" onclick="showModeSelect()">Cancel</button>
            <button class="btn btn-primary" onclick="startPractice()" ${totalSelected === 0 ? 'disabled' : ''}>
                Start Practice → (${totalSelected} Qs)
            </button>
        `;
    }
}

function togglePracticeTopic(index) {
    if (index === 'all') {
        if (selectedTopics.length === topics.length) {
            selectedTopics = [];
        } else {
            selectedTopics = topics.map((_, i) => i);
        }
    } else {
        if (selectedTopics.includes(index)) {
            selectedTopics = selectedTopics.filter(i => i !== index);
        } else {
            selectedTopics.push(index);
        }
    }
    renderTopicSelect();
}

function startPractice() {
    // Build questions from selected topics
    let filteredQuestions = [];
    if (selectedTopics.length > 0 && topics.length > 0) {
        selectedTopics.sort((a, b) => a - b);
        selectedTopics.forEach(idx => {
            if (topics[idx] && topics[idx].questions) {
                topics[idx].questions.forEach(q => {
                    filteredQuestions.push({...q, topicName: topics[idx].topic});
                });
            }
        });
    } else {
        // fallback: use all questions
        filteredQuestions = [...questions];
    }

    if (practiceOrder === 'serial' && filteredQuestions.some(q => typeof q.originalNumber === 'number')) {
        filteredQuestions.sort((a, b) => (a.originalNumber || 0) - (b.originalNumber || 0));
    }

    questions = filteredQuestions;
    if (typeof currentPracticeOrder !== 'undefined') currentPracticeOrder = practiceOrder;
    if (typeof restoreSavedTopicProgress === 'function') {
        restoreSavedTopicProgress();
    } else {
        userAnswers = {};
        currentQIndex = 0;
    }
    if (currentMode === 'onebyone') {
        showQuiz();
    } else if (currentMode === 'fullquiz') {
        showFullQuiz();
    }
}

function downloadSingleTopic(topicIdx, btnElement) {
    const fileId = currentFileName || 'quiz';
    const chapterId = currentChapter ? currentChapter.id : 'ch1';
    downloadTopicUI(fileId, chapterId, topicIdx, btnElement);
}

async function downloadAllTopicsForOffline(btnElement) {
    if (!currentChapter && !currentFileName) return;
    const fileId = currentFileName || 'quiz';
    const chapterId = currentChapter ? currentChapter.id : 'ch1';
    const allQs = questions && questions.length > 0 ? questions : (topics ? topics.flatMap(t => t.questions || []) : []);
    if (!allQs.length) return;

    const originalText = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = '⏳';

    try {
        await offlineStorage.downloadTopicForOffline(fileId, chapterId, 'all', allQs, (done, total) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 100;
            btnElement.innerHTML = `⏳ ${pct}%`;
        });
        btnElement.innerHTML = '✅';
        btnElement.classList.add('downloaded');
        btnElement.title = 'All topics available offline';
        btnElement.disabled = false;
    } catch (e) {
        console.error('Download all failed:', e);
        btnElement.innerHTML = '❌';
        setTimeout(() => { btnElement.innerHTML = originalText; btnElement.disabled = false; }, 2000);
    }
}

// ==================== TOPIC & CHAPTER CONTINUATION ====================
function getNextTopicInfo() {
    if (!topics || topics.length === 0) return null;

    const lastQ = questions[questions.length - 1];
    const currentTopicName = lastQ ? lastQ.topicName : null;
    let currentTopicIndex = -1;

    if (currentTopicName) {
        currentTopicIndex = topics.findIndex(t => t.topic === currentTopicName);
    }

    if (currentTopicIndex >= 0 && currentTopicIndex < topics.length - 1) {
        const nextT = topics[currentTopicIndex + 1];
        return {
            type: 'topic',
            index: currentTopicIndex + 1,
            name: nextT.topic,
            count: nextT.questions ? nextT.questions.length : 0
        };
    }

    // Check if next chapter exists
    if (subjectData && subjectData.chapters && currentChapter) {
        const chIdx = subjectData.chapters.findIndex(c => c.id === currentChapter.id);
        if (chIdx >= 0 && chIdx < subjectData.chapters.length - 1) {
            const nextCh = subjectData.chapters[chIdx + 1];
            return {
                type: 'chapter',
                id: nextCh.id,
                name: nextCh.name
            };
        }
    }

    return null;
}

/* Keeps the user in the mode they chose (one-by-one or full quiz) and just
   swaps in the next topic — or the first topic of the next chapter. */
function loadNextTopicOrChapter() {
    const nextInfo = getNextTopicInfo();
    if (!nextInfo) {
        showResults();
        return;
    }

    let nextTopic = null;

    if (nextInfo.type === 'topic') {
        nextTopic = topics[nextInfo.index];
        selectedTopics = [nextInfo.index];
    } else if (nextInfo.type === 'chapter') {
        const nextCh = (subjectData && subjectData.chapters || []).find(c => c.id === nextInfo.id);
        if (!nextCh) { showResults(); return; }

        currentChapter = nextCh;
        if (nextCh.topics && nextCh.topics.length > 0) {
            topics = nextCh.topics;
        } else if (nextCh.questions && nextCh.questions.length > 0) {
            topics = [{ topic: nextCh.name, questions: nextCh.questions }];
        } else {
            showResults();
            return;
        }
        topicQuestionCounts = {};
        selectedTopics = [0];
        nextTopic = topics[0];
    }

    if (!nextTopic || !nextTopic.questions || nextTopic.questions.length === 0) {
        showResults();
        return;
    }

    questions = nextTopic.questions.map(q => ({ ...q, topicName: nextTopic.topic }));
    userAnswers = {};
    currentQIndex = 0;

    if (currentMode === 'fullquiz') {
        showScreen('screenFullQuiz');   // show first so render lands on a visible screen
        renderFullQuiz();
    } else {
        showScreen('screenQuiz');       // show first so render lands on a visible screen
        renderQuestion();
    }
}

// ==================== INIT & POPSTATE ROUTING ====================
/* Theme + hamburger menu live in app-shell.js, which every page loads in
   <head> so the saved theme is applied before the first paint. */

window.addEventListener('popstate', function (e) {
    // 1. If an overlay/modal/drawer is open, close it and stay on current screen
    if (typeof closeCurrentOverlay === 'function' && closeCurrentOverlay()) {
        const activeScreen = document.querySelector('.screen.active');
        const activeId = activeScreen ? activeScreen.id : 'screenSubjects';
        pushQuizHistory({ cafe: 'question', screen: activeId, dirLength: (typeof currentDirectory !== 'undefined' && currentDirectory) ? currentDirectory.length : 0 });
        return;
    }

    // 2. Guard active Timed Test
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && (activeScreen.id === 'screenTest' || activeScreen.id === 'screenTestMode')) {
        const leave = confirm('Are you sure you want to end the test? Your progress will be submitted.');
        if (leave) {
            if (typeof submitTest === 'function') submitTest();
        } else {
            pushQuizHistory({ cafe: 'question', screen: activeScreen.id });
            return;
        }
        return;
    }

    // 3. State navigation
    if (e.state && e.state.cafe === 'question') {
        isQuizHistoryNavigating = true;
        try {
            switch (e.state.screen) {
                case 'screenSubjects':
                    if (typeof closeGrid === 'function') closeGrid();
                    if (typeof stopTestTimer === 'function') stopTestTimer();
                    const targetLen = typeof e.state.dirLength === 'number' ? e.state.dirLength : 0;
                    if (typeof currentDirectory !== 'undefined' && currentDirectory.length !== targetLen) {
                        currentDirectory = currentDirectory.slice(0, targetLen);
                        if (currentDirectory.length === 0) {
                            if (typeof manifestRoot !== 'undefined' && typeof renderTree === 'function') renderTree(manifestRoot);
                        } else {
                            if (typeof renderTree === 'function') renderTree(currentDirectory[currentDirectory.length - 1]);
                        }
                    }
                    showScreen('screenSubjects');
                    break;
                case 'screenChapters':
                    showChapters();
                    break;
                case 'screenModeSelect':
                    showModeSelect();
                    break;
                case 'screenTopicSelect':
                    showTopicSelect();
                    break;
                case 'screenTestConfig':
                    showTestConfig();
                    break;
                case 'screenQuiz':
                    showQuiz(typeof currentQIndex === 'number' ? currentQIndex : 0);
                    break;
                case 'screenFullQuiz':
                    showFullQuiz();
                    break;
                case 'screenResults':
                    if (typeof showResults === 'function') showResults();
                    break;
                case 'screenReview':
                    if (typeof reviewTest === 'function') reviewTest();
                    break;
                case 'screenHistory':
                    if (typeof showStudyHistory === 'function') showStudyHistory();
                    break;
                case 'screenCustomTest':
                    if (typeof showCustomTestBuilder === 'function') showCustomTestBuilder();
                    break;
                default:
                    showSubjects();
                    break;
            }
        } finally {
            isQuizHistoryNavigating = false;
        }
        return;
    }

    // 4. If e.state is null or popped past root:
    if (typeof currentDirectory !== 'undefined' && currentDirectory && currentDirectory.length > 0) {
        currentDirectory.pop();
        if (currentDirectory.length === 0) {
            if (typeof manifestRoot !== 'undefined' && typeof renderTree === 'function') renderTree(manifestRoot);
        } else {
            if (typeof renderTree === 'function') renderTree(currentDirectory[currentDirectory.length - 1]);
        }
        showScreen('screenSubjects');
        pushQuizHistory({ cafe: 'question', screen: 'screenSubjects', dirLength: currentDirectory.length });
        return;
    }
});
