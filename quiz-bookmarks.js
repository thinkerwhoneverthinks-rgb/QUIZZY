// ==================== BOOKMARK SYSTEM ====================
function getBookmarks() {
    try {
        return JSON.parse(localStorage.getItem('studycafe-bookmarks') || '{}');
    } catch (e) {
        return {};
    }
}

function saveBookmarks(bookmarks) {
    localStorage.setItem('studycafe-bookmarks', JSON.stringify(bookmarks));
}

function isQuestionBookmarked(chapterId, qIndex) {
    const bookmarks = getBookmarks();
    const key = `${chapterId}_q${qIndex}`;
    for (const section in bookmarks) {
        for (const subsection in bookmarks[section]) {
            if (bookmarks[section][subsection].includes(key)) {
                return true;
            }
        }
    }
    return false;
}

function toggleBookmark(qIndex) {
    currentBookmarkQuestion = qIndex;
    openBookmarkPanel();
}

let currentBookmarkQuestion = null;
let selectedBookmarkSection = null;
let selectedBookmarkSubsection = null;

function openBookmarkPanel() {
    const panel = document.getElementById('bookmarkPanel');
    const overlay = document.getElementById('bookmarkOverlay');
    renderBookmarkPanel();
    panel.classList.add('active');
    overlay.classList.add('active');
}

function closeBookmarkPanel() {
    document.getElementById('bookmarkPanel').classList.remove('active');
    document.getElementById('bookmarkOverlay').classList.remove('active');
    selectedBookmarkSection = null;
    selectedBookmarkSubsection = null;
}

function renderBookmarkPanel() {
    const body = document.getElementById('bookmarkPanelBody');
    const bookmarks = getBookmarks();

    if (Object.keys(bookmarks).length === 0) {
        body.innerHTML = `
            <div class="bookmark-empty">
                <p>No bookmark folders yet.</p>
                <p style="margin-top:0.5rem;font-size:0.8rem;">Create a section below to get started.</p>
            </div>
            <input type="text" class="bookmark-input" id="newSectionInput" placeholder="New section name...">
            <button class="btn btn-primary" style="width:100%;" onclick="createBookmarkSection()">Create Section</button>
        `;
        return;
    }

    let html = '<div style="margin-bottom:1rem;">';

    for (const section in bookmarks) {
        const isExpanded = selectedBookmarkSection === section;
        html += `
            <div class="bookmark-section">
                <div class="bookmark-section-title ${isExpanded ? 'expanded' : ''}" onclick="selectBookmarkSection('${section}')">
                    <span>📁 ${escapeHtml(section)}</span>
                    <span class="arrow">▶</span>
                </div>
                <div class="bookmark-subsections ${isExpanded ? 'show' : ''}">
                    ${Object.keys(bookmarks[section]).map(sub => `
                        <div class="bookmark-subsection ${selectedBookmarkSubsection === sub ? 'selected' : ''}" 
                             onclick="selectBookmarkSubsection('${sub}')">
                            📂 ${escapeHtml(sub)}
                        </div>
                    `).join('')}
                    ${isExpanded ? `
                        <div style="padding:0.5rem;">
                            <input type="text" class="bookmark-input" id="newSubsectionInput" placeholder="New subsection name...">
                            <button class="btn btn-ghost" style="width:100%;margin-top:0.5rem;" onclick="createBookmarkSubsection('${section}')">+ Add Subsection</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    html += '</div>';
    html += `
        <div style="border-top:1px solid var(--border);padding-top:1rem;">
            <input type="text" class="bookmark-input" id="newSectionInput" placeholder="New section name...">
            <button class="btn btn-primary" style="width:100%;" onclick="createBookmarkSection()">Create New Section</button>
        </div>
    `;

    body.innerHTML = html;
}

function selectBookmarkSection(section) {
    if (selectedBookmarkSection === section) {
        selectedBookmarkSection = null;
    } else {
        selectedBookmarkSection = section;
    }
    selectedBookmarkSubsection = null;
    renderBookmarkPanel();
}

function selectBookmarkSubsection(subsection) {
    selectedBookmarkSubsection = subsection;
    renderBookmarkPanel();
}

function createBookmarkSection() {
    const input = document.getElementById('newSectionInput');
    const name = input.value.trim();
    if (!name) return;

    const bookmarks = getBookmarks();
    if (!bookmarks[name]) {
        bookmarks[name] = {};
        saveBookmarks(bookmarks);
    }
    input.value = '';
    renderBookmarkPanel();
}

function createBookmarkSubsection(section) {
    const input = document.getElementById('newSubsectionInput');
    const name = input.value.trim();
    if (!name || !section) return;

    const bookmarks = getBookmarks();
    if (!bookmarks[section][name]) {
        bookmarks[section][name] = [];
        saveBookmarks(bookmarks);
    }
    renderBookmarkPanel();
}

function saveBookmark() {
    if (!selectedBookmarkSection || !selectedBookmarkSubsection || currentBookmarkQuestion === null) {
        alert('Please select a section and subsection');
        return;
    }

    const bookmarks = getBookmarks();
    const key = `${currentChapter.id}_q${currentBookmarkQuestion}`;
    const q = questions[currentBookmarkQuestion];

    // Store question data with bookmark
    const bookmarkData = {
        key: key,
        chapter: currentChapter.name,
        chapterId: currentChapter.id,
        subject: currentSubject.id,
        question: q.question,
        topic: q.topicName || '',
        type: q.type || 'fill_blank',
        index: currentBookmarkQuestion,
        date: new Date().toISOString()
    };

    if (!bookmarks[selectedBookmarkSection][selectedBookmarkSubsection].find(b => b.key === key)) {
        bookmarks[selectedBookmarkSection][selectedBookmarkSubsection].push(bookmarkData);
        saveBookmarks(bookmarks);
    }

    closeBookmarkPanel();

    // Re-render current question to show bookmark state
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
        if (activeScreen.id === 'screenQuiz') renderQuestion();
        else if (activeScreen.id === 'screenFullQuiz') renderFullQuiz();
    }
}

function toggleReview(idx) {
    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].reviewed = !userAnswers[idx].reviewed;

    // Update the review button appearance
    const btn = document.querySelector(`#testQ-${idx} .review-btn`);
    if (btn) {
        const isReviewed = userAnswers[idx].reviewed;
        btn.classList.toggle('active', isReviewed);
        btn.innerHTML = `🚩 ${isReviewed ? 'Reviewed' : 'Review'}`;
    }
}
