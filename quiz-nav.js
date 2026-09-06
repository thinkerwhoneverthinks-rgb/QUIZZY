// ==================== NAVIGATION ====================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
    // Re-render math after screen change
    setTimeout(() => {
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(document.body, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\[', right: '\\]', display: true},
                    {left: '\\(', right: '\\)', display: false}
                ],
                throwOnError: false
            });
        }
    }, 100);
}

function showSubjects() {
    currentSubject = null;
    currentChapter = null;
    currentMode = null;
    closeGrid();
    stopTestTimer();
    showScreen('screenSubjects');
}

function showChapters() {
    if (!currentSubject) { showSubjects(); return; }
    closeGrid();
    renderChapters();
    showScreen('screenChapters');
}

function showQuiz(startIndex = 0) {
    if (!currentChapter) { showChapters(); return; }
    currentQIndex = startIndex;
    userAnswers = {};
    showScreen('screenQuiz');   // show first so render lands on a visible screen
    renderQuestion();
}

function showFullQuiz() {
    if (!currentChapter) { showChapters(); return; }
    userAnswers = {};
    showScreen('screenFullQuiz');   // show first so render lands on a visible screen
    renderFullQuiz();
}

function showTestConfig() {
    selectedTopics = [];
    topicQuestionCounts = {};
    restoreAllQuestions();
    renderTestConfig();
    showScreen('screenTestConfig');
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

function showModeSelect() {
    if (!currentChapter) { showChapters(); return; }
    stopTestTimer();
    document.getElementById('modeSelectTitle').textContent = currentChapter.name;
    showScreen('screenModeSelect');
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
}

function renderTopicSelect() {
    const container = document.getElementById('topicSelectListPractice');

    // Header shows the chapter (e.g. "Conceptual Questions") + chosen mode.
    const titleEl = document.getElementById('topicSelectTitle');
    const subtitleEl = document.getElementById('topicSelectSubtitle');
    if (titleEl) titleEl.textContent = currentChapter ? currentChapter.name : 'Select Topic';
    if (subtitleEl) {
        subtitleEl.textContent = currentMode === 'fullquiz'
            ? 'Full Quiz · serial order'
            : 'One by One · serial order';
    }

    if (!topics || topics.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No topics available. All questions will be used.</p>';
        return;
    }

    const totalSelected = selectedTopics.reduce((sum, idx) => sum + (topics[idx].questions ? topics[idx].questions.length : 0), 0);
    const allSelected = selectedTopics.length === topics.length;

    container.innerHTML = `
        <div class="topic-select-item select-all-row ${allSelected ? 'selected' : ''}" onclick="togglePracticeTopic('all')">
            <input type="checkbox" ${allSelected ? 'checked' : ''} onclick="event.stopPropagation(); togglePracticeTopic('all')">
            <div style="flex:1;">
                <label style="font-weight:700;color:var(--accent);cursor:pointer;">✓ Select All Topics</label>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">All ${questions.length} questions in serial order</div>
            </div>
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
    // Build questions from selected topics in serial order
    let filteredQuestions = [];
    if (selectedTopics.length > 0 && topics.length > 0) {
        selectedTopics.sort((a, b) => a - b); // keep serial order
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

    questions = filteredQuestions;
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

// ==================== INIT ====================
/* Theme + hamburger menu live in app-shell.js, which every page loads in
   <head> so the saved theme is applied before the first paint. */
