/* ============================================================
   QUIZZY — NOTES CAFE JAVASCRIPT
   Handles manifest loading, 2-column reader navigation with left sidebar,
   interactive PYQ check questions, and KaTeX typesetting.
   ============================================================ */

let notesManifest = null;
let currentNotesSubject = 'all';
let currentChapterData = null;
let currentModuleIndex = 0;

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

// Load manifest
async function loadNotesManifest() {
    try {
        const res = await fetch('data/notes-manifest.json');
        notesManifest = await res.json();
        renderSubjectTabs();
        renderChapterGrid();
        try {
            history.replaceState({ cafe: 'notes', notesScreen: 'home' }, '');
        } catch (e) { /* ignore */ }
    } catch (e) {
        console.error('Failed to load notes manifest:', e);
        const grid = document.getElementById('notesChapterGrid');
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 2rem; color: var(--error);">
                    ⚠️ Could not load notes manifest. Check that data/notes-manifest.json exists.
                </div>
            `;
        }
    }
}

// Render Subject Tabs
function renderSubjectTabs() {
    const tabsContainer = document.getElementById('notesSubjectTabs');
    if (!tabsContainer || !notesManifest) return;

    let html = `
        <button class="notes-tab-btn ${currentNotesSubject === 'all' ? 'active' : ''}" onclick="selectNotesSubject('all')">
            📚 All Subjects
        </button>
    `;

    notesManifest.subjects.forEach(subj => {
        const isActive = currentNotesSubject === subj.id;
        html += `
            <button class="notes-tab-btn ${isActive ? 'active' : ''}" onclick="selectNotesSubject('${subj.id}')">
                ${subj.icon || '📖'} ${escapeNotesHtml(subj.name)} (${subj.chapterCount})
            </button>
        `;
    });

    tabsContainer.innerHTML = html;
}

// Filter Subject
function selectNotesSubject(subjId) {
    currentNotesSubject = subjId;
    renderSubjectTabs();
    renderChapterGrid();
}

// Search Filter
function handleNotesSearch() {
    renderChapterGrid();
}

// Render Chapter Grid
function renderChapterGrid() {
    const grid = document.getElementById('notesChapterGrid');
    if (!grid || !notesManifest) return;

    const query = (document.getElementById('notesSearchInput')?.value || '').toLowerCase().trim();
    let allChapters = [];

    notesManifest.subjects.forEach(subj => {
        if (currentNotesSubject === 'all' || currentNotesSubject === subj.id) {
            subj.chapters.forEach(ch => {
                allChapters.push({
                    ...ch,
                    subjectName: subj.name,
                    subjectId: subj.id,
                    icon: subj.icon
                });
            });
        }
    });

    if (query) {
        allChapters = allChapters.filter(ch => 
            ch.name.toLowerCase().includes(query) || 
            ch.subjectName.toLowerCase().includes(query) ||
            (ch.modulesSummary && ch.modulesSummary.some(m => m.name.toLowerCase().includes(query)))
        );
    }

    if (allChapters.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem 1rem; color: var(--text-muted);">
                🔍 No revision notes found matching your search.
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

// Open Chapter in Reader
async function openNotesChapter(filePath) {
    try {
        const res = await fetch(filePath);
        currentChapterData = await res.json();
        currentModuleIndex = 0;

        document.getElementById('notesHomeScreen').style.display = 'none';
        const readerScreen = document.getElementById('notesReaderScreen');
        readerScreen.classList.add('active');
        window.scrollTo(0, 0);

        if (!isNotesHistoryNavigating) {
            try {
                history.pushState({ cafe: 'notes', notesScreen: 'reader', filePath: filePath }, '');
            } catch (err) { /* ignore */ }
        }

        renderSidebarToc();
        renderActiveModule();
    } catch (e) {
        console.error('Failed to load chapter notes:', e);
        alert('Could not open notes file.');
    }
}

// Close Reader & Return to Grid
function closeNotesReader() {
    if (window.history.length > 1 && history.state && history.state.cafe === 'notes' && history.state.notesScreen === 'reader') {
        window.history.back();
    } else {
        const readerScreen = document.getElementById('notesReaderScreen');
        if (readerScreen) readerScreen.classList.remove('active');
        const homeScreen = document.getElementById('notesHomeScreen');
        if (homeScreen) homeScreen.style.display = 'block';
        window.scrollTo(0, 0);
    }
}

// Toggle Mobile Table of Contents Drawer
function toggleNotesTocDrawer(force) {
    const drawerEl = document.getElementById('notesTocDrawer');
    const overlayEl = document.getElementById('notesTocOverlay');
    const isOpen = typeof force === 'boolean' ? force : !drawerEl.classList.contains('open');
    if (drawerEl) drawerEl.classList.toggle('open', isOpen);
    if (overlayEl) overlayEl.classList.toggle('open', isOpen);
}

// Render Left Sidebar Table of Contents (and Mobile Drawer)
function renderSidebarToc() {
    if (!currentChapterData) return;

    // Sidebar Header Meta
    const subjEl = document.getElementById('notesSidebarSubj');
    const chapEl = document.getElementById('notesSidebarChap');
    const metaEl = document.getElementById('notesSidebarMeta');
    const topBarTitle = document.getElementById('notesReaderBarTitle');

    const drawerSubjEl = document.getElementById('notesDrawerSubj');
    const drawerChapEl = document.getElementById('notesDrawerChap');
    const drawerMetaEl = document.getElementById('notesDrawerMeta');

    const subjText = currentChapterData.subject.toUpperCase();
    const chapText = currentChapterData.chapter;
    const metaText = `${currentChapterData.moduleCount} Subtopics · ${currentChapterData.durationMinutes} mins`;

    if (subjEl) subjEl.textContent = subjText;
    if (chapEl) chapEl.textContent = chapText;
    if (metaEl) metaEl.textContent = metaText;
    if (topBarTitle) topBarTitle.textContent = `${currentChapterData.subject} · ${currentChapterData.chapter}`;

    if (drawerSubjEl) drawerSubjEl.textContent = subjText;
    if (drawerChapEl) drawerChapEl.textContent = chapText;
    if (drawerMetaEl) drawerMetaEl.textContent = metaText;

    const itemsHtml = currentChapterData.modules.map((mod, idx) => {
        const isActive = idx === currentModuleIndex;
        return `
            <button class="notes-sidebar-item ${isActive ? 'active' : ''}" onclick="selectNotesModule(${idx})">
                <span class="notes-sidebar-num">${idx + 1}</span>
                <div class="notes-sidebar-text">
                    <div>${escapeNotesHtml(mod.name)}</div>
                    <div class="notes-sidebar-dur">⏱️ ${mod.durationMinutes} mins · ${mod.blockCount} blocks</div>
                </div>
            </button>
        `;
    }).join('');

    const nav = document.getElementById('notesSidebarNav');
    if (nav) nav.innerHTML = itemsHtml;

    const drawerNav = document.getElementById('notesDrawerNav');
    if (drawerNav) drawerNav.innerHTML = itemsHtml;
}

// Select Module from Sidebar
function selectNotesModule(idx) {
    if (!currentChapterData || idx < 0 || idx >= currentChapterData.modules.length) return;
    currentModuleIndex = idx;
    toggleNotesTocDrawer(false);
    renderSidebarToc();
    renderActiveModule();
    window.scrollTo({ top: 80, behavior: 'smooth' });
}

// Render Active Subtopic Module & its Blocks
function renderActiveModule() {
    if (!currentChapterData) return;
    const mod = currentChapterData.modules[currentModuleIndex];
    if (!mod) return;

    // Header Meta
    document.getElementById('notesDocBreadcrumb').textContent = `${currentChapterData.subject.toUpperCase()} · ${currentChapterData.chapter.toUpperCase()}`;
    document.getElementById('notesDocTitle').textContent = mod.name;
    document.getElementById('notesDocMeta').textContent = `${mod.blockCount} learning blocks · ${mod.durationMinutes} minutes. Text, diagrams, tables, and PYQs in original order.`;

    // Blocks
    const container = document.getElementById('notesBlocksContainer');
    container.innerHTML = mod.blocks.map(b => renderBlockCard(b)).join('');

    // Nav Footer Buttons
    const prevBtn = document.getElementById('notesPrevModBtn');
    const nextBtn = document.getElementById('notesNextModBtn');
    if (prevBtn) prevBtn.disabled = currentModuleIndex === 0;
    if (nextBtn) {
        const isLast = currentModuleIndex === currentChapterData.modules.length - 1;
        nextBtn.innerHTML = isLast ? 'Finish Chapter 🏁' : 'Next Subtopic →';
    }

    typesetNotesMath(container);
}

// Render Individual Block Card matching Screenshot design
function renderBlockCard(b) {
    const numStr = String(b.index).padStart(2, '0');
    const subtype = b.subtype || 'TEXT';
    const title = b.title || '';
    const tags = b.tags || [];

    let tagsHtml = tags.map(t => {
        const isPyq = String(t).toUpperCase().includes('PYQ');
        const formattedTag = String(t).replace(/_/g, ' ').toLowerCase();
        return `<span class="note-tag-badge ${isPyq ? 'pyq' : ''}">${escapeNotesHtml(formattedTag)}</span>`;
    }).join('');

    let bodyHtml = '';

    if (subtype === 'TEXT') {
        const lines = b.text.split('\n').map(l => l.trim()).filter(Boolean);
        let listItems = '';
        lines.forEach(l => {
            let cleanLine = l.replace(/^[•\-\*]\s*/, '');
            listItems += `<li>${safeNotesHtml(cleanLine)}</li>`;
        });
        bodyHtml = `<div class="note-block-body"><ul>${listItems}</ul></div>`;

    } else if (subtype === 'IMAGE' || subtype === 'MODEL_3D') {
        const is3D = subtype === 'MODEL_3D';
        const imgUrl = b.imageUrl || '';
        bodyHtml = `
            <div class="note-image-wrap">
                <div class="note-image-frame">
                    <img src="${escapeNotesHtml(imgUrl)}" class="note-image" alt="${escapeNotesHtml(title)}" loading="lazy"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="note-img-fallback" style="display:none;align-items:center;justify-content:center;flex-direction:column;gap:0.4rem;padding:2rem 1rem;background:var(--bg-secondary);border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.9rem;font-weight:600;">
                        <span>🖼️ Diagram illustration</span>
                        <span style="font-size:0.8rem;color:var(--text-muted);">${escapeNotesHtml(title || b.caption || 'Visual reference')}</span>
                    </div>
                </div>
                <div class="note-caption">${is3D ? '🧊 3D visual preview' : '📷 ' + escapeNotesHtml(b.caption || 'Diagram')}</div>
            </div>
        `;

    } else if (subtype === 'QUESTION') {
        const prompt = b.prompt || b.question || '';
        const options = b.options || [];
        const answer = (b.answer && b.answer.trim()) ? b.answer : 'Self-Practice Exercise (Solve and check with your notes)';
        const blockId = `qblk_${b.index}`;

        let optsHtml = '';
        if (options.length > 0) {
            optsHtml = `
                <div class="note-q-options">
                    ${options.map(opt => `<div class="note-q-opt" onclick="revealNoteAnswer('${blockId}')">${safeNotesHtml(opt)}</div>`).join('')}
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
                <strong>Answer &amp; Explanation:</strong>
                <div style="margin-top: 0.4rem;">${safeNotesHtml(answer)}</div>
            </div>
        `;

    } else if (subtype === 'TABLE') {
        const tables = b.tables || [];
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
    }

    return `
        <div class="note-block-card">
            <div class="note-block-header">
                <div class="note-block-num">${numStr}</div>
                <div class="note-block-title-wrap">
                    <div class="note-block-subtype">${subtype}</div>
                    ${title ? `<div class="note-block-title">${safeNotesHtml(title)}</div>` : ''}
                </div>
                ${tagsHtml ? `<div class="note-block-tags">${tagsHtml}</div>` : ''}
            </div>
            ${bodyHtml}
        </div>
    `;
}

// Reveal Answer in PYQ Check Block
function revealNoteAnswer(blockId) {
    const el = document.getElementById(blockId);
    if (el) el.classList.toggle('show');
}

// Next / Prev Subtopic Navigation
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

// Boot
let isNotesHistoryNavigating = false;

document.addEventListener('DOMContentLoaded', () => {
    loadNotesManifest();
});

// ==================== POPSTATE ROUTING (MOBILE BACK BUTTON) ====================
window.addEventListener('popstate', function (e) {
    // 1. If TOC drawer or mobile menu is open, close it and stay in reader
    if (typeof closeCurrentOverlay === 'function' && closeCurrentOverlay()) {
        const readerActive = document.getElementById('notesReaderScreen') && document.getElementById('notesReaderScreen').classList.contains('active');
        try {
            history.pushState({ cafe: 'notes', notesScreen: readerActive ? 'reader' : 'home' }, '');
        } catch (err) { /* ignore */ }
        return;
    }

    // 2. If reader was open and user pressed back -> return to home screen
    const readerScreen = document.getElementById('notesReaderScreen');
    if (readerScreen && readerScreen.classList.contains('active')) {
        isNotesHistoryNavigating = true;
        try {
            readerScreen.classList.remove('active');
            const homeScreen = document.getElementById('notesHomeScreen');
            if (homeScreen) homeScreen.style.display = 'block';
            window.scrollTo(0, 0);
        } finally {
            isNotesHistoryNavigating = false;
        }
        return;
    }
});
