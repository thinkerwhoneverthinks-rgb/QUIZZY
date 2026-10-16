/* ============================================================
   QUIZZY — NOTES CAFE JAVASCRIPT
   Handles manifest loading, Provider Hub (Allen vs Physics Wallah),
   2-column Allen interactive reader, and PW HTML digital book reader.
   ============================================================ */

let notesManifest = null;
let currentView = 'home'; // 'home' | 'allen' | 'pw' | 'pw-book' | 'reader-allen' | 'reader-pw'

// Allen State
let currentAllenSubject = 'all';
let currentChapterData = null;
let currentModuleIndex = 0;

// PW State
let currentPwFilter = 'all';
let currentPwBook = null;
let currentPwChapterIndex = 0;
let currentPwChapter = null;

let isNotesHistoryNavigating = false;

// Escape HTML utility
function escapeNotesHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Safe HTML for notes
function safeNotesHtml(text) {
    if (!text) return '';
    let s = String(text);
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\n\n+/g, '<br><br>');
    s = s.replace(/\n/g, '<br>');
    return s;
}

// Typeset Math in container
function typesetNotesMath(el) {
    if (!el) return;
    const render = () => {
        if (typeof renderMathInElement !== 'undefined') {
            try {
                renderMathInElement(el, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\[', right: '\\]', display: true },
                        { left: '\\(', right: '\\)', display: false }
                    ],
                    throwOnError: false
                });
            } catch (e) { /* ignore */ }
        }
    };

    if (typeof renderMathInElement !== 'undefined') {
        render();
    } else {
        const interval = setInterval(() => {
            if (typeof renderMathInElement !== 'undefined') {
                clearInterval(interval);
                render();
            }
        }, 25);
        setTimeout(() => clearInterval(interval), 4000);
    }
}

// ============================================================
// MANIFEST LOADING
// ============================================================
async function loadNotesManifest() {
    try {
        const res = await fetch('data/notes-manifest.json');
        notesManifest = await res.json();
        
        // Initial state
        goNotesHome(false);

        try {
            history.replaceState({ cafe: 'notes', view: 'home' }, '');
        } catch (e) { /* ignore */ }
    } catch (e) {
        console.error('Failed to load notes manifest:', e);
        const homeScreen = document.getElementById('notesHomeScreen');
        if (homeScreen) {
            homeScreen.innerHTML += `
                <div style="text-align:center; padding: 2rem; color: var(--error);">
                    ⚠️ Could not load notes manifest. Check that data/notes-manifest.json exists.
                </div>
            `;
        }
    }
}

// ============================================================
// SCREEN SWITCHING & NAVIGATION
// ============================================================
function hideAllScreens() {
    const screens = [
        document.getElementById('notesHomeScreen'),
        document.getElementById('allenScreen'),
        document.getElementById('pwScreen'),
        document.getElementById('pwBookScreen')
    ];
    screens.forEach(s => { if (s) s.style.display = 'none'; });

    const readers = [
        document.getElementById('notesReaderScreen'),
        document.getElementById('pwReaderScreen')
    ];
    readers.forEach(r => { if (r) r.classList.remove('active'); });
}

function goNotesHome(pushHistory = true) {
    currentView = 'home';
    hideAllScreens();
    const home = document.getElementById('notesHomeScreen');
    if (home) home.style.display = 'block';
    window.scrollTo(0, 0);

    if (pushHistory && !isNotesHistoryNavigating) {
        try { history.pushState({ cafe: 'notes', view: 'home' }, ''); } catch (e) { }
    }
}

// ============================================================
// 1. ALLEN REVISION NOTES HUB
// ============================================================
function openAllenHub(pushHistory = true) {
    currentView = 'allen';
    hideAllScreens();
    const allenScreen = document.getElementById('allenScreen');
    if (allenScreen) allenScreen.style.display = 'block';
    window.scrollTo(0, 0);

    renderAllenSubjects();
    renderAllenChapters();

    if (pushHistory && !isNotesHistoryNavigating) {
        try { history.pushState({ cafe: 'notes', view: 'allen' }, ''); } catch (e) { }
    }
}

function getAllenProvider() {
    if (!notesManifest) return null;
    if (notesManifest.providers) {
        const p = notesManifest.providers.find(x => x.id === 'allen');
        if (p) return p;
    }
    return { subjects: notesManifest.subjects || [] };
}

function renderAllenSubjects() {
    const tabsContainer = document.getElementById('allenSubjectTabs');
    const allen = getAllenProvider();
    if (!tabsContainer || !allen || !allen.subjects) return;

    let html = `
        <button class="notes-tab-btn ${currentAllenSubject === 'all' ? 'active' : ''}" onclick="selectAllenSubject('all')">
            📚 All Subjects
        </button>
    `;

    allen.subjects.forEach(subj => {
        const isActive = currentAllenSubject === subj.id;
        html += `
            <button class="notes-tab-btn ${isActive ? 'active' : ''}" onclick="selectAllenSubject('${subj.id}')">
                ${subj.icon || '📖'} ${escapeNotesHtml(subj.name)} (${subj.chapterCount})
            </button>
        `;
    });

    tabsContainer.innerHTML = html;
}

function selectAllenSubject(subjId) {
    currentAllenSubject = subjId;
    renderAllenSubjects();
    renderAllenChapters();
}

function renderAllenChapters() {
    const grid = document.getElementById('allenChapterGrid');
    const allen = getAllenProvider();
    if (!grid || !allen || !allen.subjects) return;

    let allChapters = [];
    allen.subjects.forEach(subj => {
        if (currentAllenSubject === 'all' || currentAllenSubject === subj.id) {
            (subj.chapters || []).forEach(ch => {
                allChapters.push({
                    ...ch,
                    subjectName: subj.name,
                    subjectId: subj.id,
                    icon: subj.icon
                });
            });
        }
    });

    if (allChapters.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem 1rem; color: var(--text-muted);">
                🔍 No revision notes found for this subject.
            </div>
        `;
        return;
    }

    grid.innerHTML = allChapters.map(ch => `
        <div class="notes-chapter-card" onclick="openNotesChapter('${ch.file}')">
            <div class="notes-chap-top">
                <span class="notes-chap-subj">${ch.icon || '📖'} ${escapeNotesHtml(ch.subjectName)}</span>
                <span class="notes-chap-dur">⏱️ ${ch.durationMinutes || 45} mins</span>
            </div>
            <div class="notes-chap-title">${escapeNotesHtml(ch.name)}</div>
            <div class="notes-chap-meta">
                <span>📑 ${ch.moduleCount} Subtopics</span>
                <span>🧩 ${ch.blockCount} Learning Blocks</span>
            </div>
        </div>
    `).join('');
}

// Open Allen Chapter in 2-Column Reader
async function openNotesChapter(filePath) {
    try {
        const res = await fetch(filePath);
        currentChapterData = await res.json();
        currentModuleIndex = 0;
        currentView = 'reader-allen';

        hideAllScreens();
        const readerScreen = document.getElementById('notesReaderScreen');
        if (readerScreen) readerScreen.classList.add('active');
        window.scrollTo(0, 0);

        if (!isNotesHistoryNavigating) {
            try {
                history.pushState({ cafe: 'notes', view: 'reader-allen', filePath: filePath }, '');
            } catch (err) { /* ignore */ }
        }

        renderSidebarToc();
        renderActiveModule();
    } catch (e) {
        console.error('Failed to load Allen chapter notes:', e);
        alert('Could not open notes file.');
    }
}

function closeNotesReader() {
    if (window.history.length > 1 && history.state && history.state.view === 'reader-allen') {
        window.history.back();
    } else {
        openAllenHub(false);
    }
}

// ============================================================
// 2. PHYSICS WALLAH (PW) DIGITAL BOOKS HUB
// ============================================================
function getPwProvider() {
    if (!notesManifest || !notesManifest.providers) return null;
    return notesManifest.providers.find(x => x.id === 'pw');
}

function openPwHub(pushHistory = true) {
    currentView = 'pw';
    hideAllScreens();
    const pwScreen = document.getElementById('pwScreen');
    if (pwScreen) pwScreen.style.display = 'block';
    window.scrollTo(0, 0);

    renderPwFilterTabs();
    renderPwBooks();

    if (pushHistory && !isNotesHistoryNavigating) {
        try { history.pushState({ cafe: 'notes', view: 'pw' }, ''); } catch (e) { }
    }
}

function filterPwBooks(filterType) {
    currentPwFilter = filterType;
    renderPwFilterTabs();
    renderPwBooks();
}

function renderPwFilterTabs() {
    const tabsContainer = document.getElementById('pwFilterTabs');
    const pw = getPwProvider();
    if (!tabsContainer || !pw || !pw.books) return;

    const books = pw.books;
    const countAll = books.length;
    const countVE = books.filter(b => b.type === 'Visual Edge').length;
    const countSum = books.filter(b => b.type === 'Summary Notes').length;
    const countFH = books.filter(b => b.type === 'Formula Handbook').length;
    const countCV = books.filter(b => b.type === 'Concept Vault').length;

    tabsContainer.innerHTML = `
        <button class="notes-tab-btn ${currentPwFilter === 'all' ? 'active' : ''}" onclick="filterPwBooks('all')">
            📚 All Books (${countAll})
        </button>
        <button class="notes-tab-btn ${currentPwFilter === 'Visual Edge' ? 'active' : ''}" onclick="filterPwBooks('Visual Edge')">
            🎨 Visual Edge (${countVE})
        </button>
        <button class="notes-tab-btn ${currentPwFilter === 'Summary Notes' ? 'active' : ''}" onclick="filterPwBooks('Summary Notes')">
            📝 Summary Notes (${countSum})
        </button>
        <button class="notes-tab-btn ${currentPwFilter === 'Formula Handbook' ? 'active' : ''}" onclick="filterPwBooks('Formula Handbook')">
            📐 Formula Handbooks (${countFH})
        </button>
        <button class="notes-tab-btn ${currentPwFilter === 'Concept Vault' ? 'active' : ''}" onclick="filterPwBooks('Concept Vault')">
            💡 Concept Vaults (${countCV})
        </button>
    `;
}

function renderPwBooks() {
    const grid = document.getElementById('pwBooksGrid');
    const pw = getPwProvider();
    if (!grid || !pw || !pw.books) return;

    let books = pw.books;
    if (currentPwFilter !== 'all') {
        books = books.filter(b => b.type === currentPwFilter);
    }

    if (books.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem 1rem; color: var(--text-muted);">
                🔍 No books found for this category.
            </div>
        `;
        return;
    }

    grid.innerHTML = books.map(b => `
        <div class="pw-book-card" onclick="openPwBook('${b.slug}')">
            <div class="pw-book-badges">
                <span class="pw-badge-type">${escapeNotesHtml(b.type)}</span>
                <span class="pw-badge-class">${escapeNotesHtml(b.class)}</span>
            </div>
            <div class="pw-book-title">${b.icon || '📖'} ${escapeNotesHtml(b.title)}</div>
            <div class="pw-book-foot">
                <span>📑 ${b.chapterCount} Chapters</span>
                <span style="color:var(--accent); font-weight:700;">Browse Chapters →</span>
            </div>
        </div>
    `).join('');
}

// Open Specific PW Book (Chapter List)
function openPwBook(bookSlug, pushHistory = true) {
    const pw = getPwProvider();
    if (!pw || !pw.books) return;

    const book = pw.books.find(b => b.slug === bookSlug);
    if (!book) return;

    currentPwBook = book;
    currentView = 'pw-book';

    hideAllScreens();
    const bookScreen = document.getElementById('pwBookScreen');
    if (bookScreen) bookScreen.style.display = 'block';
    window.scrollTo(0, 0);

    // Update Header
    const crumb = document.getElementById('pwBookCrumb');
    if (crumb) crumb.textContent = book.title;

    const iconEl = document.getElementById('pwHeroIcon');
    if (iconEl) iconEl.textContent = book.icon || '📖';

    const titleEl = document.getElementById('pwHeroTitle');
    if (titleEl) titleEl.textContent = book.title;

    const metaEl = document.getElementById('pwHeroMeta');
    if (metaEl) metaEl.textContent = `${book.chapterCount} Chapters · ${book.class} · ${book.type}`;

    // Render Chapters List
    const chaptersGrid = document.getElementById('pwChaptersGrid');
    if (chaptersGrid) {
        chaptersGrid.innerHTML = (book.chapters || []).map((ch, idx) => `
            <div class="pw-chapter-card" onclick="openPwChapter('${book.slug}', '${ch.id}')">
                <div class="pw-chap-left">
                    <div class="pw-chap-num">${ch.chapterNumber}</div>
                    <div class="pw-chap-name">${escapeNotesHtml(ch.name)}</div>
                </div>
                <div class="pw-chap-arrow">→</div>
            </div>
        `).join('');
    }

    if (pushHistory && !isNotesHistoryNavigating) {
        try { history.pushState({ cafe: 'notes', view: 'pw-book', bookSlug: bookSlug }, ''); } catch (e) { }
    }
}

// Open PW Chapter HTML in Reader Screen
function openPwChapter(bookSlug, chapterId, pushHistory = true) {
    const pw = getPwProvider();
    if (!pw || !pw.books) return;

    const book = pw.books.find(b => b.slug === bookSlug);
    if (!book) return;

    const chapIdx = (book.chapters || []).findIndex(c => c.id === chapterId);
    if (chapIdx === -1) return;

    const chapter = book.chapters[chapIdx];
    currentPwBook = book;
    currentPwChapterIndex = chapIdx;
    currentPwChapter = chapter;
    currentView = 'reader-pw';

    hideAllScreens();
    const pwReaderScreen = document.getElementById('pwReaderScreen');
    if (pwReaderScreen) pwReaderScreen.classList.add('active');

    // Update Titles
    const bTitleEl = document.getElementById('pwReaderBookTitle');
    if (bTitleEl) bTitleEl.textContent = `${book.title}`;

    const cTitleEl = document.getElementById('pwReaderChapTitle');
    if (cTitleEl) cTitleEl.textContent = chapter.name;

    // Prev / Next button states
    const prevBtn = document.getElementById('pwPrevChapBtn');
    if (prevBtn) prevBtn.disabled = (chapIdx === 0);

    const nextBtn = document.getElementById('pwNextChapBtn');
    if (nextBtn) nextBtn.disabled = (chapIdx === book.chapters.length - 1);

    // Load iframe
    const frame = document.getElementById('pwReaderFrame');
    if (frame) {
        frame.src = chapter.url;
        frame.onload = () => {
            syncThemeToFrame();
        };
    }

    if (pushHistory && !isNotesHistoryNavigating) {
        try {
            history.pushState({ cafe: 'notes', view: 'reader-pw', bookSlug: bookSlug, chapterId: chapterId }, '');
        } catch (e) { }
    }
}

function closePwReader() {
    const frame = document.getElementById('pwReaderFrame');
    if (frame) frame.src = 'about:blank';

    if (currentPwBook) {
        openPwBook(currentPwBook.slug, false);
    } else {
        openPwHub(false);
    }
}

function navPwChapter(delta) {
    if (!currentPwBook || !currentPwBook.chapters) return;
    const newIdx = currentPwChapterIndex + delta;
    if (newIdx >= 0 && newIdx < currentPwBook.chapters.length) {
        const nextChap = currentPwBook.chapters[newIdx];
        openPwChapter(currentPwBook.slug, nextChap.id);
    }
}

function openPwInNewTab() {
    if (currentPwChapter && currentPwChapter.url) {
        window.open(currentPwChapter.url, '_blank');
    }
}

function syncThemeToFrame() {
    const frame = document.getElementById('pwReaderFrame');
    if (!frame || !frame.contentWindow) return;
    const currentTheme = (typeof getTheme === 'function') ? getTheme() : (document.documentElement.getAttribute('data-theme') || 'light');
    try {
        frame.contentWindow.postMessage({ type: 'setTheme', payload: currentTheme }, '*');
    } catch (e) { /* ignore cross-origin */ }
}

// Observe Quizzy theme changes and sync to PW reader iframe
const themeObserver = new MutationObserver(() => {
    syncThemeToFrame();
});
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ============================================================
// 3. ALLEN READER LOGIC (TOC, MODULES, PYQ BLOCKS)
// ============================================================
function toggleNotesTocDrawer(force) {
    const drawerEl = document.getElementById('notesTocDrawer');
    const overlayEl = document.getElementById('notesTocOverlay');
    const isOpen = typeof force === 'boolean' ? force : !drawerEl.classList.contains('open');
    if (drawerEl) drawerEl.classList.toggle('open', isOpen);
    if (overlayEl) overlayEl.classList.toggle('open', isOpen);
}

function renderSidebarToc() {
    if (!currentChapterData) return;

    const subjEl = document.getElementById('notesSidebarSubj');
    const chapEl = document.getElementById('notesSidebarChap');
    const metaEl = document.getElementById('notesSidebarMeta');
    const topBarTitle = document.getElementById('notesReaderBarTitle');

    const drawerSubjEl = document.getElementById('notesDrawerSubj');
    const drawerChapEl = document.getElementById('notesDrawerChap');
    const drawerMetaEl = document.getElementById('notesDrawerMeta');

    const subjText = (currentChapterData.subject || 'NOTES').toUpperCase();
    const chapText = currentChapterData.chapter || 'Chapter';
    const metaText = `${currentChapterData.moduleCount} Subtopics · ${currentChapterData.durationMinutes} mins`;

    if (subjEl) subjEl.textContent = subjText;
    if (chapEl) chapEl.textContent = chapText;
    if (metaEl) metaEl.textContent = metaText;
    if (topBarTitle) topBarTitle.textContent = `${currentChapterData.subject} · ${chapText}`;

    if (drawerSubjEl) drawerSubjEl.textContent = subjText;
    if (drawerChapEl) drawerChapEl.textContent = chapText;
    if (drawerMetaEl) drawerMetaEl.textContent = metaText;

    const itemsHtml = currentChapterData.modules.map((mod, idx) => {
        const isActive = idx === currentModuleIndex;
        return `
            <div class="notes-sidebar-item ${isActive ? 'active' : ''}" onclick="selectNotesModule(${idx})">
                <div class="notes-sidebar-num">${idx + 1}</div>
                <div class="notes-sidebar-text">
                    <div class="notes-sidebar-item-title">${escapeNotesHtml(mod.title)}</div>
                    <div class="notes-sidebar-item-meta">${mod.readingTimeMinutes || 3} mins · ${mod.blocks ? mod.blocks.length : 0} blocks</div>
                </div>
            </div>
        `;
    }).join('');

    const sidebarNav = document.getElementById('notesSidebarNav');
    if (sidebarNav) sidebarNav.innerHTML = itemsHtml;

    const drawerNav = document.getElementById('notesDrawerNav');
    if (drawerNav) drawerNav.innerHTML = itemsHtml;
}

function selectNotesModule(idx) {
    if (!currentChapterData || !currentChapterData.modules[idx]) return;
    currentModuleIndex = idx;
    toggleNotesTocDrawer(false);
    renderSidebarToc();
    renderActiveModule();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderActiveModule() {
    if (!currentChapterData) return;
    const mod = currentChapterData.modules[currentModuleIndex];
    if (!mod) return;

    const breadcrumbEl = document.getElementById('notesDocBreadcrumb');
    if (breadcrumbEl) {
        breadcrumbEl.textContent = `${currentChapterData.subject.toUpperCase()} · ${currentChapterData.chapter.toUpperCase()}`;
    }

    const titleEl = document.getElementById('notesDocTitle');
    if (titleEl) {
        titleEl.textContent = `${currentModuleIndex + 1}. ${mod.title}`;
    }

    const metaEl = document.getElementById('notesDocMeta');
    if (metaEl) {
        const blockCount = mod.blocks ? mod.blocks.length : 0;
        metaEl.textContent = `${blockCount} learning blocks · ${mod.readingTimeMinutes || 4} mins. Text, diagrams, and PYQs arranged in original order.`;
    }

    const prevBtn = document.getElementById('notesPrevModBtn');
    if (prevBtn) {
        prevBtn.style.visibility = currentModuleIndex === 0 ? 'hidden' : 'visible';
    }

    const nextBtn = document.getElementById('notesNextModBtn');
    if (nextBtn) {
        nextBtn.textContent = currentModuleIndex === currentChapterData.modules.length - 1 ? 'Finish Chapter ✔' : 'Next Subtopic →';
    }

    const container = document.getElementById('notesBlocksContainer');
    if (!container) return;

    if (!mod.blocks || mod.blocks.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 2rem;">No content blocks in this subtopic.</p>`;
        return;
    }

    container.innerHTML = mod.blocks.map((block, bIdx) => renderNoteBlock(block, bIdx)).join('');
    typesetNotesMath(container);
}

function renderNoteBlock(block, bIdx) {
    const type = block.type || 'KEY_POINTS';
    const title = block.title || '';
    const body = block.body || '';
    const tags = block.tags || [];

    const badgeMap = {
        'DEFINITION': { label: 'Definition', class: 'tag-definition', icon: '📖' },
        'KEY_POINTS': { label: 'Key Concept', class: 'tag-concept', icon: '⭐' },
        'FORMULA': { label: 'Formula', class: 'tag-formula', icon: '📐' },
        'DIAGRAMS': { label: 'Diagram / Visual', class: 'tag-diagram', icon: '🖼️' },
        'EXERCISE': { label: 'PYQ Check', class: 'tag-pyq', icon: '🎯' },
        'COMMON_CONFUSIONS': { label: 'Exam Trap', class: 'tag-trap', icon: '⚠' },
        'STEPS': { label: 'Process', class: 'tag-concept', icon: '🔄' },
        'TABLE': { label: 'Summary Table', class: 'tag-diagram', icon: '📊' }
    };

    const bInfo = badgeMap[type] || { label: type, class: 'tag-concept', icon: '📌' };

    let bodyHtml = '';

    if (type === 'EXERCISE') {
        const questionText = block.question || body;
        const options = block.options || [];
        const correctLetter = block.answer || '';
        const solutionText = block.solution || '';

        const optHtml = options.map((opt, oIdx) => {
            const letter = String.fromCharCode(65 + oIdx);
            return `
                <div class="note-q-opt" id="opt_${bIdx}_${letter}" onclick="checkNoteAnswer(${bIdx}, '${letter}', '${correctLetter}')">
                    <span class="note-q-opt-letter">${letter}</span>
                    <span class="note-q-opt-text">${safeNotesHtml(opt)}</span>
                </div>
            `;
        }).join('');

        bodyHtml = `
            <div class="note-q-prompt">${safeNotesHtml(questionText)}</div>
            <div class="note-q-options">${optHtml}</div>
            <div class="note-q-feedback" id="feedback_${bIdx}"></div>
            ${solutionText ? `
                <div class="note-q-ans-box" id="ansbox_${bIdx}">
                    <span class="note-q-ans-lbl">💡 Detailed Solution:</span>
                    <div style="margin-top:0.4rem;">${safeNotesHtml(solutionText)}</div>
                </div>
            ` : ''}
        `;
    } else {
        bodyHtml = `<div class="note-block-body">${safeNotesHtml(body)}</div>`;
    }

    return `
        <div class="note-block-card">
            <div class="note-block-header">
                <div class="note-block-header-left">
                    <div class="note-block-num">${bIdx + 1}</div>
                    <div>
                        <div class="note-block-title">${escapeNotesHtml(title)}</div>
                        <div class="note-block-subtype">${bInfo.icon} ${bInfo.label}</div>
                    </div>
                </div>
                <div class="note-block-tags">
                    <span class="note-tag-badge ${bInfo.class}">${bInfo.label}</span>
                </div>
            </div>
            ${bodyHtml}
        </div>
    `;
}

function checkNoteAnswer(bIdx, chosenLetter, correctLetter) {
    const feedbackEl = document.getElementById(`feedback_${bIdx}`);
    const ansBox = document.getElementById(`ansbox_${bIdx}`);
    const chosenEl = document.getElementById(`opt_${bIdx}_${chosenLetter}`);
    const correctEl = document.getElementById(`opt_${bIdx}_${correctLetter}`);

    document.querySelectorAll(`[id^="opt_${bIdx}_"]`).forEach(el => {
        el.style.pointerEvents = 'none';
    });

    if (chosenLetter === correctLetter) {
        if (chosenEl) chosenEl.classList.add('correct');
        if (feedbackEl) {
            feedbackEl.className = 'note-q-feedback correct';
            feedbackEl.innerHTML = '🎉 Correct! Well done.';
        }
    } else {
        if (chosenEl) chosenEl.classList.add('wrong');
        if (correctEl) correctEl.classList.add('correct');
        if (feedbackEl) {
            feedbackEl.className = 'note-q-feedback wrong';
            feedbackEl.innerHTML = `❌ Incorrect. Correct answer is Option (${correctLetter}).`;
        }
    }

    if (ansBox) ansBox.classList.add('show');
}

function nextNotesModule() {
    if (!currentChapterData) return;
    if (currentModuleIndex < currentChapterData.modules.length - 1) {
        selectNotesModule(currentModuleIndex + 1);
    } else {
        closeNotesReader();
    }
}

function prevNotesModule() {
    if (currentModuleIndex > 0) {
        selectNotesModule(currentModuleIndex - 1);
    }
}

// ============================================================
// POPSTATE (BROWSER / MOBILE BACK BUTTON)
// ============================================================
window.addEventListener('popstate', function (e) {
    if (typeof closeCurrentOverlay === 'function' && closeCurrentOverlay()) {
        return;
    }

    isNotesHistoryNavigating = true;
    try {
        const state = e.state;
        if (!state || state.view === 'home') {
            goNotesHome(false);
        } else if (state.view === 'allen') {
            openAllenHub(false);
        } else if (state.view === 'pw') {
            openPwHub(false);
        } else if (state.view === 'pw-book' && state.bookSlug) {
            openPwBook(state.bookSlug, false);
        } else if (state.view === 'reader-pw' && state.bookSlug && state.chapterId) {
            openPwChapter(state.bookSlug, state.chapterId, false);
        } else if (state.view === 'reader-allen' && state.filePath) {
            openNotesChapter(state.filePath);
        } else {
            goNotesHome(false);
        }
    } finally {
        isNotesHistoryNavigating = false;
    }
});

// Boot
document.addEventListener('DOMContentLoaded', () => {
    loadNotesManifest();
});
