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
        document.getElementById('prettyNcertScreen'),
        document.getElementById('ncertClozeScreen')
    ];
    screens.forEach(s => { if (s) s.style.display = 'none'; });

    const readers = [
        document.getElementById('notesReaderScreen'),
        document.getElementById('pwReaderScreen'),
        document.getElementById('prettyPdfReaderScreen'),
        document.getElementById('ncertClozeReaderScreen')
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
                        <div class="pretty-cat-sub">${cat.chapters.length} Chapters · Pretty Reader & PDF</div>
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
                    <div class="pw-chapters-hero-meta">${cat.chapters.length} Chapters · Textbook View & Pretty NCERT</div>
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
                        <button type="button" class="btn-read-pdf" onclick="openPrettyNcertPdf('${cat.id}', ${idx}, true, 'native'); event.stopPropagation();" title="Read formatted Textbook View">
                            📖 Read Chapter
                        </button>
                        <button type="button" class="btn-ext-pdf pretty-card-backup-btn" onclick="openPrettyNcertPdf('${cat.id}', ${idx}, true, 'pdf'); event.stopPropagation();" title="Open Highlighted Pretty NCERT Book">
                            🌸 Pretty NCERT
                        </button>
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

// PDF.js worker setup
if (typeof pdfjsLib !== 'undefined') {
    try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    } catch (e) {
        console.warn('PDF.js worker initialization error:', e);
    }
}

// Pretty Reader State
let prettyViewMode = 'native'; // 'native' | 'pdf'
let prettyFontSizePercent = 100;
let prettyFontFamily = 'sans'; // 'sans' | 'serif'
let prettyReaderTone = 'auto'; // 'auto' | 'sepia'
let prettyTocItems = [];
let prettyScrollListenerAttached = false;

// In-Page PDF Canvas Viewer State (No new tab, No Acrobat)
let currentPrettyPdfDoc = null;
let currentPrettyPdfUrl = null;
let currentPrettyPdfScale = 1.0;
let currentPrettyPdfRenderToken = 0;
let pdfAreaScrollListenerAttached = false;

function initPrettyReaderSettings() {
    try {
        const savedSize = localStorage.getItem('quizzy_pretty_font_size');
        if (savedSize) {
            prettyFontSizePercent = parseInt(savedSize, 10) || 100;
        }
        const savedFont = localStorage.getItem('quizzy_pretty_font_family');
        if (savedFont === 'serif' || savedFont === 'sans') {
            prettyFontFamily = savedFont;
        }
        const savedTone = localStorage.getItem('quizzy_pretty_reader_tone');
        if (savedTone === 'sepia' || savedTone === 'auto') {
            prettyReaderTone = savedTone;
        }
    } catch (e) { }

    applyPrettyFontSize();
    applyPrettyFontFamily();
    applyPrettyReaderTone();
}

function adjustPrettyFontSize(delta) {
    prettyFontSizePercent = Math.min(145, Math.max(80, prettyFontSizePercent + (delta * 8)));
    try { localStorage.setItem('quizzy_pretty_font_size', String(prettyFontSizePercent)); } catch (e) { }
    applyPrettyFontSize();
}

function applyPrettyFontSize() {
    const canvas = document.getElementById('prettyBlocksCanvas');
    if (canvas) {
        canvas.style.fontSize = `${(prettyFontSizePercent / 100) * 1.05}rem`;
    }
    const indicator = document.getElementById('prettyFontSizeDisplay');
    if (indicator) indicator.textContent = `${prettyFontSizePercent}%`;
}

function setPrettyFontFamily(family) {
    prettyFontFamily = family === 'serif' ? 'serif' : 'sans';
    try { localStorage.setItem('quizzy_pretty_font_family', prettyFontFamily); } catch (e) { }
    applyPrettyFontFamily();
}

function applyPrettyFontFamily() {
    const view = document.getElementById('prettyNativeView');
    const sansBtn = document.getElementById('fontSansBtn');
    const serifBtn = document.getElementById('fontSerifBtn');

    if (view) {
        if (prettyFontFamily === 'serif') {
            view.classList.add('pretty-font-serif');
        } else {
            view.classList.remove('pretty-font-serif');
        }
    }
    if (sansBtn && serifBtn) {
        sansBtn.classList.toggle('active', prettyFontFamily === 'sans');
        serifBtn.classList.toggle('active', prettyFontFamily === 'serif');
    }
}

function setPrettyReaderTone(tone) {
    prettyReaderTone = tone === 'sepia' ? 'sepia' : 'auto';
    try { localStorage.setItem('quizzy_pretty_reader_tone', prettyReaderTone); } catch (e) { }
    applyPrettyReaderTone();
}

function applyPrettyReaderTone() {
    const view = document.getElementById('prettyNativeView');
    const autoBtn = document.getElementById('toneAutoBtn');
    const sepiaBtn = document.getElementById('toneSepiaBtn');

    if (view) {
        if (prettyReaderTone === 'sepia') {
            view.classList.add('pretty-tone-sepia');
        } else {
            view.classList.remove('pretty-tone-sepia');
        }
    }
    if (autoBtn && sepiaBtn) {
        autoBtn.classList.toggle('active', prettyReaderTone === 'auto');
        sepiaBtn.classList.toggle('active', prettyReaderTone === 'sepia');
    }
}

function togglePrettySettings() {
    const panel = document.getElementById('prettySettingsPanel');
    if (!panel) return;
    const isShown = panel.style.display !== 'none';
    panel.style.display = isShown ? 'none' : 'flex';
}

function setPrettyViewMode(mode) {
    prettyViewMode = mode;
    const nativeBtn = document.getElementById('prettyModeNativeBtn');
    const pdfBtn = document.getElementById('prettyModePdfBtn');
    const nativeView = document.getElementById('prettyNativeView');
    const pdfView = document.getElementById('prettyPdfView');

    if (nativeBtn) nativeBtn.classList.toggle('active', mode === 'native');
    if (pdfBtn) pdfBtn.classList.toggle('active', mode === 'pdf');

    if (mode === 'native') {
        if (nativeView) nativeView.style.display = 'block';
        if (pdfView) pdfView.style.display = 'none';
    } else {
        if (nativeView) nativeView.style.display = 'none';
        if (pdfView) pdfView.style.display = 'flex';

        // Load in-page PDF if not already loaded for current chapter
        if (currentPrettyCatId && typeof currentPrettyChapterIndex === 'number' && prettyNcertData) {
            const cat = (prettyNcertData.categories || []).find(c => c.id === currentPrettyCatId);
            if (cat && cat.chapters && cat.chapters[currentPrettyChapterIndex]) {
                const chapter = cat.chapters[currentPrettyChapterIndex];
                loadAndRenderInPagePdf(chapter);
            }
        }
    }
}

function togglePrettyReaderMode() {
    const nextMode = (prettyViewMode === 'native') ? 'pdf' : 'native';
    setPrettyViewMode(nextMode);
}

function setupPrettyScrollTracking() {
    const view = document.getElementById('prettyNativeView');
    const progressBar = document.getElementById('prettyProgressBar');
    if (!view || !progressBar) return;

    if (!prettyScrollListenerAttached) {
        view.addEventListener('scroll', () => {
            const scrollTop = view.scrollTop;
            const scrollHeight = view.scrollHeight - view.clientHeight;
            if (scrollHeight > 0) {
                const percent = Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100));
                progressBar.style.width = `${percent}%`;
            } else {
                progressBar.style.width = '0%';
            }
        }, { passive: true });
        prettyScrollListenerAttached = true;
    }
    progressBar.style.width = '0%';
}

function setupPdfCanvasScrollTracking() {
    const area = document.getElementById('prettyPdfCanvasArea');
    const indicator = document.getElementById('pdfPageIndicator');
    if (!area || !indicator || pdfAreaScrollListenerAttached) return;

    area.addEventListener('scroll', () => {
        if (!currentPrettyPdfDoc) return;
        const cards = area.querySelectorAll('.pretty-pdf-page-card');
        const areaTop = area.scrollTop;
        const areaCenter = areaTop + (area.clientHeight / 3);

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const cardTop = card.offsetTop;
            const cardBottom = cardTop + card.offsetHeight;
            if (areaCenter >= cardTop && areaCenter <= cardBottom) {
                indicator.textContent = `Page ${i + 1} of ${currentPrettyPdfDoc.numPages}`;
                break;
            }
        }
    }, { passive: true });
    pdfAreaScrollListenerAttached = true;
}

// ============================================================
// IN-PAGE PDF.JS CANVAS RENDERING (NO NEW TAB, NO ACROBAT)
// ============================================================

async function loadAndRenderInPagePdf(chapter) {
    if (!chapter) return;
    const pdfUrl = chapter.localPdfUrl || chapter.pdfUrl;
    if (!pdfUrl) return;

    const canvasArea = document.getElementById('prettyPdfCanvasArea');
    const pagesList = document.getElementById('prettyPdfPagesList');
    const loadingEl = document.getElementById('prettyPdfLoading');
    const indicator = document.getElementById('pdfPageIndicator');
    const zoomVal = document.getElementById('pdfZoomVal');

    // If this document is already loaded and rendered, do nothing
    if (currentPrettyPdfDoc && currentPrettyPdfUrl === pdfUrl) {
        if (loadingEl) loadingEl.style.display = 'none';
        return;
    }

    // Invalidate any ongoing render token
    const thisRenderToken = ++currentPrettyPdfRenderToken;
    currentPrettyPdfUrl = pdfUrl;
    currentPrettyPdfDoc = null;

    if (pagesList) pagesList.innerHTML = '';
    if (loadingEl) {
        loadingEl.style.display = 'flex';
        loadingEl.innerHTML = `
            <div class="pretty-spinner"></div>
            <div class="pretty-pdf-loading-text">Rendering Pretty NCERT (${escapeNotesHtml(chapter.name)})...</div>
        `;
    }
    if (indicator) indicator.textContent = 'Loading pages...';

    // Verify PDF.js is loaded
    if (typeof pdfjsLib === 'undefined') {
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div class="pretty-error-state">
                    <div style="font-size:2.2rem; margin-bottom:0.5rem;">⚠️</div>
                    <div style="font-weight:700; margin-bottom:0.4rem;">PDF.js Engine Not Loaded</div>
                    <p style="color:var(--text-muted); font-size:0.88rem; max-width:440px; margin:0 auto 1.25rem;">
                        We couldn't initialize the local PDF engine. You can read the chapter in Textbook View below.
                    </p>
                    <button class="btn-read-pdf" onclick="setPrettyViewMode('native')">
                        📖 Read Textbook View
                    </button>
                </div>
            `;
        }
        return;
    }

    try {
        const loadingTask = pdfjsLib.getDocument({
            url: pdfUrl,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true
        });

        const pdfDoc = await loadingTask.promise;
        if (thisRenderToken !== currentPrettyPdfRenderToken) return;

        currentPrettyPdfDoc = pdfDoc;
        if (indicator) indicator.textContent = `Total ${pdfDoc.numPages} Pages`;

        // Calculate auto-fit scale based on container width
        const firstPage = await pdfDoc.getPage(1);
        if (thisRenderToken !== currentPrettyPdfRenderToken) return;

        const unscaledViewport = firstPage.getViewport({ scale: 1.0 });
        const availableWidth = Math.min((canvasArea ? canvasArea.clientWidth : window.innerWidth) - 48, 860);
        currentPrettyPdfScale = Math.max(0.65, Math.min(1.6, (availableWidth > 300 ? availableWidth : 680) / unscaledViewport.width));

        if (zoomVal) zoomVal.textContent = `${Math.round(currentPrettyPdfScale * 100)}%`;
        if (loadingEl) loadingEl.style.display = 'none';

        // Render all page cards
        setupPdfCanvasScrollTracking();
        await renderAllPdfPages(pdfDoc, thisRenderToken);

    } catch (err) {
        console.error('Error loading Pretty NCERT PDF:', err);
        if (thisRenderToken !== currentPrettyPdfRenderToken) return;

        if (loadingEl) {
            loadingEl.style.display = 'flex';
            loadingEl.innerHTML = `
                <div class="pretty-error-state">
                    <div style="font-size:2.2rem; margin-bottom:0.5rem;">🌸</div>
                    <div style="font-weight:700; margin-bottom:0.4rem;">Pretty NCERT Unavailable</div>
                    <p style="color:var(--text-muted); font-size:0.88rem; max-width:420px; margin:0 auto 1.25rem;">
                        The full formatted chapter notes are available in Textbook View.
                    </p>
                    <div style="display:flex; gap:0.75rem; justify-content:center; flex-wrap:wrap;">
                        <button class="btn-read-pdf" onclick="setPrettyViewMode('native')">
                            📖 Read Textbook View
                        </button>
                    </div>
                </div>
            `;
        }
    }
}

async function renderAllPdfPages(pdfDoc, token) {
    const pagesList = document.getElementById('prettyPdfPagesList');
    if (!pagesList || !pdfDoc) return;
    pagesList.innerHTML = '';

    const numPages = pdfDoc.numPages;

    // Create cards for each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const card = document.createElement('div');
        card.className = 'pretty-pdf-page-card';
        card.id = `prettyPdfCard_${pageNum}`;
        card.innerHTML = `
            <canvas id="prettyPdfCanvas_${pageNum}" class="pretty-pdf-canvas"></canvas>
            <div class="pretty-pdf-page-footer">Page ${pageNum} of ${numPages}</div>
        `;
        pagesList.appendChild(card);
    }

    // Render pages sequentially to avoid blocking the UI
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (token !== currentPrettyPdfRenderToken) break;
        await renderSinglePdfPage(pdfDoc, pageNum, token);
    }
}

async function renderSinglePdfPage(pdfDoc, pageNum, token) {
    try {
        const canvas = document.getElementById(`prettyPdfCanvas_${pageNum}`);
        if (!canvas) return;

        const page = await pdfDoc.getPage(pageNum);
        if (token !== currentPrettyPdfRenderToken) return;

        const viewport = page.getViewport({ scale: currentPrettyPdfScale });
        const dpr = window.devicePixelRatio || 1;

        // Set dimensions for high-DPI crisp rendering
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        if (window.innerWidth <= 768) {
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
        } else {
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;
        }

        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
            canvasContext: ctx,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
            viewport: viewport
        };

        await page.render(renderContext).promise;
    } catch (e) {
        console.warn(`Error rendering PDF page ${pageNum}:`, e);
    }
}

async function zoomPrettyPdf(delta) {
    if (!currentPrettyPdfDoc) return;
    const newScale = Math.max(0.5, Math.min(2.5, currentPrettyPdfScale + delta));
    if (Math.abs(newScale - currentPrettyPdfScale) < 0.01) return;

    currentPrettyPdfScale = newScale;
    const zoomVal = document.getElementById('pdfZoomVal');
    if (zoomVal) zoomVal.textContent = `${Math.round(currentPrettyPdfScale * 100)}%`;

    const thisToken = ++currentPrettyPdfRenderToken;
    for (let pageNum = 1; pageNum <= currentPrettyPdfDoc.numPages; pageNum++) {
        if (thisToken !== currentPrettyPdfRenderToken) break;
        await renderSinglePdfPage(currentPrettyPdfDoc, pageNum, thisToken);
    }
}

async function fitWidthPrettyPdf() {
    if (!currentPrettyPdfDoc) return;
    try {
        const canvasArea = document.getElementById('prettyPdfCanvasArea');
        const firstPage = await currentPrettyPdfDoc.getPage(1);
        const unscaledViewport = firstPage.getViewport({ scale: 1.0 });
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            currentPrettyPdfScale = Math.max(0.9, window.innerWidth / unscaledViewport.width);
        } else {
            const availableWidth = Math.min((canvasArea ? canvasArea.clientWidth : window.innerWidth) - 48, 920);
            currentPrettyPdfScale = Math.max(0.65, Math.min(2.0, (availableWidth > 300 ? availableWidth : 680) / unscaledViewport.width));
        }

        const zoomVal = document.getElementById('pdfZoomVal');
        if (zoomVal) zoomVal.textContent = `${Math.round(currentPrettyPdfScale * 100)}%`;

        const thisToken = ++currentPrettyPdfRenderToken;
        for (let pageNum = 1; pageNum <= currentPrettyPdfDoc.numPages; pageNum++) {
            if (thisToken !== currentPrettyPdfRenderToken) break;
            await renderSinglePdfPage(currentPrettyPdfDoc, pageNum, thisToken);
        }
    } catch (e) {
        console.warn('Error in fitWidthPrettyPdf:', e);
    }
}

// ============================================================
// OPEN PRETTY NCERT READER (SUPPORT FOR NATIVE & IN-PAGE PDF)
// ============================================================

async function openPrettyNcertPdf(catId, chapIndex, pushHistory = true, initialMode = 'native') {
    if (!prettyNcertData) await loadPrettyNcert();
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
    if (catTitleEl) catTitleEl.textContent = `${cat.icon || '🌸'} ${cat.name.toUpperCase()}`;

    const chapTitleEl = document.getElementById('prettyReaderChapTitle');
    if (chapTitleEl) {
        const partStr = chapter.part ? ` (${chapter.part})` : '';
        chapTitleEl.textContent = `Ch ${chapter.num}: ${chapter.name}${partStr}`;
    }

    // Prev / Next button states (Desktop and Mobile)
    const isFirstChap = (chapIndex === 0);
    const isLastChap = (chapIndex === cat.chapters.length - 1);

    const prevBtn = document.getElementById('prettyPrevChapBtn');
    if (prevBtn) prevBtn.disabled = isFirstChap;

    const nextBtn = document.getElementById('prettyNextChapBtn');
    if (nextBtn) nextBtn.disabled = isLastChap;

    const prevMob = document.getElementById('prettyPrevChapBtnMob');
    if (prevMob) prevMob.disabled = isFirstChap;

    const nextMob = document.getElementById('prettyNextChapBtnMob');
    if (nextMob) nextMob.disabled = isLastChap;

    // TOC Backup Link - switches in-page to PDF mode without opening a new tab
    const tocBackup = document.getElementById('prettyTocBackupLink');
    if (tocBackup) {
        tocBackup.href = '#';
        tocBackup.onclick = (e) => {
            e.preventDefault();
            togglePrettyToc(false);
            setPrettyViewMode('pdf');
        };
    }

    // Close settings and outline panels
    const panel = document.getElementById('prettySettingsPanel');
    if (panel) panel.style.display = 'none';
    togglePrettyToc(false);

    // Initialize reader appearance settings
    initPrettyReaderSettings();
    setupPrettyScrollTracking();

    // Set initial view mode ('native' or 'pdf')
    setPrettyViewMode(initialMode);

    // If initial mode is 'pdf', immediately render in-page PDF
    if (initialMode === 'pdf') {
        loadAndRenderInPagePdf(chapter);
    }

    // Load and render JSON chapter for native view
    await loadAndRenderPrettyChapter(chapter, cat, chapIndex);

    const view = document.getElementById('prettyNativeView');
    if (view) view.scrollTop = 0;

    if (pushHistory && !isNotesHistoryNavigating) {
        try {
            history.pushState({ cafe: 'notes', view: 'reader-pretty', catId: catId, chapIndex: chapIndex }, '');
        } catch (e) { }
    }
}

async function loadAndRenderPrettyChapter(chapter, cat, chapIndex) {
    const loadingState = document.getElementById('prettyLoadingState');
    const article = document.getElementById('prettyArticle');
    const hero = document.getElementById('prettyDocHero');
    const canvas = document.getElementById('prettyBlocksCanvas');
    const footer = document.getElementById('prettyDocFooter');

    if (loadingState) loadingState.style.display = 'flex';
    if (article) article.style.display = 'none';

    try {
        const jsonPath = chapter.jsonPath || `data/ncert-json/${cat.id}/${chapter.name}.json`;
        const res = await fetch(jsonPath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blocks = await res.json();

        // Calculate statistics
        let wordCount = 0;
        let diagramCount = 0;
        blocks.forEach(b => {
            if (b.type === 'image') diagramCount++;
            if (typeof b.content === 'string') wordCount += b.content.split(/\s+/).length;
        });
        const readTimeMinutes = Math.max(3, Math.ceil(wordCount / 185));

        // 1. Render Hero Banner
        if (hero) {
            hero.innerHTML = `
                <div class="pretty-hero-badge-row">
                    <span class="pretty-hero-badge">${cat.icon || '🌸'} ${escapeNotesHtml(cat.name)}</span>
                    <span class="pretty-hero-chap-no">Chapter ${chapter.num}</span>
                    ${chapter.part ? `<span class="pretty-hero-part">${escapeNotesHtml(chapter.part)}</span>` : ''}
                </div>
                <h1 class="pretty-hero-title">${escapeNotesHtml(chapter.name)}</h1>
                <div class="pretty-hero-meta-row">
                    <span>⏱️ ~${readTimeMinutes} min read</span>
                    <span>📷 ${diagramCount} NCERT Diagrams</span>
                    <button type="button" class="pretty-hero-quick-switch" onclick="setPrettyViewMode('pdf')" title="Switch to Highlighted Pretty NCERT Book">
                        🌸 View in Pretty NCERT →
                    </button>
                </div>
            `;
        }

        // 2. Render Blocks & Build TOC
        const { html, toc } = parsePrettyNcertBlocks(blocks);
        if (canvas) canvas.innerHTML = html;

        // 3. Render TOC Drawer
        prettyTocItems = toc;
        renderPrettyTocDrawer(toc, chapter, cat);

        // 4. Render Footer Completion Card
        if (footer) {
            const isFirst = chapIndex === 0;
            const isLast = chapIndex === (cat.chapters.length - 1);
            footer.innerHTML = `
                <div class="pretty-completion-card">
                    <div class="pretty-completion-icon">🎉</div>
                    <div class="pretty-completion-title">Chapter ${chapter.num} Completed!</div>
                    <p class="pretty-completion-subtitle">You've covered the complete NCERT theory & diagrams for <strong>${escapeNotesHtml(chapter.name)}</strong>.</p>
                    
                    <div class="pretty-completion-actions">
                        <button type="button" class="pretty-backup-big-btn" onclick="setPrettyViewMode('pdf')">
                            🌸 Review in Pretty NCERT (Highlighted Book)
                        </button>
                    </div>

                    <div class="pretty-completion-nav">
                        <button class="pretty-nav-pill-btn" onclick="navPrettyChapter(-1)" ${isFirst ? 'disabled' : ''}>
                            ← Previous Chapter
                        </button>
                        <button class="pretty-nav-pill-btn pretty-scroll-top-btn" onclick="scrollPrettyToTop()">
                            ↑ Scroll to Top
                        </button>
                        <button class="pretty-nav-pill-btn next-pill" onclick="navPrettyChapter(1)" ${isLast ? 'disabled' : ''}>
                            Next Chapter →
                        </button>
                    </div>
                </div>
            `;
        }

        // Hide loading, show article
        if (loadingState) loadingState.style.display = 'none';
        if (article) article.style.display = 'block';

        // Re-apply font size
        applyPrettyFontSize();

        // Typeset MathJax if equations exist
        if (window.MathJax && window.MathJax.typesetPromise && canvas) {
            window.MathJax.typesetPromise([canvas]).catch(e => console.warn('MathJax error:', e));
        }

    } catch (err) {
        console.error('Error loading Pretty NCERT JSON chapter:', err);
        if (loadingState) {
            loadingState.innerHTML = `
                <div class="pretty-error-state">
                    <div style="font-size:2.5rem; margin-bottom:0.75rem;">⚠️</div>
                    <div style="font-weight:700; font-size:1.15rem; margin-bottom:0.5rem;">Could not load textbook view</div>
                    <p style="color:var(--text-muted); font-size:0.9rem; max-width:440px; margin:0 auto 1.5rem;">
                        No worries! You can read the complete highlighted book in Pretty NCERT view.
                    </p>
                    <div style="display:flex; gap:0.75rem; justify-content:center; flex-wrap:wrap;">
                        <button class="btn-read-pdf" onclick="setPrettyViewMode('pdf')">
                            🌸 Open in Pretty NCERT
                        </button>
                    </div>
                </div>
            `;
        }
    }
}

function parsePrettyNcertBlocks(blocks) {
    let html = '';
    const toc = [];
    let secCounter = 0;

    for (let i = 0; i < blocks.length; i++) {
        const item = blocks[i];
        const type = item.type;
        const content = item.content || '';

        // Headings
        if (type === 'h1' || type === 'h2' || type === 'h3' || type === 'h4') {
            secCounter++;
            const secId = `sec-heading-${secCounter}`;
            const cleanText = escapeNotesHtml(content);

            const isSummary = cleanText.toLowerCase().includes('summary');
            const isObjectives = cleanText.toLowerCase().includes('objectives');

            toc.push({
                id: secId,
                title: cleanText,
                level: type,
                isSummary: isSummary
            });

            const extraClass = isSummary ? ' pretty-summary-heading' : (isObjectives ? ' pretty-objectives-heading' : '');

            html += `
                <${type} id="${secId}" class="pretty-heading ${type}${extraClass}">
                    <span class="pretty-heading-anchor" onclick="scrollToPrettySection('${secId}')" title="Section anchor">#</span>
                    <span class="pretty-heading-text">${cleanText}</span>
                </${type}>
            `;
            continue;
        }

        // Paragraphs
        if (type === 'p') {
            const cleanText = escapeNotesHtml(content);
            // Detect if this is an overview section item
            const isSubtopicListing = /^(\d+\.\d+|\bchapter\s+\d+)/i.test(cleanText) && cleanText.length < 80;
            const pClass = isSubtopicListing ? 'pretty-p pretty-p-subtopic' : 'pretty-p';

            html += `<p class="${pClass}">${cleanText}</p>`;
            continue;
        }

        // Image (with check for attached caption)
        if (type === 'image') {
            const url = escapeNotesHtml(item.url || '');
            const alt = escapeNotesHtml(item.alt || 'NCERT Diagram');

            let figCaptionHtml = '';
            // Check if immediate next element is a caption
            if (i + 1 < blocks.length && blocks[i + 1].type === 'caption') {
                const capText = escapeNotesHtml(blocks[i + 1].content || '');
                figCaptionHtml = `
                    <figcaption class="pretty-figcaption">
                        <span class="pretty-fig-tag">FIGURE</span>
                        <span class="pretty-fig-text">${capText}</span>
                    </figcaption>
                `;
                i++; // skip next item since consumed
            }

            html += `
                <figure class="pretty-figure">
                    <div class="pretty-img-card" onclick="openPrettyImageModal('${url}', '${alt}', '${figCaptionHtml ? escapeNotesHtml(figCaptionHtml) : ''}')">
                        <img src="${url}" alt="${alt}" loading="lazy" class="pretty-img">
                        <div class="pretty-img-overlay">
                            <span class="pretty-zoom-badge">🔍 Tap to Zoom</span>
                        </div>
                    </div>
                    ${figCaptionHtml}
                </figure>
            `;
            continue;
        }

        // Standalone Caption
        if (type === 'caption') {
            const cleanText = escapeNotesHtml(content);
            const isUnitTag = /^unit\s+\d+/i.test(cleanText);
            const isTableTag = /^table\s+\d+/i.test(cleanText);

            if (isUnitTag) {
                html += `<div class="pretty-unit-pill">📘 ${cleanText}</div>`;
            } else if (isTableTag) {
                html += `<div class="pretty-table-caption">📊 <strong>${cleanText}</strong></div>`;
            } else {
                html += `<div class="pretty-standalone-caption">📷 ${cleanText}</div>`;
            }
            continue;
        }

        // Table
        if (type === 'table') {
            const rows = item.content || [];
            if (Array.isArray(rows) && rows.length > 0) {
                let tableHtml = `<div class="pretty-table-card"><div class="pretty-table-scroll"><table class="pretty-table">`;
                rows.forEach((row, rIdx) => {
                    const tag = rIdx === 0 ? 'th' : 'td';
                    tableHtml += `<tr>`;
                    if (Array.isArray(row)) {
                        row.forEach(cell => {
                            tableHtml += `<${tag}>${escapeNotesHtml(String(cell))}</${tag}>`;
                        });
                    }
                    tableHtml += `</tr>`;
                });
                tableHtml += `</table></div></div>`;
                html += tableHtml;
            }
            continue;
        }
    }

    return { html, toc };
}

function renderPrettyTocDrawer(toc, chapter, cat) {
    const catEl = document.getElementById('prettyTocCat');
    const chapEl = document.getElementById('prettyTocChap');
    const listEl = document.getElementById('prettyTocList');

    if (catEl) catEl.textContent = `${cat.icon || '🌸'} ${cat.name.toUpperCase()}`;
    if (chapEl) chapEl.textContent = `Ch ${chapter.num}: ${chapter.name}`;

    if (!listEl) return;

    if (!toc || toc.length === 0) {
        listEl.innerHTML = `<div class="pretty-toc-empty">No section headings found.</div>`;
        return;
    }

    listEl.innerHTML = toc.map((t, idx) => {
        const indentClass = `pretty-toc-${t.level}`;
        const summaryBadge = t.isSummary ? `<span class="toc-badge-summary">★ Key</span>` : '';
        return `
            <div class="pretty-toc-item ${indentClass}" onclick="scrollToPrettySection('${t.id}')">
                <span class="pretty-toc-bullet">›</span>
                <span class="pretty-toc-item-title">${escapeNotesHtml(t.title)}</span>
                ${summaryBadge}
            </div>
        `;
    }).join('');
}

function togglePrettyToc(force) {
    const drawer = document.getElementById('prettyTocDrawer');
    const overlay = document.getElementById('prettyTocOverlay');
    if (!drawer || !overlay) return;

    const isOpen = drawer.classList.contains('active');
    const shouldOpen = (force !== undefined) ? force : !isOpen;

    if (shouldOpen) {
        drawer.classList.add('active');
        overlay.classList.add('active');
        const search = document.getElementById('prettyTocSearch');
        if (search) {
            search.value = '';
            filterPrettyToc('');
            search.focus();
        }
    } else {
        drawer.classList.remove('active');
        overlay.classList.remove('active');
    }
}

function filterPrettyToc(query) {
    const listEl = document.getElementById('prettyTocList');
    if (!listEl) return;
    const q = (query || '').toLowerCase().trim();
    const items = listEl.querySelectorAll('.pretty-toc-item');
    items.forEach(el => {
        const txt = el.textContent.toLowerCase();
        el.style.display = (!q || txt.includes(q)) ? 'flex' : 'none';
    });
}

function scrollToPrettySection(secId) {
    togglePrettyToc(false);
    const target = document.getElementById(secId);
    if (!target) return;

    const view = document.getElementById('prettyNativeView');
    if (view) {
        const targetOffset = target.offsetTop - 85;
        view.scrollTo({
            top: targetOffset,
            behavior: 'smooth'
        });
    }

    // Flash highlight section
    target.classList.add('pretty-heading-flash');
    setTimeout(() => {
        target.classList.remove('pretty-heading-flash');
    }, 1600);
}

function scrollPrettyToTop() {
    const view = document.getElementById('prettyNativeView');
    if (view) {
        view.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function openPrettyImageModal(src, alt, captionHtml) {
    const modal = document.getElementById('prettyLightboxModal');
    const img = document.getElementById('prettyLightboxImg');
    const cap = document.getElementById('prettyLightboxCaption');

    if (!modal || !img) return;

    img.src = src;
    img.alt = alt || 'NCERT Diagram';
    if (cap) {
        cap.textContent = alt || '';
    }
    modal.style.display = 'flex';
}

function closePrettyLightbox() {
    const modal = document.getElementById('prettyLightboxModal');
    if (modal) modal.style.display = 'none';
}

function closePrettyPdfReader() {
    currentPrettyPdfDoc = null;
    currentPrettyPdfUrl = null;
    currentPrettyPdfRenderToken++;
    const pagesList = document.getElementById('prettyPdfPagesList');
    if (pagesList) pagesList.innerHTML = '';

    togglePrettyToc(false);
    closePrettyLightbox();

    const panel = document.getElementById('prettySettingsPanel');
    if (panel) panel.style.display = 'none';

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
        openPrettyNcertPdf(currentPrettyCatId, newIdx, true, prettyViewMode);
    }
}

window.openPrettyNcertHub = openPrettyNcertHub;
window.selectPrettyNcertCategory = selectPrettyNcertCategory;
window.openPrettyNcertPdf = openPrettyNcertPdf;
window.closePrettyPdfReader = closePrettyPdfReader;
window.navPrettyChapter = navPrettyChapter;
window.setPrettyViewMode = setPrettyViewMode;
window.togglePrettyReaderMode = togglePrettyReaderMode;
window.zoomPrettyPdf = zoomPrettyPdf;
window.fitWidthPrettyPdf = fitWidthPrettyPdf;
window.togglePrettyToc = togglePrettyToc;
window.filterPrettyToc = filterPrettyToc;
window.scrollToPrettySection = scrollToPrettySection;
window.togglePrettySettings = togglePrettySettings;
window.adjustPrettyFontSize = adjustPrettyFontSize;
window.setPrettyFontFamily = setPrettyFontFamily;
window.setPrettyReaderTone = setPrettyReaderTone;
window.openPrettyImageModal = openPrettyImageModal;
window.closePrettyLightbox = closePrettyLightbox;
window.scrollPrettyToTop = scrollPrettyToTop;


// ============================================================
// NCERT ACTIVE CLOZE — IMPLEMENTATION (HUMAN-CRAFTED ENGINE)
// ============================================================

let ncertClozeManifest = null;
let currentClozeTab = 'all';
let currentClozeSearchQuery = '';
let currentClozeChapterId = null;
let currentClozeChapterData = null;
let currentClozeMode = 'book'; // 'book' | 'list'
let isClozeSavedOnly = false;
let clozeStarredSet = new Set();
let clozeRevealedSet = new Set();
let activePillSentenceId = null;
let clozeLongPressTimer = null;
let clozeTouchStartX = 0;
let clozeTouchStartY = 0;
let clozeTouchMoved = false;

// Star / Bookmark Storage Helpers
function getNcertClozeStarred(chapterId) {
    const set = new Set();
    try {
        const all = JSON.parse(localStorage.getItem('quizzy-ncert-bookmarks') || '{}');
        if (Array.isArray(all[chapterId])) {
            all[chapterId].forEach(id => set.add(id));
        }
    } catch (e) { }
    try {
        const legacy = JSON.parse(localStorage.getItem('ncert_starred_' + chapterId) || '[]');
        if (Array.isArray(legacy)) {
            legacy.forEach(id => set.add(id));
        }
    } catch (e) { }
    return set;
}

function saveNcertClozeStarred(chapterId, set) {
    try {
        const all = JSON.parse(localStorage.getItem('quizzy-ncert-bookmarks') || '{}');
        all[chapterId] = Array.from(set);
        localStorage.setItem('quizzy-ncert-bookmarks', JSON.stringify(all));
        localStorage.setItem('ncert_starred_' + chapterId, JSON.stringify(Array.from(set)));
    } catch (e) { }
}

// Manifest Loader
async function loadNcertClozeManifest() {
    if (ncertClozeManifest && ncertClozeManifest.length > 0) return ncertClozeManifest;
    if (window.NCERT_CHAPTERS_MANIFEST && Array.isArray(window.NCERT_CHAPTERS_MANIFEST)) {
        ncertClozeManifest = window.NCERT_CHAPTERS_MANIFEST;
        return ncertClozeManifest;
    }
    try {
        const res = await fetch('data/ncert-cloze/chapters_manifest.json');
        if (res.ok) {
            ncertClozeManifest = await res.json();
            return ncertClozeManifest;
        }
    } catch (e) { }
    try {
        await injectScript('data/ncert-cloze/chapters_manifest.js');
        if (window.NCERT_CHAPTERS_MANIFEST) {
            ncertClozeManifest = window.NCERT_CHAPTERS_MANIFEST;
            return ncertClozeManifest;
        }
    } catch (e) { }
    return [];
}

// Hub Screen
async function openNcertClozeHub(pushHistory = true) {
    currentView = 'cloze-hub';
    hideAllScreens();
    const hub = document.getElementById('ncertClozeScreen');
    if (hub) hub.style.display = 'block';

    await loadNcertClozeManifest();
    renderNcertClozeChapters();
    window.scrollTo(0, 0);

    if (pushHistory && !isNotesHistoryNavigating) {
        try { history.pushState({ cafe: 'notes', view: 'cloze-hub' }, ''); } catch (e) { }
    }
}

function filterClozeTab(tab) {
    currentClozeTab = tab;
    const tabs = document.querySelectorAll('#clozeFilterTabs .notes-tab-btn');
    tabs.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${tab}'`));
    });
    renderNcertClozeChapters();
}

function filterNcertClozeChapters(query) {
    currentClozeSearchQuery = (query || '').toLowerCase().trim();
    renderNcertClozeChapters();
}

function renderNcertClozeChapters() {
    const grid = document.getElementById('clozeChapterGrid');
    if (!grid || !ncertClozeManifest) return;

    let filtered = ncertClozeManifest;
    if (currentClozeTab !== 'all') {
        filtered = filtered.filter(ch => `${ch.class} ${ch.subject}` === currentClozeTab);
    }
    if (currentClozeSearchQuery) {
        filtered = filtered.filter(ch =>
            ch.title.toLowerCase().includes(currentClozeSearchQuery) ||
            `chapter ${ch.chapter_no}`.includes(currentClozeSearchQuery) ||
            `ch ${ch.chapter_no}`.includes(currentClozeSearchQuery) ||
            ch.subject.toLowerCase().includes(currentClozeSearchQuery)
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
                <h3>No chapters found matching "${escapeNotesHtml(currentClozeSearchQuery)}"</h3>
            </div>
        `;
        return;
    }

    let allStars = {};
    try { allStars = JSON.parse(localStorage.getItem('quizzy-ncert-bookmarks') || '{}'); } catch (e) { }

    grid.innerHTML = filtered.map(ch => {
        const stars = (allStars[ch.id] || []).length;
        const starBadge = stars > 0 ? `<span class="cloze-stat-starred">⭐ ${stars} saved</span>` : '';
        return `
            <div class="notes-chapter-card" onclick="openNcertClozeReader('${ch.id}')">
                <div>
                    <div class="cloze-hero-badge-row">
                        <span class="cloze-hero-badge">${escapeNotesHtml(ch.class)} ${escapeNotesHtml(ch.subject)}</span>
                        <span class="cloze-hero-chap-no">Chapter ${ch.chapter_no}</span>
                    </div>
                    <h3 class="notes-chapter-title" style="margin-top: 0.35rem;">${escapeNotesHtml(ch.title)}</h3>
                    <div class="cloze-card-stat">
                        <span class="cloze-stat-pill">${ch.blanks} blanks</span>
                        <span>${ch.sentences} sentences</span>
                        ${starBadge}
                    </div>
                </div>
                <div class="notes-chapter-foot" style="margin-top: 1.25rem;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Active Recall</span>
                    <span style="color: #6366f1; font-weight: 800;">Start Drill →</span>
                </div>
            </div>
        `;
    }).join('');
}

// Reader Screen
async function openNcertClozeReader(chapterId, pushHistory = true) {
    currentClozeChapterId = chapterId;
    currentView = 'cloze-reader';
    clozeStarredSet = getNcertClozeStarred(chapterId);
    clozeRevealedSet.clear();
    isClozeSavedOnly = false;
    hideAllScreens();
    hideClozeActionPill();

    const reader = document.getElementById('ncertClozeReaderScreen');
    if (reader) reader.classList.add('active');

    const manifest = await loadNcertClozeManifest();
    const meta = manifest.find(m => m.id === chapterId);
    const subjEl = document.getElementById('clozeReaderSubj');
    const titleEl = document.getElementById('clozeReaderTitle');
    if (subjEl && meta) subjEl.textContent = `${meta.class} ${meta.subject}`.toUpperCase();
    if (titleEl && meta) titleEl.textContent = `Ch ${meta.chapter_no}: ${meta.title}`;

    updateClozeTopBarButtons();
    await loadAndRenderNcertClozeData(chapterId, meta);

    setupClozeGestureTracking();

    const canvasWrap = document.getElementById('clozeReaderCanvasWrap');
    if (canvasWrap) canvasWrap.scrollTop = 0;

    if (pushHistory && !isNotesHistoryNavigating) {
        try { history.pushState({ cafe: 'notes', view: 'cloze-reader', chapterId }, ''); } catch (e) { }
    }
}

function closeNcertClozeReader() {
    hideClozeActionPill();
    if (window.history.length > 1 && history.state && history.state.view === 'cloze-reader') {
        window.history.back();
    } else {
        openNcertClozeHub(false);
    }
}

function updateClozeTopBarButtons() {
    // Count starred sentences in current chapter
    let starredCount = 0;
    if (currentClozeChapterData && Array.isArray(currentClozeChapterData.elements)) {
        currentClozeChapterData.elements.forEach(el => {
            if (el.type === 'sentence' && clozeStarredSet.has(el.id)) starredCount++;
        });
    } else {
        starredCount = clozeStarredSet.size;
    }

    const savedCountEl = document.getElementById('clozeSavedCountText');
    if (savedCountEl) {
        savedCountEl.innerHTML = `<span class="btn-full-text">Saved Lines (${starredCount})</span><span class="btn-short-text">Saved (${starredCount})</span>`;
    }

    const savedBtn = document.getElementById('clozeSavedFilterBtn');
    if (savedBtn) savedBtn.classList.toggle('active', isClozeSavedOnly);

    const bookBtn = document.getElementById('clozeModeBookBtn');
    const listBtn = document.getElementById('clozeModeListBtn');
    if (bookBtn) bookBtn.classList.toggle('active', currentClozeMode === 'book' && !isClozeSavedOnly);
    if (listBtn) listBtn.classList.toggle('active', currentClozeMode === 'list' && !isClozeSavedOnly);

    const revealText = document.getElementById('clozeRevealAllText');
    const revealIcon = document.getElementById('clozeRevealAllIcon');
    const revealBtn = document.getElementById('clozeRevealAllBtn');
    if (clozeRevealedSet.size > 0) {
        if (revealText) revealText.innerHTML = `<span class="btn-full-text">Blur All</span><span class="btn-short-text">Blur</span>`;
        if (revealIcon) revealIcon.textContent = '🔒';
        if (revealBtn) revealBtn.classList.add('reveal-active');
    } else {
        if (revealText) revealText.innerHTML = `<span class="btn-full-text">Reveal All</span><span class="btn-short-text">Reveal</span>`;
        if (revealIcon) revealIcon.textContent = '👁️';
        if (revealBtn) revealBtn.classList.remove('reveal-active');
    }

    if (ncertClozeManifest && currentClozeChapterId) {
        const curIdx = ncertClozeManifest.findIndex(m => m.id === currentClozeChapterId);
        const isFirst = (curIdx <= 0);
        const isLast = (curIdx === -1 || curIdx >= ncertClozeManifest.length - 1);

        const prevBtn = document.getElementById('clozePrevChapBtn');
        const nextBtn = document.getElementById('clozeNextChapBtn');
        const prevMob = document.getElementById('clozePrevChapBtnMob');
        const nextMob = document.getElementById('clozeNextChapBtnMob');

        if (prevBtn) prevBtn.disabled = isFirst;
        if (nextBtn) nextBtn.disabled = isLast;
        if (prevMob) prevMob.disabled = isFirst;
        if (nextMob) nextMob.disabled = isLast;
    }
}

async function loadAndRenderNcertClozeData(chapterId, meta) {
    const loadingState = document.getElementById('clozeLoadingState');
    const hero = document.getElementById('clozeDocHero');
    const canvas = document.getElementById('clozeContentCanvas');
    const footer = document.getElementById('clozeDocFooter');

    if (loadingState) loadingState.style.display = 'flex';
    if (hero) hero.style.display = 'none';
    if (canvas) canvas.style.display = 'none';
    if (footer) footer.style.display = 'none';

    // 1. Check window cache
    if (window.NCERT_CLOZE_DATA && window.NCERT_CLOZE_DATA[chapterId]) {
        currentClozeChapterData = window.NCERT_CLOZE_DATA[chapterId];
        finalizeClozeRender(currentClozeChapterData, meta);
        return;
    }

    // 2. Fetch JSON
    try {
        const res = await fetch(`data/ncert-cloze/${chapterId}.json`);
        if (res.ok) {
            currentClozeChapterData = await res.json();
            finalizeClozeRender(currentClozeChapterData, meta);
            return;
        }
    } catch (e) {
        console.warn('Direct fetch failed, falling back to script injection:', e);
    }

    // 3. Fallback script injection
    try {
        await injectScript(`data/ncert-cloze/${chapterId}.js`);
        if (window.NCERT_CLOZE_DATA && window.NCERT_CLOZE_DATA[chapterId]) {
            currentClozeChapterData = window.NCERT_CLOZE_DATA[chapterId];
            finalizeClozeRender(currentClozeChapterData, meta);
            return;
        }
    } catch (err) {
        if (loadingState) {
            loadingState.innerHTML = `
                <div style="text-align:center; padding: 2.5rem; color: var(--error);">
                    <div style="font-size:2.2rem; margin-bottom: 0.5rem;">⚠️</div>
                    <h3>Could not load chapter data</h3>
                    <p style="color:var(--text-muted); font-size: 0.9rem;">${escapeNotesHtml(err.message)}</p>
                </div>
            `;
        }
    }
}

function finalizeClozeRender(data, meta) {
    const loadingState = document.getElementById('clozeLoadingState');
    const hero = document.getElementById('clozeDocHero');
    const canvas = document.getElementById('clozeContentCanvas');
    const footer = document.getElementById('clozeDocFooter');

    if (hero) {
        hero.style.display = 'block';
        hero.innerHTML = `
            <div class="cloze-hero-badge-row">
                <span class="cloze-hero-badge">${escapeNotesHtml(data.class || meta.class)} ${escapeNotesHtml(data.subject || meta.subject)}</span>
                <span class="cloze-hero-chap-no">Chapter ${data.chapter_no || meta.chapter_no}</span>
            </div>
            <h1 class="cloze-hero-title">${escapeNotesHtml(data.title || meta.title)}</h1>
            <div class="cloze-hero-meta-row">
                <span>🎯 ${data.stats ? data.stats.blanks : meta.blanks} High-Yield Blanks</span>
                <span>📄 ${data.stats ? data.stats.sentences : meta.sentences} Sentences</span>
                <span class="cloze-hint-badge">💡 Long-press word to peek · Long-press sentence to bookmark</span>
            </div>
        `;
    }

    renderNcertClozeActiveView();

    if (footer) {
        footer.style.display = 'block';
        footer.innerHTML = `
            <div class="pretty-completion-card">
                <div class="pretty-completion-icon">🧬</div>
                <div class="pretty-completion-title">Chapter Drill Completed!</div>
                <p class="pretty-completion-subtitle">You reviewed the high-yield NCERT lines for <strong>${escapeNotesHtml(data.title)}</strong>.</p>
                <div class="pretty-completion-nav" style="margin-top: 1.5rem;">
                    <button class="pretty-nav-pill-btn" onclick="navNcertClozeChapter(-1)">← Previous Chapter</button>
                    <button class="pretty-nav-pill-btn pretty-scroll-top-btn" onclick="scrollClozeToTop()">↑ Back to Top</button>
                    <button class="pretty-nav-pill-btn next-pill" onclick="navNcertClozeChapter(1)">Next Chapter →</button>
                </div>
            </div>
        `;
    }

    if (loadingState) loadingState.style.display = 'none';
    if (canvas) canvas.style.display = 'block';
}

function renderNcertClozeActiveView() {
    const canvas = document.getElementById('clozeContentCanvas');
    const emptySaved = document.getElementById('clozeEmptySaved');
    if (!canvas || !currentClozeChapterData) return;

    hideClozeActionPill();
    updateClozeTopBarButtons();

    // 1. FILTERED VIEW: Show only bookmarked hard lines
    if (isClozeSavedOnly) {
        const savedSentences = [];
        let currentSectionTitle = 'General NCERT Points';

        currentClozeChapterData.elements.forEach(el => {
            if (el.type === 'h2' || el.type === 'h3' || el.type === 'h4') {
                currentSectionTitle = el.content || 'NCERT Section';
            } else if (el.type === 'sentence' && clozeStarredSet.has(el.id)) {
                savedSentences.push({
                    sentence: el,
                    section: currentSectionTitle
                });
            }
        });

        if (savedSentences.length === 0) {
            canvas.style.display = 'none';
            if (emptySaved) emptySaved.style.display = 'block';
            return;
        }

        if (emptySaved) emptySaved.style.display = 'none';
        canvas.style.display = 'block';

        let html = `
            <div class="cloze-saved-feed">
                <div style="background: rgba(245, 158, 11, 0.1); border: 1.5px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1.5rem;">
                    <div style="font-weight: 800; color: #f59e0b; margin-bottom: 0.25rem;">⭐ Your Saved Hard Lines (${savedSentences.length})</div>
                    <div style="font-size: 0.88rem; color: var(--text-muted);">Showing only the sentences you bookmarked in this chapter for quick revision. Blanks remain active.</div>
                </div>
        `;

        let lastSec = '';
        savedSentences.forEach((item, idx) => {
            if (item.section !== lastSec) {
                lastSec = item.section;
                html += `<div class="cloze-saved-section-title">📌 ${escapeNotesHtml(lastSec)}</div>`;
            }
            html += `
                <div class="cloze-point-card starred" data-sid="${item.sentence.id}">
                    <span class="cloze-point-index">#${idx + 1}</span>
                    <div class="cloze-point-text">
                        <span class="cloze-sentence starred" data-sid="${item.sentence.id}">
                            ${renderClozeSentenceTokens(item.sentence)}
                        </span>
                    </div>
                    <div class="cloze-point-actions">
                        <button class="cloze-point-btn" onclick="revealSentenceBlanks('${item.sentence.id}')" title="Reveal this line">👁️</button>
                        <button class="cloze-point-btn starred" onclick="toggleNcertSentenceStar('${item.sentence.id}')" title="Remove bookmark">★</button>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        canvas.innerHTML = html;
        return;
    }

    if (emptySaved) emptySaved.style.display = 'none';
    canvas.style.display = 'block';

    // 2. MODE 1: 📖 BOOK LAYOUT (Continuous flowing textbook paragraphs)
    if (currentClozeMode === 'book') {
        let html = `<div class="cloze-book-content">`;
        let openParagraph = false;

        currentClozeChapterData.elements.forEach(el => {
            if (el.type === 'sentence') {
                if (!openParagraph) {
                    html += `<p class="cloze-book-p">`;
                    openParagraph = true;
                }
                const isStarred = clozeStarredSet.has(el.id);
                html += `<span class="cloze-sentence ${isStarred ? 'starred' : ''}" data-sid="${el.id}">${renderClozeSentenceTokens(el)}<button type="button" class="cloze-inline-star ${isStarred ? 'starred' : ''}" data-sid="${el.id}" title="${isStarred ? 'Bookmarked line (tap to remove)' : 'Bookmark line'}">${isStarred ? '★' : '☆'}</button> </span>`;
            } else {
                if (openParagraph) {
                    html += `</p>`;
                    openParagraph = false;
                }

                if (el.type === 'h2') {
                    html += `<h2 class="cloze-h2">${escapeNotesHtml(el.content)}</h2>`;
                } else if (el.type === 'h3') {
                    html += `<h3 class="cloze-h3">${escapeNotesHtml(el.content)}</h3>`;
                } else if (el.type === 'h4') {
                    html += `<h4 class="cloze-h4">${escapeNotesHtml(el.content)}</h4>`;
                } else if (el.type === 'caption') {
                    html += `<div class="cloze-caption">${escapeNotesHtml(el.content)}</div>`;
                } else if (el.type === 'image') {
                    const src = el.src || el.url || '';
                    const cap = el.caption || el.alt || 'NCERT Diagram';
                    html += `
                        <figure class="cloze-figure">
                            <div class="cloze-img-wrap" onclick="openPrettyImageModal('${escapeNotesHtml(src)}', '${escapeNotesHtml(cap)}')">
                                <img src="${escapeNotesHtml(src)}" alt="${escapeNotesHtml(cap)}" class="cloze-img" loading="lazy">
                            </div>
                            <figcaption class="cloze-figcaption">${escapeNotesHtml(cap)}</figcaption>
                        </figure>
                    `;
                } else if (el.type === 'table') {
                    html += `<div class="cloze-table-wrap"><table class="cloze-table">`;
                    (el.rows || []).forEach((row, rIdx) => {
                        html += `<tr>`;
                        row.forEach(cell => {
                            const tag = rIdx === 0 ? 'th' : 'td';
                            html += `<${tag}>${escapeNotesHtml(cell)}</${tag}>`;
                        });
                        html += `</tr>`;
                    });
                    html += `</table></div>`;
                }
            }
        });

        if (openParagraph) html += `</p>`;
        html += `</div>`;
        canvas.innerHTML = html;
        return;
    }

    // 3. MODE 2: 📝 POINT BY POINT (Numbered sentence drill)
    if (currentClozeMode === 'list') {
        let html = `<div class="cloze-point-list">`;
        let sentenceCount = 0;

        currentClozeChapterData.elements.forEach(el => {
            if (el.type === 'sentence') {
                sentenceCount++;
                const isStarred = clozeStarredSet.has(el.id);
                html += `
                    <div class="cloze-point-card ${isStarred ? 'starred' : ''}" data-sid="${el.id}">
                        <span class="cloze-point-index">#${sentenceCount}</span>
                        <div class="cloze-point-text">
                            <span class="cloze-sentence ${isStarred ? 'starred' : ''}" data-sid="${el.id}">
                                ${renderClozeSentenceTokens(el)}
                            </span>
                        </div>
                        <div class="cloze-point-actions">
                            <button class="cloze-point-btn" onclick="revealSentenceBlanks('${el.id}')" title="Reveal this line">👁️</button>
                            <button class="cloze-point-btn ${isStarred ? 'starred' : ''}" onclick="toggleNcertSentenceStar('${el.id}')" title="Bookmark hard line">${isStarred ? '★' : '☆'}</button>
                        </div>
                    </div>
                `;
            } else if (el.type === 'h2') {
                html += `<h2 class="cloze-h2">${escapeNotesHtml(el.content)}</h2>`;
            } else if (el.type === 'h3') {
                html += `<h3 class="cloze-h3">${escapeNotesHtml(el.content)}</h3>`;
            } else if (el.type === 'h4') {
                html += `<h4 class="cloze-h4">${escapeNotesHtml(el.content)}</h4>`;
            } else if (el.type === 'caption') {
                html += `<div class="cloze-caption">${escapeNotesHtml(el.content)}</div>`;
            }
        });

        html += `</div>`;
        canvas.innerHTML = html;
    }
}

function renderClozeSentenceTokens(sentence) {
    let out = '';
    (sentence.tokens || []).forEach(tok => {
        if (tok.t === 'cloze') {
            const isRevealed = clozeRevealedSet.has(tok.v);
            const cls = isRevealed ? 'revealed' : 'blurred';
            out += `<span class="cloze-word ${cls}" data-val="${escapeNotesHtml(tok.v)}" data-sid="${sentence.id}">${escapeNotesHtml(tok.v)}</span>`;
        } else {
            out += escapeNotesHtml(tok.v);
        }
    });
    return out;
}

// Mode & Filter Toggles
function setNcertClozeMode(mode) {
    currentClozeMode = mode;
    isClozeSavedOnly = false;
    renderNcertClozeActiveView();
}

function toggleNcertSavedFilter() {
    isClozeSavedOnly = !isClozeSavedOnly;
    renderNcertClozeActiveView();
}

function toggleNcertRevealAll() {
    if (!currentClozeChapterData) return;
    if (clozeRevealedSet.size > 0) {
        // Already some or all revealed -> re-blur everything
        clozeRevealedSet.clear();
    } else {
        // Reveal all blanks
        currentClozeChapterData.elements.forEach(el => {
            if (el.type === 'sentence' && Array.isArray(el.blanks)) {
                el.blanks.forEach(b => clozeRevealedSet.add(b));
            }
        });
    }
    renderNcertClozeActiveView();
}

function toggleSingleClozeWord(wordEl) {
    if (!wordEl) return;
    const val = wordEl.getAttribute('data-val');
    if (!val) return;

    if (clozeRevealedSet.has(val)) {
        clozeRevealedSet.delete(val);
    } else {
        clozeRevealedSet.add(val);
    }

    // Update all matching blanks across chapter for consistency
    const isRev = clozeRevealedSet.has(val);
    document.querySelectorAll(`.cloze-word[data-val="${val.replace(/"/g, '\\"')}"]`).forEach(el => {
        el.classList.toggle('revealed', isRev);
        el.classList.toggle('blurred', !isRev);
    });
    updateClozeTopBarButtons();
}

function revealSentenceBlanks(sentenceId) {
    if (!currentClozeChapterData) return;
    const sentence = currentClozeChapterData.elements.find(el => el.id === sentenceId);
    if (!sentence || !Array.isArray(sentence.blanks)) return;

    sentence.blanks.forEach(b => clozeRevealedSet.add(b));
    document.querySelectorAll(`.cloze-word[data-sid="${sentenceId}"]`).forEach(el => {
        el.classList.add('revealed');
        el.classList.remove('blurred');
    });
    updateClozeTopBarButtons();
}

function toggleNcertSentenceStar(sentenceId) {
    if (!currentClozeChapterId) return;

    if (clozeStarredSet.has(sentenceId)) {
        clozeStarredSet.delete(sentenceId);
    } else {
        clozeStarredSet.add(sentenceId);
    }
    saveNcertClozeStarred(currentClozeChapterId, clozeStarredSet);

    // Update DOM in Book View
    const isStNow = clozeStarredSet.has(sentenceId);
    document.querySelectorAll(`.cloze-sentence[data-sid="${sentenceId}"]`).forEach(el => {
        el.classList.toggle('starred', isStNow);
    });
    document.querySelectorAll(`.cloze-inline-star[data-sid="${sentenceId}"]`).forEach(star => {
        star.classList.toggle('starred', isStNow);
        star.textContent = isStNow ? '★' : '☆';
        star.title = isStNow ? 'Bookmarked line (tap to remove)' : 'Bookmark line';
    });

    // Update DOM in Point by Point View
    document.querySelectorAll(`.cloze-point-card[data-sid="${sentenceId}"]`).forEach(card => {
        const isSt = clozeStarredSet.has(sentenceId);
        card.classList.toggle('starred', isSt);
        const btn = card.querySelector('.cloze-point-btn.starred, .cloze-point-btn:last-child');
        if (btn) {
            btn.classList.toggle('starred', isSt);
            btn.textContent = isSt ? '★' : '☆';
        }
    });

    updateClozeTopBarButtons();

    // If in Saved Lines mode and unstarred, re-render to prune
    if (isClozeSavedOnly) {
        renderNcertClozeActiveView();
    }
}

// Touch & Pointer Gesture Tracking (Instant Tap / Click with Anti-Accidental Scroll)
function setupClozeGestureTracking() {
    const canvasWrap = document.getElementById('clozeReaderCanvasWrap');
    if (!canvasWrap || canvasWrap._clozeGestureAttached) return;
    canvasWrap._clozeGestureAttached = true;

    canvasWrap.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        clozeTouchStartX = e.clientX;
        clozeTouchStartY = e.clientY;
        clozeTouchMoved = false;
    });

    canvasWrap.addEventListener('pointermove', (e) => {
        const dx = Math.abs(e.clientX - clozeTouchStartX);
        const dy = Math.abs(e.clientY - clozeTouchStartY);
        if (dx > 8 || dy > 8) {
            clozeTouchMoved = true;
            hideClozeActionPill();
        }
    });

    canvasWrap.addEventListener('pointerup', (e) => {
        if (clozeTouchMoved) return; // User was scrolling, ignore tap

        const targetWord = e.target.closest('.cloze-word');
        const starBtn = e.target.closest('.cloze-inline-star, .cloze-point-btn.starred');
        const targetSentence = e.target.closest('.cloze-sentence');

        // 1. Tapped a blurred or revealed cloze blank -> instant toggle!
        if (targetWord) {
            e.preventDefault();
            e.stopPropagation();
            toggleSingleClozeWord(targetWord);
            hideClozeActionPill();
            return;
        }

        // 2. Tapped the inline bookmark star -> instant toggle bookmark!
        if (starBtn) {
            e.preventDefault();
            e.stopPropagation();
            const sid = starBtn.getAttribute('data-sid');
            if (sid) toggleNcertSentenceStar(sid);
            hideClozeActionPill();
            return;
        }

        // 3. Tapped sentence text -> quick micro-pill with options
        if (targetSentence) {
            const sid = targetSentence.getAttribute('data-sid');
            if (sid) {
                showClozeActionPill(sid, e.clientX, e.clientY);
            }
        } else {
            hideClozeActionPill();
        }
    });

    canvasWrap.addEventListener('pointercancel', () => {
        clozeTouchMoved = false;
        hideClozeActionPill();
    });

    // Dismiss floating pill on scroll
    canvasWrap.addEventListener('scroll', () => {
        hideClozeActionPill();
    }, { passive: true });
}

// Floating Action Pill
function showClozeActionPill(sentenceId, clientX, clientY) {
    activePillSentenceId = sentenceId;
    const pill = document.getElementById('clozeActionPill');
    if (!pill) return;

    const isStarred = clozeStarredSet.has(sentenceId);
    const starText = document.getElementById('pillStarText');
    const starIcon = document.getElementById('pillStarIcon');
    if (starText) starText.textContent = isStarred ? 'Remove Bookmark' : 'Bookmark Line';
    if (starIcon) starIcon.textContent = isStarred ? '★' : '⭐';

    pill.style.display = 'flex';
    const pillWidth = 240;
    const pillHeight = 44;
    let posX = clientX - (pillWidth / 2);
    let posY = clientY - pillHeight - 16;

    posX = Math.max(12, Math.min(window.innerWidth - pillWidth - 12, posX));
    posY = Math.max(60, posY);

    pill.style.left = `${posX}px`;
    pill.style.top = `${posY}px`;
}

function hideClozeActionPill() {
    activePillSentenceId = null;
    const pill = document.getElementById('clozeActionPill');
    if (pill) pill.style.display = 'none';
}

function onPillStarClick() {
    if (activePillSentenceId) {
        toggleNcertSentenceStar(activePillSentenceId);
    }
    hideClozeActionPill();
}

function onPillRevealClick() {
    if (activePillSentenceId) {
        revealSentenceBlanks(activePillSentenceId);
    }
    hideClozeActionPill();
}

function navNcertClozeChapter(delta) {
    if (!ncertClozeManifest || !currentClozeChapterId) return;
    const curIdx = ncertClozeManifest.findIndex(m => m.id === currentClozeChapterId);
    const newIdx = curIdx + delta;
    if (newIdx >= 0 && newIdx < ncertClozeManifest.length) {
        openNcertClozeReader(ncertClozeManifest[newIdx].id, true);
    }
}

function scrollClozeToTop() {
    const wrap = document.getElementById('clozeReaderCanvasWrap');
    if (wrap) wrap.scrollTo({ top: 0, behavior: 'smooth' });
}

// Bridge from Pretty NCERT to Cloze
async function jumpToClozeFromPretty() {
    if (!prettyNcertData || !currentPrettyCatId || typeof currentPrettyChapterIndex !== 'number') return;
    const cat = (prettyNcertData.categories || []).find(c => c.id === currentPrettyCatId);
    if (!cat || !cat.chapters || !cat.chapters[currentPrettyChapterIndex]) return;

    const prettyChap = cat.chapters[currentPrettyChapterIndex];
    const manifest = await loadNcertClozeManifest();

    // Match by chapter title or num
    let found = manifest.find(m => m.title.toLowerCase() === prettyChap.name.toLowerCase());
    if (!found) {
        found = manifest.find(m => m.chapter_no === prettyChap.num && m.class.includes(cat.class || '11'));
    }

    if (found) {
        openNcertClozeReader(found.id, true);
    } else {
        openNcertClozeHub(true);
    }
}

// Expose Cloze API on window
window.openNcertClozeHub = openNcertClozeHub;
window.filterClozeTab = filterClozeTab;
window.filterNcertClozeChapters = filterNcertClozeChapters;
window.openNcertClozeReader = openNcertClozeReader;
window.closeNcertClozeReader = closeNcertClozeReader;
window.setNcertClozeMode = setNcertClozeMode;
window.toggleNcertSavedFilter = toggleNcertSavedFilter;
window.toggleNcertRevealAll = toggleNcertRevealAll;
window.toggleNcertSentenceStar = toggleNcertSentenceStar;
window.revealSentenceBlanks = revealSentenceBlanks;
window.onPillStarClick = onPillStarClick;
window.onPillRevealClick = onPillRevealClick;
window.navNcertClozeChapter = navNcertClozeChapter;
window.scrollClozeToTop = scrollClozeToTop;
window.jumpToClozeFromPretty = jumpToClozeFromPretty;


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
        } else if (state.view === 'cloze-hub') {
            openNcertClozeHub(false);
        } else if (state.view === 'cloze-reader' && state.chapterId) {
            openNcertClozeReader(state.chapterId, false);
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
        const clozeReader = document.getElementById('ncertClozeReaderScreen');
        if (clozeReader && clozeReader.classList.contains('active')) {
            closeNcertClozeReader();
            return;
        }
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

