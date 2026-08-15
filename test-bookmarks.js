/* ============================================================
   Quizzy — Test bookmarks
   Same folder model as the Question Cafe bookmarks (section ->
   subsection -> entries) but a separate store, so test questions
   never mix into the practice bookmarks.

   Loaded by BOTH test-cafe.html (the save panel) and
   test-bookmarks.html (the manager); each half no-ops when its
   markup is not on the page.
   ============================================================ */

const TEST_BOOKMARK_STORE = 'quizzy-test-bookmarks';
const TB_DIRECT = '__direct__';
const TB_REVIEW_KEY = 'quizzy-test-bookmark-review';

function tbEsc(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function getTestBookmarks() {
    try {
        const parsed = JSON.parse(localStorage.getItem(TEST_BOOKMARK_STORE) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function saveTestBookmarks(data) {
    localStorage.setItem(TEST_BOOKMARK_STORE, JSON.stringify(data));
}

/* Built from the question's ORIGIN (see srcTestId in test-engine.js), so the
   same question bookmarked from a custom test and from its own paper is one
   bookmark, not two. */
function testBookmarkKeyFor(q) {
    if (!q) return null;
    // Questions rebuilt from a snapshot already carry the key they were saved under.
    if (q.bookmarkKey) return q.bookmarkKey;
    const testId = q.srcTestId || 'unknown';
    const sec = q.srcSectionIndex === undefined ? 0 : q.srcSectionIndex;
    const idx = q.srcQIndex === undefined ? 0 : q.srcQIndex;
    return `${testId}__s${sec}__q${idx}`;
}

function isTestQuestionBookmarked(q) {
    const key = testBookmarkKeyFor(q);
    if (!key) return false;
    const store = getTestBookmarks();
    for (const section in store) {
        for (const sub in store[section]) {
            const list = store[section][sub];
            if (Array.isArray(list) && list.some(b => b && b.key === key)) return true;
        }
    }
    return false;
}

function findTestBookmarkLocation(key) {
    const store = getTestBookmarks();
    for (const section in store) {
        for (const sub in store[section]) {
            const list = store[section][sub];
            if (Array.isArray(list) && list.some(b => b && b.key === key)) {
                return { section, sub };
            }
        }
    }
    return null;
}

function removeTestBookmarkByKey(section, sub, key) {
    const store = getTestBookmarks();
    if (!store[section] || !Array.isArray(store[section][sub])) return false;
    store[section][sub] = store[section][sub].filter(b => !b || b.key !== key);
    if (store[section][sub].length === 0) delete store[section][sub];
    if (Object.keys(store[section]).length === 0) delete store[section];
    saveTestBookmarks(store);
    return true;
}

/* A snapshot, not a pointer: the manager and the bookmark review screen render
   straight from this without needing the source test file to still exist. */
function buildTestBookmarkSnapshot(q, testName) {
    return {
        key: testBookmarkKeyFor(q),
        testId: q.srcTestId || null,
        testName: q.srcTestName || testName || '',
        testFile: q.srcTestFile || null,
        sectionName: q.srcSectionName || q.sectionName || '',
        number: (q.srcQIndex === undefined ? 0 : q.srcQIndex) + 1,
        type: q.type || 'mcq',
        question: q.question || '',
        image_url: q.image_url || null,
        options: q.options || null,
        optionImages: q.optionImages || null,
        correct: q.correct === undefined ? null : q.correct,
        answer: q.answer === undefined ? null : q.answer,
        explanation: q.explanation || '',
        explanation_image: q.explanation_image || null,
        savedAt: new Date().toISOString()
    };
}

// ==================== SAVE PANEL (test-cafe.html) ====================
let tbPendingQuestion = null;   // question object awaiting a folder choice
let tbPendingTestName = '';
let tbOpenSection = null;
let tbChosenSub = null;

/* Folder names can hold quotes and apostrophes, so every handler works off an
   index into these lists rather than an interpolated name string. */
function tbSectionNames() {
    return Object.keys(getTestBookmarks());
}

function tbSubNames(section) {
    const store = getTestBookmarks();
    return Object.keys(store[section] || {}).filter(s => s !== TB_DIRECT);
}

function openTestBookmarkPanel(q, testName) {
    const panel = document.getElementById('tbPanel');
    if (!panel) return;

    const key = testBookmarkKeyFor(q);
    const existing = findTestBookmarkLocation(key);
    if (existing) {
        const where = existing.sub === TB_DIRECT ? existing.section : `${existing.section} / ${existing.sub}`;
        if (confirm(`Already bookmarked in "${where}".\n\nRemove it from that folder?`)) {
            removeTestBookmarkByKey(existing.section, existing.sub, key);
            if (typeof onTestBookmarkChanged === 'function') onTestBookmarkChanged();
        }
        return;
    }

    tbPendingQuestion = q;
    tbPendingTestName = testName || '';
    tbOpenSection = null;
    tbChosenSub = null;
    renderTestBookmarkPanel();
    panel.classList.add('active');
    const overlay = document.getElementById('tbOverlay');
    if (overlay) overlay.classList.add('active');
}

function closeTestBookmarkPanel() {
    const panel = document.getElementById('tbPanel');
    const overlay = document.getElementById('tbOverlay');
    if (panel) panel.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    tbPendingQuestion = null;
    tbOpenSection = null;
    tbChosenSub = null;
}

function renderTestBookmarkPanel() {
    const body = document.getElementById('tbPanelBody');
    if (!body) return;
    const sections = tbSectionNames();

    let html = '';
    if (sections.length === 0) {
        html += `<p class="tb-empty-note">No folders yet — create one below to start organising your test bookmarks.</p>`;
    }

    sections.forEach((section, si) => {
        const isOpen = tbOpenSection === si;
        const subs = tbSubNames(section);
        html += `
            <div class="tb-folder">
                <button type="button" class="tb-folder-head ${isOpen ? 'open' : ''}" onclick="tbToggleSection(${si})">
                    <span>📁 ${tbEsc(section)}</span>
                    <span class="tb-arrow">▶</span>
                </button>
                <div class="tb-folder-body ${isOpen ? 'show' : ''}">
                    <button type="button" class="tb-sub ${isOpen && tbChosenSub === TB_DIRECT ? 'selected' : ''}"
                            onclick="tbChooseSub(${si}, null)">💾 Save directly in this folder</button>
                    ${subs.map((sub, subi) => `
                        <button type="button" class="tb-sub ${isOpen && tbChosenSub === sub ? 'selected' : ''}"
                                onclick="tbChooseSub(${si}, ${subi})">📂 ${tbEsc(sub)}</button>
                    `).join('')}
                    ${isOpen ? `
                        <div class="tb-inline-add">
                            <input type="text" class="tb-input" id="tbNewSubInput" placeholder="New subfolder name…">
                            <button type="button" class="tb-mini-btn" onclick="tbCreateSub(${si})">+ Add</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    html += `
        <div class="tb-new-section">
            <input type="text" class="tb-input" id="tbNewSectionInput" placeholder="New folder name…">
            <button type="button" class="tb-mini-btn" onclick="tbCreateSection()">+ Create folder</button>
        </div>
    `;

    body.innerHTML = html;
}

function tbToggleSection(si) {
    tbOpenSection = tbOpenSection === si ? null : si;
    tbChosenSub = null;
    renderTestBookmarkPanel();
}

/* subi === null means "save straight into the section". */
function tbChooseSub(si, subi) {
    const sections = tbSectionNames();
    tbOpenSection = si;
    tbChosenSub = subi === null ? TB_DIRECT : tbSubNames(sections[si])[subi];
    renderTestBookmarkPanel();
}

function tbCreateSection() {
    const input = document.getElementById('tbNewSectionInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    const store = getTestBookmarks();
    if (!store[name]) store[name] = {};
    saveTestBookmarks(store);
    input.value = '';
    tbOpenSection = tbSectionNames().indexOf(name);
    tbChosenSub = null;
    renderTestBookmarkPanel();
}

function tbCreateSub(si) {
    const input = document.getElementById('tbNewSubInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    const section = tbSectionNames()[si];
    const store = getTestBookmarks();
    if (!store[section]) store[section] = {};
    if (!store[section][name]) store[section][name] = [];
    saveTestBookmarks(store);
    tbOpenSection = si;
    tbChosenSub = name;
    renderTestBookmarkPanel();
}

function saveTestBookmark() {
    if (!tbPendingQuestion) return;
    if (tbOpenSection === null || tbChosenSub === null) {
        alert('Pick a folder (or "Save directly in this folder") first.');
        return;
    }

    const section = tbSectionNames()[tbOpenSection];
    const sub = tbChosenSub;
    const store = getTestBookmarks();
    if (!store[section]) store[section] = {};
    if (!Array.isArray(store[section][sub])) store[section][sub] = [];

    const snapshot = buildTestBookmarkSnapshot(tbPendingQuestion, tbPendingTestName);
    if (!store[section][sub].some(b => b && b.key === snapshot.key)) {
        store[section][sub].push(snapshot);
        saveTestBookmarks(store);
    }

    closeTestBookmarkPanel();
    if (typeof onTestBookmarkChanged === 'function') onTestBookmarkChanged();
}

// ==================== MANAGER (test-bookmarks.html) ====================
function tbSortItems(items) {
    return [...items].sort((a, b) => {
        const ta = (a.testName || '').toLowerCase();
        const tb = (b.testName || '').toLowerCase();
        if (ta !== tb) return ta.localeCompare(tb);
        const sa = (a.sectionName || '').toLowerCase();
        const sb = (b.sectionName || '').toLowerCase();
        if (sa !== sb) return sa.localeCompare(sb);
        return (a.number || 0) - (b.number || 0);
    });
}

function renderTestBookmarkManager() {
    const container = document.getElementById('tbFolderTree');
    if (!container) return;

    const store = getTestBookmarks();
    const sections = Object.keys(store);

    if (sections.length === 0) {
        container.innerHTML = `
            <div class="tb-empty">
                <div class="tb-empty-icon">🧪</div>
                <h3>No test bookmarks yet</h3>
                <p>Open a test's <strong>Detailed Analysis</strong> and tap 🔖 on any question to save it here.</p>
                <a class="btn btn-primary" href="test-cafe.html" style="margin-top:1.25rem;">🧪 Go to Test Cafe</a>
            </div>
        `;
        return;
    }

    let html = '';
    sections.forEach((section, si) => {
        const subs = Object.keys(store[section]).filter(s => s !== TB_DIRECT);
        const direct = store[section][TB_DIRECT] || [];
        const total = direct.length + subs.reduce((n, s) => n + store[section][s].length, 0);

        const card = (item, sub) => `
            <div class="tb-card">
                <div class="tb-card-main">
                    <span class="tb-card-tag">${tbEsc(item.sectionName || 'Section')} · Q${item.number || 1}</span>
                    <span class="tb-card-text">${tbEsc(item.question || '(image question)')}</span>
                    <span class="tb-card-src">${tbEsc(item.testName || '')}</span>
                </div>
                <div class="tb-card-actions">
                    <button class="tb-icon-btn go" title="Review this question"
                            onclick="openTestBookmarkReview('${tbAttr(section)}','${tbAttr(sub)}','${tbAttr(item.key)}')">→</button>
                    <button class="tb-icon-btn del" title="Delete bookmark"
                            onclick="tbDeleteFromManager('${tbAttr(section)}','${tbAttr(sub)}','${tbAttr(item.key)}')">✕</button>
                </div>
            </div>
        `;

        html += `
            <div class="tb-section" id="tbSec-${si}">
                <button type="button" class="tb-section-head" onclick="tbToggleManagerSection(${si})">
                    <span class="tb-section-left">
                        <span class="tb-section-icon">📁</span>
                        <span class="tb-section-name">${tbEsc(section)}</span>
                        <span class="tb-section-count">${total} item${total !== 1 ? 's' : ''}</span>
                    </span>
                    <span class="tb-arrow">▶</span>
                </button>
                <div class="tb-section-body">
                    ${direct.length ? `<div class="tb-card-list">${tbSortItems(direct).map(i => card(i, TB_DIRECT)).join('')}</div>` : ''}
                    ${subs.map(sub => `
                        <div class="tb-subfolder">
                            <div class="tb-subfolder-head">📂 ${tbEsc(sub)} <span>(${store[section][sub].length})</span></div>
                            <div class="tb-card-list">${tbSortItems(store[section][sub]).map(i => card(i, sub)).join('')}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/* Escapes a value for use inside a single-quoted inline handler. */
function tbAttr(str) {
    return String(str === null || str === undefined ? '' : str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
        .replace(/\n/g, ' ');
}

function tbToggleManagerSection(si) {
    const el = document.getElementById(`tbSec-${si}`);
    if (el) el.classList.toggle('expanded');
}

function tbDeleteFromManager(section, sub, key) {
    if (!confirm('Delete this test bookmark?')) return;
    removeTestBookmarkByKey(section, sub, key);
    renderTestBookmarkManager();
}

/* Hands the whole folder to the Test Cafe, which renders it read-only in the
   same analysis layout, starting on the question that was clicked. */
function openTestBookmarkReview(section, sub, key) {
    const store = getTestBookmarks();
    const list = (store[section] && store[section][sub]) || [];
    if (list.length === 0) return;

    const items = tbSortItems(list);
    const startIndex = Math.max(0, items.findIndex(i => i.key === key));
    const label = sub === TB_DIRECT ? section : `${section} / ${sub}`;

    sessionStorage.setItem(TB_REVIEW_KEY, JSON.stringify({ items, startIndex, label }));
    window.location.href = 'test-cafe.html';
}

function exportTestBookmarks() {
    const blob = new Blob([JSON.stringify(getTestBookmarks(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quizzy-test-bookmarks.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importTestBookmarks() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            let incoming;
            try {
                incoming = JSON.parse(reader.result);
            } catch (e) {
                alert('That file is not valid JSON.');
                return;
            }
            if (!incoming || typeof incoming !== 'object') {
                alert('That does not look like a test bookmarks file.');
                return;
            }
            const target = getTestBookmarks();
            Object.keys(incoming).forEach(section => {
                if (!target[section]) target[section] = {};
                Object.keys(incoming[section] || {}).forEach(sub => {
                    if (!Array.isArray(target[section][sub])) target[section][sub] = [];
                    const seen = new Set(target[section][sub].map(b => b && b.key));
                    (incoming[section][sub] || []).forEach(item => {
                        if (item && !seen.has(item.key)) {
                            target[section][sub].push(item);
                            seen.add(item.key);
                        }
                    });
                });
            });
            saveTestBookmarks(target);
            renderTestBookmarkManager();
            alert('Test bookmarks imported.');
        };
        reader.readAsText(file);
    };
    input.click();
}

function clearAllTestBookmarks() {
    if (!confirm('Delete ALL test bookmarks? This cannot be undone.')) return;
    localStorage.removeItem(TEST_BOOKMARK_STORE);
    renderTestBookmarkManager();
}
