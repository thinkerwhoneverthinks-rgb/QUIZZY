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

function showModeSelect() {
    if (!currentChapter) { showChapters(); return; }
    document.getElementById('modeSelectTitle').textContent = currentChapter.name;
    showScreen('screenModeSelect');
}

function showQuiz() {
    if (!currentChapter) { showChapters(); return; }
    currentQIndex = 0;
    userAnswers = {};
    renderQuestion();
    showScreen('screenQuiz');
}

function showFullQuiz() {
    if (!currentChapter) { showChapters(); return; }
    userAnswers = {};
    renderFullQuiz();
    showScreen('screenFullQuiz');
}

function showTestConfig() {
    selectedTopics = [];
    topicQuestionCounts = {};
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
function showTopicSelect() {
    selectedTopics = []; // reset on fresh entry
    renderTopicSelect();
    showScreen('screenTopicSelect');
}

function renderTopicSelect() {
    const container = document.getElementById('topicSelectListPractice');
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
    userAnswers = {};
    currentQIndex = 0;
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

function loadNextTopicOrChapter() {
    const nextInfo = getNextTopicInfo();
    if (!nextInfo) {
        showResults();
        return;
    }

    if (nextInfo.type === 'topic') {
        const nextTopicIndex = nextInfo.index;
        const nextTopic = topics[nextTopicIndex];
        if (nextTopic && nextTopic.questions) {
            const newQuestions = nextTopic.questions.map(q => ({ ...q, topicName: nextTopic.topic }));
            questions = newQuestions;
            userAnswers = {};
            currentQIndex = 0;
            if (currentMode === 'fullquiz') {
                renderFullQuiz();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                renderQuestion();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } else {
            showResults();
        }
    } else if (nextInfo.type === 'chapter') {
        selectChapter(nextInfo.id);
    }
}

// ==================== THEME ====================
function updateToggleIcon(theme) {
    const icon = document.getElementById('themeIcon');
    const text = document.getElementById('themeText');
    if (icon && text) {
        icon.textContent = theme === 'dark' ? '🌙' : '☀️';
        text.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('studycafe-theme', newTheme);
    updateToggleIcon(newTheme);
}

function toggleMenu() {
    document.getElementById('menuToggle').classList.toggle('active');
    document.getElementById('mobileMenu').classList.toggle('active');
    document.getElementById('overlay').classList.toggle('active');
}

const savedTheme = localStorage.getItem('studycafe-theme');
if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
} else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
}
updateToggleIcon(document.documentElement.getAttribute('data-theme'));

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('studycafe-theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        updateToggleIcon(document.documentElement.getAttribute('data-theme'));
    }
});

// ==================== INIT ====================
