/* ============================================================
   QUIZZY — NOTES CAFE JAVASCRIPT
   Handles manifest loading, Provider Hub (Allen vs Physics Wallah),
   2-column Allen interactive reader, and PW HTML digital book reader.
   ============================================================ */

let notesManifest = null;
let currentView = 'home'; // 'home' | 'allen' | 'pw' | 'pw-book' | 'reader-allen' | 'reader-pw' | 'pretty-ncert' | 'pretty-ncert-cat' | 'reader-pretty'

// Allen State
let currentAllenSubject = 'all';
let currentChapterData = null;
let currentModuleIndex = 0;

// PW State
let currentPwFilter = 'all';
let currentPwBook = null;
let currentPwChapterIndex = 0;
let currentPwChapter = null;

// Pretty NCERT State
let prettyNcertData = null;
let currentPrettyCatId = null;
let currentPrettyChapterIndex = -1;

let isNotesHistoryNavigating = false;

// Escape HTML utility
function escapeNotesHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([el]).catch(() => {});
        return;
    }
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
async function loadPrettyNcert() {
    if (prettyNcertData) return prettyNcertData;
    try {
        const res = await fetch('data/pretty-ncert.json');
        prettyNcertData = await res.json();
        return prettyNcertData;
    } catch (e) {
        console.warn('Could not load pretty-ncert.json:', e);
        return null;
    }
}

async function loadNotesManifest() {
    try {
        const [notesRes, prettyRes] = await Promise.all([
            fetch('data/notes-manifest.json').then(r => r.json()).catch(() => null),
            fetch('data/pretty-ncert.json').then(r => r.json()).catch(() => null)
        ]);
        notesManifest = notesRes;
        prettyNcertData = prettyRes;
        
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
        document.getElementById('pwBookScreen'),
        document.getElementById('prettyNcertScreen')
    ];
    screens.forEach(s => { if (s) s.style.display = 'none'; });

    const readers = [
        document.getElementById('notesReaderScreen'),
        document.getElementById('pwReaderScreen'),
        document.getElementById('prettyPdfReaderScreen')
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

    if (window.history.length > 1 && history.state && history.state.view === 'reader-pw') {
        window.history.back();
    } else if (currentPwBook) {
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
    const totalModules = currentChapterData.moduleCount || (currentChapterData.modules ? currentChapterData.modules.length : 0);
    const totalDuration = currentChapterData.durationMinutes || 45;
    const metaText = `${totalModules} Subtopics · ${totalDuration} mins`;

    if (subjEl) subjEl.textContent = subjText;
    if (chapEl) chapEl.textContent = chapText;
    if (metaEl) metaEl.textContent = metaText;
    if (topBarTitle) topBarTitle.textContent = `${currentChapterData.subject || 'Notes'} · ${chapText}`;

    if (drawerSubjEl) drawerSubjEl.textContent = subjText;
    if (drawerChapEl) drawerChapEl.textContent = chapText;
    if (drawerMetaEl) drawerMetaEl.textContent = metaText;

    const itemsHtml = (currentChapterData.modules || []).map((mod, idx) => {
        const isActive = idx === currentModuleIndex;
        const modTitle = mod.name || mod.title || `Subtopic ${idx + 1}`;
        const dur = mod.durationMinutes || mod.readingTimeMinutes || 5;
        const bCount = mod.blockCount || (mod.blocks ? mod.blocks.length : 0);
        return `
            <div class="notes-sidebar-item ${isActive ? 'active' : ''}" onclick="selectNotesModule(${idx})">
                <div class="notes-sidebar-num">${idx + 1}</div>
                <div class="notes-sidebar-text">
                    <div class="notes-sidebar-item-title">${escapeNotesHtml(modTitle)}</div>
                    <div class="notes-sidebar-dur">${dur} mins · ${bCount} blocks</div>
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
    if (!currentChapterData || !currentChapterData.modules || !currentChapterData.modules[idx]) return;
    currentModuleIndex = idx;
    toggleNotesTocDrawer(false);
    renderSidebarToc();
    renderActiveModule();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderActiveModule() {
    if (!currentChapterData || !currentChapterData.modules) return;
    const mod = currentChapterData.modules[currentModuleIndex];
    if (!mod) return;

    const breadcrumbEl = document.getElementById('notesDocBreadcrumb');
    if (breadcrumbEl) {
        breadcrumbEl.textContent = `${(currentChapterData.subject || '').toUpperCase()} · ${(currentChapterData.chapter || '').toUpperCase()}`;
    }

    const titleEl = document.getElementById('notesDocTitle');
    if (titleEl) {
        const modTitle = mod.name || mod.title || `Subtopic ${currentModuleIndex + 1}`;
        titleEl.textContent = `${currentModuleIndex + 1}. ${modTitle}`;
    }

    const metaEl = document.getElementById('notesDocMeta');
    if (metaEl) {
        const blockCount = mod.blockCount || (mod.blocks ? mod.blocks.length : 0);
        const dur = mod.durationMinutes || mod.readingTimeMinutes || 4;
        metaEl.textContent = `${blockCount} learning blocks · ${dur} mins. High-yield concepts, diagrams, and PYQs arranged in original order.`;
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

    container.innerHTML = mod.blocks.map((block, bIdx) => renderBlockCard(block, bIdx)).join('');
    typesetNotesMath(container);
}

function renderBlockCard(b, bIdx) {
    const idxNum = b.index || (bIdx + 1);
    const numStr = String(idxNum).padStart(2, '0');
    const subtype = b.subtype || b.type || 'TEXT';
    const title = b.title || '';
    const tags = b.tags || [];

    let tagsHtml = tags.map(t => {
        const isPyq = String(t).toUpperCase().includes('PYQ');
        const formattedTag = String(t).replace(/_/g, ' ').toLowerCase();
        return `<span class="note-tag-badge ${isPyq ? 'pyq' : ''}">${escapeNotesHtml(formattedTag)}</span>`;
    }).join('');

    let bodyHtml = '';

    if (subtype === 'TEXT') {
        const textContent = b.text || b.body || '';
        const lines = textContent.split('\n').map(l => l.trim()).filter(Boolean);
        let listItems = '';
        lines.forEach(l => {
            let cleanLine = l.replace(/^[•\-\*]\s*/, '');
            listItems += `<li>${safeNotesHtml(cleanLine)}</li>`;
        });
        bodyHtml = `<div class="note-block-body"><ul>${listItems}</ul></div>`;

    } else if (subtype === 'IMAGE' || subtype === 'MODEL_3D') {
        const is3D = subtype === 'MODEL_3D';
        const imgUrl = b.imageUrl || '';
        if (imgUrl) {
            bodyHtml = `
                <div class="note-image-wrap">
                    <div class="note-image-frame">
                        <img src="${escapeNotesHtml(imgUrl)}" class="note-image" alt="${escapeNotesHtml(title || 'Diagram')}" loading="lazy" onerror="this.onerror=null;this.closest('.note-image-wrap').style.display='none';">
                    </div>
                    <div class="note-caption">${is3D ? '🧊 3D visual preview' : '📷 ' + escapeNotesHtml(b.caption || title || 'Diagram')}</div>
                </div>
            `;
        } else {
            bodyHtml = `<div class="note-caption" style="padding:1rem 0;">${is3D ? '🧊 3D visual preview' : '📷 ' + escapeNotesHtml(title || 'Diagram')}</div>`;
        }

    } else if (subtype === 'QUESTION' || subtype === 'EXERCISE') {
        const prompt = b.prompt || b.question || b.text || b.body || '';
        const options = b.options || [];
        const answer = (b.answer && b.answer.trim()) ? b.answer : (b.solution || 'Self-Practice Checkpoint (Solve and verify with your class notes)');
        const blockId = `qblk_${b.id || idxNum}_${bIdx}`;

        let optsHtml = '';
        if (options.length > 0) {
            optsHtml = `
                <div class="note-q-options">
                    ${options.map((opt) => `<div class="note-q-opt" onclick="revealNoteAnswer('${blockId}')">${safeNotesHtml(opt)}</div>`).join('')}
                </div>
            `;
        }

        bodyHtml = `
            <div class="note-q-prompt">${safeNotesHtml(prompt)}</div>
            ${optsHtml}
            <button class="note-q-reveal-btn" onclick="revealNoteAnswer('${blockId}')">
                💡 Reveal Solution
            </button>
            <div class="note-q-answer-box" id="${blockId}">
                <div style="font-weight: 800; color: #10b981; margin-bottom: 0.35rem;">Answer &amp; Detailed Explanation:</div>
                <div>${safeNotesHtml(answer)}</div>
            </div>
        `;

    } else if (subtype === 'TABLE') {
        const tables = b.tables || [];
        if (tables.length > 0) {
            bodyHtml = tables.map(t => `
                <div class="note-table-wrap">
                    <table class="note-table">
                        ${t.columns && t.columns.length ? `
                            <thead>
                                <tr>${t.columns.map(c => `<th>${safeNotesHtml(c)}</th>`).join('')}</tr>
                            </thead>
                        ` : ''}
                        <tbody>
                            ${(t.rows || []).map(r => `<tr>${r.map(c => `<td>${safeNotesHtml(c)}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `).join('');
        } else if (b.text || b.body) {
            bodyHtml = `<div class="note-block-body">${safeNotesHtml(b.text || b.body)}</div>`;
        }
    } else {
        bodyHtml = `<div class="note-block-body">${safeNotesHtml(b.text || b.body || '')}</div>`;
    }

    return `
        <div class="note-block-card">
            <div class="note-block-header">
                <div class="note-block-num">${numStr}</div>
                <div class="note-block-title-wrap">
                    <div class="note-block-subtype">${escapeNotesHtml(subtype.replace(/_/g, ' '))}</div>
                    ${title ? `<div class="note-block-title">${safeNotesHtml(title)}</div>` : ''}
                </div>
                ${tagsHtml ? `<div class="note-block-tags">${tagsHtml}</div>` : ''}
            </div>
            ${bodyHtml}
        </div>
    `;
}

function revealNoteAnswer(blockId) {
    const box = document.getElementById(blockId);
    if (!box) return;
    box.classList.toggle('show');
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
// 3. PRETTY NCERT NOTES HUB
// ============================================================
async function openPrettyNcertHub(pushHistory = true) {
    if (!prettyNcertData) await loadPrettyNcert();
    currentView = 'pretty-ncert';
    currentPrettyCatId = null;
    currentPrettyChapterIndex = -1;

    hideAllScreens();
    const hub = document.getElementById('prettyNcertScreen');
    if (hub) hub.style.display = 'block';

    const crumb = document.getElementById('prettyNcertCrumb');
    if (crumb) crumb.textContent = '🌸 Pretty NCERT Notes';

    renderPrettyTabs();
    renderPrettyCategories();

    const catGrid = document.getElementById('prettyCategoryGrid');
    if (catGrid) catGrid.style.display = 'grid';

    const chapCont = document.getElementById('prettyChaptersContainer');
    if (chapCont) chapCont.style.display = 'none';

    window.scrollTo(0, 0);

    if (pushHistory && !isNotesHistoryNavigating) {
        try { history.pushState({ cafe: 'notes', view: 'pretty-ncert' }, ''); } catch (e) { }
    }
}

function renderPrettyTabs() {
    const tabsContainer = document.getElementById('prettyNcertTabs');
    if (!tabsContainer || !prettyNcertData) return;

    const cats = prettyNcertData.categories || [];
    let html = `
        <button class="notes-tab-btn ${!currentPrettyCatId ? 'active' : ''}" onclick="openPrettyNcertHub()">
            🌸 All Options (${cats.length})
        </button>
    `;
    cats.forEach(c => {
        const isActive = currentPrettyCatId === c.id;
        html += `
            <button class="notes-tab-btn ${isActive ? 'active' : ''}" onclick="selectPrettyNcertCategory('${c.id}')">
                ${c.icon} ${escapeNotesHtml(c.name)}
            </button>
        `;
    });
    tabsContainer.innerHTML = html;
}

function renderPrettyCategories() {
    const grid = document.getElementById('prettyCategoryGrid');
    if (!grid || !prettyNcertData) return;

    const cats = prettyNcertData.categories || [];
    grid.innerHTML = cats.map(cat => {
        return `
            <div class="pretty-cat-card" onclick="selectPrettyNcertCategory('${cat.id}')">
                <div class="pretty-cat-badge">${escapeNotesHtml(cat.badge || '')}</div>
                <div class="pretty-cat-header">
                    <span class="pretty-cat-icon">${cat.icon || '📖'}</span>
                    <div>
                        <div class="pretty-cat-title">${escapeNotesHtml(cat.name)}</div>
                        <div class="pretty-cat-sub">${cat.chapters.length} Chapters · Direct PDF</div>
                    </div>
                </div>
                <p class="pretty-cat-desc">${escapeNotesHtml(cat.description || '')}</p>
                <div class="pretty-cat-foot">
                    <span>${cat.chapters.length} Chapters</span>
                    <span class="pretty-cat-cta">Open Chapters →</span>
                </div>
            </div>
        `;
    }).join('');
}

async function selectPrettyNcertCategory(catId, pushHistory = true) {
    if (!prettyNcertData) await loadPrettyNcert();
    if (!catId) {
        openPrettyNcertHub(pushHistory);
        return;
    }

    const cat = (prettyNcertData.categories || []).find(c => c.id === catId);
    if (!cat) return;

    currentView = 'pretty-ncert-cat';
    currentPrettyCatId = catId;

    hideAllScreens();
    const hub = document.getElementById('prettyNcertScreen');
    if (hub) hub.style.display = 'block';

    const crumb = document.getElementById('prettyNcertCrumb');
    if (crumb) crumb.textContent = `🌸 Pretty NCERT · ${cat.name}`;

    renderPrettyTabs();

    const catGrid = document.getElementById('prettyCategoryGrid');
    if (catGrid) catGrid.style.display = 'none';

    const chapCont = document.getElementById('prettyChaptersContainer');
    if (chapCont) chapCont.style.display = 'block';

    // Render Chapters Header Info
    const header = document.getElementById('prettyChaptersHeader');
    if (header) {
        header.innerHTML = `
            <div class="pw-chapters-hero-info">
                <span class="pw-chapters-hero-icon">${cat.icon || '📖'}</span>
                <div>
                    <div class="pw-chapters-hero-title">${escapeNotesHtml(cat.name)}</div>
                    <div class="pw-chapters-hero-meta">${cat.chapters.length} Chapters · Highlighted Revision PDFs</div>
                </div>
            </div>
        `;
    }

    // Render Chapters Grid
    const chapGrid = document.getElementById('prettyChaptersGrid');
    if (chapGrid) {
        chapGrid.innerHTML = cat.chapters.map((ch, idx) => {
            const partBadge = ch.part ? `<span class="pretty-part-tag">${escapeNotesHtml(ch.part)}</span>` : '';
            return `
                <div class="pretty-chapter-card" onclick="openPrettyNcertPdf('${cat.id}', ${idx})">
                    <div class="pretty-chapter-top">
                        <div class="pretty-chapter-no">Chapter ${ch.num}</div>
                        ${partBadge}
                    </div>
                    <div class="pretty-chapter-title">${escapeNotesHtml(ch.name)}</div>
                    <div class="pretty-chapter-actions">
                        <button type="button" class="btn-read-pdf" onclick="openPrettyNcertPdf('${cat.id}', ${idx}); event.stopPropagation();">
                            📄 Read Notes
                        </button>
                        <a href="${escapeNotesHtml(ch.pdfUrl)}" target="_blank" rel="noopener noreferrer" class="btn-ext-pdf" onclick="event.stopPropagation();" title="Open in External Browser / PDF App">
                            ↗ Open PDF
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.scrollTo(0, 0);

    if (pushHistory && !isNotesHistoryNavigating) {
        try { history.pushState({ cafe: 'notes', view: 'pretty-ncert-cat', catId: catId }, ''); } catch (e) { }
    }
}

function openPrettyNcertPdf(catId, chapIndex, pushHistory = true) {
    if (!prettyNcertData) return;
    const cat = (prettyNcertData.categories || []).find(c => c.id === catId);
    if (!cat || !cat.chapters || !cat.chapters[chapIndex]) return;

    const chapter = cat.chapters[chapIndex];
    currentPrettyCatId = catId;
    currentPrettyChapterIndex = chapIndex;
    currentView = 'reader-pretty';

    hideAllScreens();
    const reader = document.getElementById('prettyPdfReaderScreen');
    if (reader) reader.classList.add('active');

    // Update Titles
    const catTitleEl = document.getElementById('prettyReaderCatTitle');
    if (catTitleEl) catTitleEl.textContent = cat.name.toUpperCase();

    const chapTitleEl = document.getElementById('prettyReaderChapTitle');
    if (chapTitleEl) {
        const partStr = chapter.part ? ` (${chapter.part})` : '';
        chapTitleEl.textContent = `Ch ${chapter.num}: ${chapter.name}${partStr}`;
    }

    // Prev / Next button states
    const prevBtn = document.getElementById('prettyPrevChapBtn');
    if (prevBtn) prevBtn.disabled = (chapIndex === 0);

    const nextBtn = document.getElementById('prettyNextChapBtn');
    if (nextBtn) nextBtn.disabled = (chapIndex === cat.chapters.length - 1);

    // External button URL
    const extBtn = document.getElementById('prettyReaderExternalBtn');
    if (extBtn) extBtn.href = chapter.pdfUrl;

    // Load iframe
    const frame = document.getElementById('prettyPdfReaderFrame');
    if (frame) {
        frame.src = chapter.pdfUrl;
    }

    window.scrollTo(0, 0);

    if (pushHistory && !isNotesHistoryNavigating) {
        try {
            history.pushState({ cafe: 'notes', view: 'reader-pretty', catId: catId, chapIndex: chapIndex }, '');
        } catch (e) { }
    }
}

function closePrettyPdfReader() {
    const frame = document.getElementById('prettyPdfReaderFrame');
    if (frame) frame.src = 'about:blank';

    if (window.history.length > 1 && history.state && history.state.view === 'reader-pretty') {
        window.history.back();
    } else if (currentPrettyCatId) {
        selectPrettyNcertCategory(currentPrettyCatId, false);
    } else {
        openPrettyNcertHub(false);
    }
}

function navPrettyChapter(delta) {
    if (!prettyNcertData || !currentPrettyCatId) return;
    const cat = (prettyNcertData.categories || []).find(c => c.id === currentPrettyCatId);
    if (!cat || !cat.chapters) return;

    const newIdx = currentPrettyChapterIndex + delta;
    if (newIdx >= 0 && newIdx < cat.chapters.length) {
        openPrettyNcertPdf(currentPrettyCatId, newIdx, true);
    }
}

window.openPrettyNcertHub = openPrettyNcertHub;
window.selectPrettyNcertCategory = selectPrettyNcertCategory;
window.openPrettyNcertPdf = openPrettyNcertPdf;
window.closePrettyPdfReader = closePrettyPdfReader;
window.navPrettyChapter = navPrettyChapter;

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
        } else if (state.view === 'pretty-ncert') {
            openPrettyNcertHub(false);
        } else if (state.view === 'pretty-ncert-cat' && state.catId) {
            selectPrettyNcertCategory(state.catId, false);
        } else if (state.view === 'reader-pretty' && state.catId && typeof state.chapIndex === 'number') {
            openPrettyNcertPdf(state.catId, state.chapIndex, false);
        } else {
            goNotesHome(false);
        }
    } finally {
        isNotesHistoryNavigating = false;
    }
});

// Desktop Escape key support to close reader
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const prettyReader = document.getElementById('prettyPdfReaderScreen');
        if (prettyReader && prettyReader.classList.contains('active')) {
            closePrettyPdfReader();
            return;
        }
        const pwReader = document.getElementById('pwReaderScreen');
        if (pwReader && pwReader.classList.contains('active')) {
            closePwReader();
            return;
        }
        const allenReader = document.getElementById('notesReaderScreen');
        if (allenReader && allenReader.classList.contains('active')) {
            closeNotesReader();
            return;
        }
    }
});

// Boot
document.addEventListener('DOMContentLoaded', () => {
    loadNotesManifest();
});

