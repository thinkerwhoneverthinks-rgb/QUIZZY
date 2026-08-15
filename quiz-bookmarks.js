// ==================== BOOKMARK SYSTEM ====================
// Reserved subsection key for bookmarks saved directly to a section (no subsection chosen).
const DIRECT_BOOKMARK_KEY = '__direct__';

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

/* Entries are objects ({key, chapter, ...}); older data may hold bare strings,
   so accept both rather than comparing an object against a string. */
function bookmarkKeyOf(entry) {
    if (typeof entry === 'string') return entry;
    return entry && entry.key ? entry.key : null;
}

function isQuestionBookmarked(chapterId, qIndex) {
    const bookmarks = getBookmarks();
    const key = `${chapterId}_q${qIndex}`;
    for (const section in bookmarks) {
        for (const subsection in bookmarks[section]) {
            const list = bookmarks[section][subsection];
            if (Array.isArray(list) && list.some(b => bookmarkKeyOf(b) === key)) {
                return true;
            }
        }
    }
    return false;
}

/* Used by the bookmark-practice card's bookmark button (buildQuestionCardInner)
   to remove a question from the folder it's currently being practiced from,
   rather than reopening the folder-picker panel. */
function removeFromBookmarkFolder(idx) {
    const q = questions[idx];
    if (!q || !q.bookmarkSection || !q.bookmarkKey) return;
    if (!confirm('Remove this question from your bookmarks?')) return;

    const bookmarks = getBookmarks();
    const sub = q.bookmarkSubsection;
    const list = bookmarks[q.bookmarkSection] && bookmarks[q.bookmarkSection][sub];
    if (list) {
        bookmarks[q.bookmarkSection][sub] = list.filter(b => bookmarkKeyOf(b) !== q.bookmarkKey);
        if (bookmarks[q.bookmarkSection][sub].length === 0) delete bookmarks[q.bookmarkSection][sub];
        if (Object.keys(bookmarks[q.bookmarkSection]).length === 0) delete bookmarks[q.bookmarkSection];
        saveBookmarks(bookmarks);
    }

    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && activeScreen.id === 'screenQuiz') renderQuestion();
}

/* `questions` can be a shuffled/filtered array (Test Mode, Custom Test), so a raw
   index into it isn't a stable position. `topics` is only ever rebuilt from the
   source JSON and never shuffled, so match against it to find the question's real
   position within the chapter — that's what stays valid regardless of which mode
   the bookmark was saved from. Prefer matching by `id` (normalizeFlatQuestion gives
   every question a unique one): many datasets are image-only MCQs whose `question`
   text is blank for every entry, so text+topic matching alone would collapse every
   question in a topic onto the first one. Fall back to text+topic for older/raw
   data shapes that don't carry an id. */
function getCanonicalPosition(qIndexInQuestions) {
    const q = questions[qIndexInQuestions];
    if (!q || !Array.isArray(topics)) return qIndexInQuestions;
    let pos = 0;
    for (const t of topics) {
        const list = t.questions || [];
        for (let i = 0; i < list.length; i++) {
            const candidate = list[i];
            const isMatch = q.id
                ? candidate.id === q.id
                : (candidate.question === q.question && t.topic === q.topicName);
            if (isMatch) {
                return pos;
            }
            pos++;
        }
    }
    return qIndexInQuestions;
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
                    <div class="bookmark-subsection bookmark-subsection-direct ${selectedBookmarkSubsection === DIRECT_BOOKMARK_KEY ? 'selected' : ''}"
                         onclick="selectBookmarkSubsection('${DIRECT_BOOKMARK_KEY}')">
                        💾 Save directly to this section
                    </div>
                    ${Object.keys(bookmarks[section]).filter(sub => sub !== DIRECT_BOOKMARK_KEY).map(sub => `
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
        alert('Please select a section and a subsection (or "Save directly to this section")');
        return;
    }

    const bookmarks = getBookmarks();
    // Resolve to the question's stable position in the chapter, not its (possibly
    // shuffled) index in the live `questions` array — see getCanonicalPosition().
    const canonicalIndex = getCanonicalPosition(currentBookmarkQuestion);
    const key = `${currentChapter.id}_q${canonicalIndex}`;
    const q = questions[currentBookmarkQuestion];

    // Store a full snapshot of the question (not just its text) so a bookmark can be
    // re-rendered standalone, without depending on the source chapter being loaded.
    const bookmarkData = {
        key: key,
        file: currentFileName || '',
        chapter: currentChapter.name,
        chapterId: currentChapter.id,
        question: q.question || '',
        topic: q.topicName || '',
        type: q.type || 'fill_blank',
        index: canonicalIndex,
        originalNumber: canonicalIndex + 1,
        options: q.options,
        images: q.images,
        correct: q.correct,
        answer: q.answer,
        explanation: q.explanation,
        image_url: q.image_url,
        date: new Date().toISOString()
    };

    const subKey = selectedBookmarkSubsection === DIRECT_BOOKMARK_KEY ? DIRECT_BOOKMARK_KEY : selectedBookmarkSubsection;
    if (!bookmarks[selectedBookmarkSection][subKey]) {
        bookmarks[selectedBookmarkSection][subKey] = [];
    }
    const list = bookmarks[selectedBookmarkSection][subKey];
    if (!list.some(b => bookmarkKeyOf(b) === key)) {
        list.push(bookmarkData);
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
