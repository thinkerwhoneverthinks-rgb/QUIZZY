/* ============================================================
   Quizzy — shared app shell
   Theme + hamburger menu logic used by EVERY page.
   Load this in <head> (before <body>) so the theme is applied
   before first paint and there is no light/dark flash.
   ============================================================ */

var QUIZZY_THEME_KEY = 'studycafe-theme';

/* ---- 1. Apply saved theme immediately (runs during head parse) ---- */
(function applySavedThemeNow() {
    var saved = null;
    try { saved = localStorage.getItem(QUIZZY_THEME_KEY); } catch (e) { /* private mode */ }
    if (saved !== 'light' && saved !== 'dark') {
        saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', saved);
})();

function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function updateToggleIcon(theme) {
    var icon = document.getElementById('themeIcon');
    var text = document.getElementById('themeText');
    var sw = document.getElementById('themeSwitch');
    if (icon) icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    if (text) text.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
    if (sw) sw.classList.toggle('on', theme === 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1e2028' : '#f2f1ee');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(QUIZZY_THEME_KEY, theme); } catch (e) { /* ignore */ }
    updateToggleIcon(theme);
}

function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/* ---- 2. Slide-out menu ---- */
function setMenuOpen(open) {
    var toggle = document.getElementById('menuToggle');
    var menu = document.getElementById('mobileMenu');
    var overlay = document.getElementById('overlay');
    if (!menu) return;
    if (toggle) toggle.classList.toggle('active', open);
    menu.classList.toggle('active', open);
    if (overlay) overlay.classList.toggle('active', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleMenu() {
    var menu = document.getElementById('mobileMenu');
    setMenuOpen(!(menu && menu.classList.contains('active')));
}

function closeMenu() { setMenuOpen(false); }

/* ---- 3. Wire up once the DOM exists ---- */
document.addEventListener('DOMContentLoaded', function () {
    updateToggleIcon(getTheme());

    // Highlight the link for the page we are on.
    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.mobile-menu a[href]').forEach(function (a) {
        var target = (a.getAttribute('href') || '').split('/').pop().split('#')[0].toLowerCase();
        if (target && target === here) a.classList.add('current');
    });

    // Admin-only links stay hidden until the manifest editor has been unlocked.
    if (!isAdminUnlocked()) {
        document.querySelectorAll('[data-admin-only]').forEach(function (el) { el.remove(); });
    }

    // Auto-inject Search Question into hamburger menu if not present
    var menu = document.getElementById('mobileMenu');
    if (menu && !document.getElementById('menuSearchQuestion')) {
        var firstSection = menu.querySelector('.menu-section');
        var searchLink = document.createElement('a');
        searchLink.id = 'menuSearchQuestion';
        searchLink.href = '#';
        searchLink.innerHTML = '<span class="mi-ico">🔍</span> Search Question';
        searchLink.onclick = function (e) {
            e.preventDefault();
            openQuestionSearch();
            return false;
        };
        if (firstSection && firstSection.nextSibling) {
            menu.insertBefore(searchLink, firstSection.nextSibling);
        } else {
            menu.appendChild(searchLink);
        }
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeCurrentOverlay(); }
});

/* ---- Universal Modal / Overlay Detector & Closer for Mobile Back Navigation ---- */
function hasOpenOverlay() {
    var qSearch = document.getElementById('questionSearchModal');
    if (qSearch && qSearch.classList.contains('active')) return 'questionSearch';

    var vidModal = document.getElementById('videoPlayerModal');
    if (vidModal && vidModal.classList.contains('active')) return 'videoModal';

    var menu = document.getElementById('mobileMenu');
    if (menu && menu.classList.contains('active')) return 'menu';

    var data = document.getElementById('dataPanel');
    if (data && data.classList.contains('active')) return 'dataPanel';

    var syl = document.getElementById('syllabusPanel');
    if (syl && syl.classList.contains('active')) return 'syllabus';

    var gridPanel = document.getElementById('gridPanel');
    if (gridPanel && gridPanel.classList.contains('active')) return 'quizGrid';

    var solModal = document.getElementById('solutionModal');
    if (solModal && (solModal.classList.contains('active') || solModal.style.display === 'flex' || solModal.style.display === 'block')) return 'quizSolution';

    var customModal = document.getElementById('customTestModal');
    if (customModal && customModal.classList.contains('active')) return 'customTestModal';

    var tcSide = document.getElementById('trSide');
    if (tcSide && tcSide.classList.contains('open')) return 'tcGrid';

    var tcModal = document.getElementById('tcModal');
    if (tcModal && tcModal.classList.contains('active')) return 'tcSubmitModal';

    var tbPanel = document.getElementById('tbPanel');
    if (tbPanel && tbPanel.classList.contains('active')) return 'tcBookmarkPanel';

    var notesToc = document.getElementById('notesTocDrawer');
    if (notesToc && notesToc.classList.contains('open')) return 'notesToc';

    return null;
}

function closeCurrentOverlay() {
    var overlay = hasOpenOverlay();
    if (!overlay) return false;
    switch (overlay) {
        case 'questionSearch': closeQuestionSearch(); break;
        case 'videoModal': if (typeof closeVideoModal === 'function') closeVideoModal(); break;
        case 'menu': closeMenu(); break;
        case 'dataPanel': closeDataPanel(); break;
        case 'syllabus': closeSyllabusModal(); break;
        case 'quizGrid': if (typeof closeGrid === 'function') closeGrid(); break;
        case 'quizSolution': if (typeof closeSolutionModal === 'function') closeSolutionModal(); break;
        case 'customTestModal': if (typeof closeCustomTestModal === 'function') closeCustomTestModal(); break;
        case 'tcGrid': if (typeof closeMobileGrid === 'function') closeMobileGrid(); break;
        case 'tcSubmitModal': if (typeof closeSubmitModal === 'function') closeSubmitModal(); break;
        case 'tcBookmarkPanel': if (typeof closeTestBookmarkPanel === 'function') closeTestBookmarkPanel(); break;
        case 'notesToc': if (typeof toggleNotesTocDrawer === 'function') toggleNotesTocDrawer(false); break;
    }
    return true;
}

/* Follow the OS only while the user has not made an explicit choice. */
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        var stored = null;
        try { stored = localStorage.getItem(QUIZZY_THEME_KEY); } catch (err) { /* ignore */ }
        if (stored !== 'light' && stored !== 'dark') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            updateToggleIcon(getTheme());
        }
    });
}

/* ---- 4. Admin gate (manifest editor) ----
   This is a soft lock: it keeps the tool off the public menus and behind a
   passcode. It is NOT real security — anyone can read this file. The editor
   only builds JSON in the browser, so nothing on the server is exposed. */
var QUIZZY_ADMIN_KEY = 'quizzy-admin';
/* Change this to your own passcode before deploying. */
var QUIZZY_ADMIN_PASSCODE = 'quizzy-admin-2026';

function isAdminUnlocked() {
    try { return localStorage.getItem(QUIZZY_ADMIN_KEY) === QUIZZY_ADMIN_PASSCODE; }
    catch (e) { return false; }
}

function unlockAdmin(code) {
    if (code !== QUIZZY_ADMIN_PASSCODE) return false;
    try { localStorage.setItem(QUIZZY_ADMIN_KEY, QUIZZY_ADMIN_PASSCODE); } catch (e) { /* ignore */ }
    return true;
}

function lockAdmin() {
    try { localStorage.removeItem(QUIZZY_ADMIN_KEY); } catch (e) { /* ignore */ }
}

/* ============================================================
   5. Backup & Restore
   Exports the user's own data — bookmarks, study history, theme —
   as a single JSON file they can carry to another device. Question
   content and downloaded images are NOT included: those live in
   IndexedDB and can be re-downloaded, and copying them would bloat
   the file with material that is not the user's.
   ============================================================ */
var QUIZZY_BACKUP_TYPE = 'quizzy-backup';
var QUIZZY_BACKUP_VERSION = 1;

/* localStorage keys that make up "the user's data". */
var QUIZZY_DATA_KEYS = {
    bookmarks: 'studycafe-bookmarks',
    testBookmarks: 'quizzy-test-bookmarks',
    testAttempts: 'quizzy-test-attempts',
    testInProgress: 'quizzy-test-inprogress',
    history: 'quizzy-history',
    theme: QUIZZY_THEME_KEY
};

function readJSON(key, fallback) {
    try {
        var raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function buildBackup() {
    return {
        app: 'quizzy',
        type: QUIZZY_BACKUP_TYPE,
        version: QUIZZY_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
            bookmarks: readJSON(QUIZZY_DATA_KEYS.bookmarks, {}),
            testBookmarks: readJSON(QUIZZY_DATA_KEYS.testBookmarks, {}),
            testAttempts: readJSON(QUIZZY_DATA_KEYS.testAttempts, []),
            testInProgress: readJSON(QUIZZY_DATA_KEYS.testInProgress, null),
            history: readJSON(QUIZZY_DATA_KEYS.history, []),
            theme: (function () {
                try { return localStorage.getItem(QUIZZY_DATA_KEYS.theme); } catch (e) { return null; }
            })()
        }
    };
}

/* Both bookmark stores share the section -> subsection -> [entries] shape. */
function tallyBookmarkStore(store, tally) {
    Object.keys(store || {}).forEach(function (section) {
        Object.keys(store[section] || {}).forEach(function (sub) {
            tally.folders++;
            if (Array.isArray(store[section][sub])) tally.marks += store[section][sub].length;
        });
    });
    return tally;
}

function countBackup(backup) {
    var d = (backup && backup.data) || {};
    var q = tallyBookmarkStore(d.bookmarks, { marks: 0, folders: 0 });
    var t = tallyBookmarkStore(d.testBookmarks, { marks: 0, folders: 0 });
    var attempts = Array.isArray(d.testAttempts) ? d.testAttempts : [];
    var papers = {};
    attempts.forEach(function (a) { if (a && a.testKey) papers[a.testKey] = true; });

    return {
        bookmarks: q.marks + t.marks,
        questionBookmarks: q.marks,
        testBookmarks: t.marks,
        folders: q.folders + t.folders,
        attempts: attempts.length,
        papers: Object.keys(papers).length,
        history: Array.isArray(d.history) ? d.history.length : 0
    };
}

function exportQuizzyData() {
    var backup = buildBackup();
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().slice(0, 10);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'quizzy-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    var c = countBackup(backup);
    setDataStatus('ok', 'Exported ' + c.bookmarks + ' bookmark(s), ' + c.attempts +
        ' test attempt(s) and ' + c.history + ' session(s).');
}

/* Writes one bookmark store back to localStorage, keeping local entries
   (unless mode is 'replace') and skipping incoming ones already held. */
function mergeBookmarkStore(storageKey, incoming, mode) {
    var target = mode === 'replace' ? {} : readJSON(storageKey, {});
    if (!target || typeof target !== 'object') target = {};
    incoming = incoming || {};

    Object.keys(incoming).forEach(function (section) {
        if (!target[section]) target[section] = {};
        Object.keys(incoming[section] || {}).forEach(function (sub) {
            if (!Array.isArray(target[section][sub])) target[section][sub] = [];
            var seen = {};
            target[section][sub].forEach(function (b) {
                var k = typeof b === 'string' ? b : (b && b.key);
                if (k) seen[k] = true;
            });
            (incoming[section][sub] || []).forEach(function (b) {
                var k = typeof b === 'string' ? b : (b && b.key);
                if (!k || !seen[k]) {
                    target[section][sub].push(b);
                    if (k) seen[k] = true;
                }
            });
        });
    });

    localStorage.setItem(storageKey, JSON.stringify(target));
    return target;
}

/* Merge keeps what is already on this device and adds anything new.
   Replace wipes local data first. */
function applyBackup(backup, mode) {
    var d = backup.data || {};

    // --- both bookmark stores: section -> subsection -> [entries], de-duped by key
    var target = mergeBookmarkStore(QUIZZY_DATA_KEYS.bookmarks, d.bookmarks, mode);
    mergeBookmarkStore(QUIZZY_DATA_KEYS.testBookmarks, d.testBookmarks, mode);

    // --- test attempts: de-duped by attempt id, newest first
    var attempts = mode === 'replace' ? [] : readJSON(QUIZZY_DATA_KEYS.testAttempts, []);
    if (!Array.isArray(attempts)) attempts = [];
    var seenAttempts = {};
    attempts.forEach(function (a) { if (a && a.id) seenAttempts[a.id] = true; });
    (Array.isArray(d.testAttempts) ? d.testAttempts : []).forEach(function (a) {
        if (a && a.id && !seenAttempts[a.id]) {
            attempts.push(a);
            seenAttempts[a.id] = true;
        }
    });
    attempts.sort(function (a, b) { return (b.endedAt || 0) - (a.endedAt || 0); });
    localStorage.setItem(QUIZZY_DATA_KEYS.testAttempts, JSON.stringify(attempts.slice(0, 400)));

    /* An unfinished test only restores when this device has none of its own —
       overwriting a live attempt with a stale one would lose real work. */
    if (d.testInProgress && (mode === 'replace' || !localStorage.getItem(QUIZZY_DATA_KEYS.testInProgress))) {
        localStorage.setItem(QUIZZY_DATA_KEYS.testInProgress, JSON.stringify(d.testInProgress));
    }

    // --- history: newest wins per session id, most recent first
    var hist = mode === 'replace' ? [] : readJSON(QUIZZY_DATA_KEYS.history, []);
    if (!Array.isArray(hist)) hist = [];
    (Array.isArray(d.history) ? d.history : []).forEach(function (entry) {
        if (!entry || !entry.id) return;
        var at = -1;
        for (var i = 0; i < hist.length; i++) {
            if (hist[i] && hist[i].id === entry.id) { at = i; break; }
        }
        if (at === -1) hist.push(entry);
        else if ((entry.updatedAt || 0) > (hist[at].updatedAt || 0)) hist[at] = entry;
    });
    hist.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    localStorage.setItem(QUIZZY_DATA_KEYS.history, JSON.stringify(hist.slice(0, 40)));

    if (d.theme === 'light' || d.theme === 'dark') applyTheme(d.theme);

    return { bookmarks: target, history: hist };
}

function importQuizzyFile(file, mode) {
    var reader = new FileReader();
    reader.onload = function () {
        var backup;
        try {
            backup = JSON.parse(reader.result);
        } catch (e) {
            setDataStatus('err', 'That file is not valid JSON.');
            return;
        }
        if (!backup || backup.type !== QUIZZY_BACKUP_TYPE) {
            setDataStatus('err', 'That is not a Quizzy backup file.');
            return;
        }
        if (mode === 'replace' &&
            !confirm('Replace all bookmarks and history on this device with the backup? This cannot be undone.')) {
            return;
        }
        try {
            applyBackup(backup, mode);
        } catch (e) {
            setDataStatus('err', 'Import failed: ' + e.message);
            return;
        }
        var c = countBackup(backup);
        setDataStatus('ok', (mode === 'replace' ? 'Restored ' : 'Merged in ') +
            c.bookmarks + ' bookmark(s), ' + c.attempts + ' test attempt(s) and ' +
            c.history + ' session(s). Reloading…');
        setTimeout(function () { location.reload(); }, 1200);
    };
    reader.onerror = function () { setDataStatus('err', 'Could not read that file.'); };
    reader.readAsText(file);
}

function setDataStatus(kind, msg) {
    var el = document.getElementById('dataStatus');
    if (!el) return;
    el.className = 'data-status ' + (kind || '');
    el.textContent = msg || '';
}

// ---- panel ----
function openDataPanel() {
    closeMenu();
    buildDataPanel();
    var p = document.getElementById('dataPanel');
    var o = document.getElementById('dataOverlay');
    if (p) p.classList.add('active');
    if (o) o.classList.add('active');
}

function closeDataPanel() {
    var p = document.getElementById('dataPanel');
    var o = document.getElementById('dataOverlay');
    if (p) p.classList.remove('active');
    if (o) o.classList.remove('active');
}

/* Injected once, so every page gets the panel without repeating markup. */
function buildDataPanel() {
    if (document.getElementById('dataPanel')) {
        var c = countBackup(buildBackup());
        var s = document.getElementById('dataSummary');
        if (s) {
            s.innerHTML = '<strong>' + c.questionBookmarks + '</strong> question bookmark' + (c.questionBookmarks === 1 ? '' : 's') +
                ' · <strong>' + c.testBookmarks + '</strong> test bookmark' + (c.testBookmarks === 1 ? '' : 's') +
                ' in <strong>' + c.folders + '</strong> folder' + (c.folders === 1 ? '' : 's') +
                '<br><strong>' + c.attempts + '</strong> test attempt' + (c.attempts === 1 ? '' : 's') +
                ' across <strong>' + c.papers + '</strong> test' + (c.papers === 1 ? '' : 's') +
                ' · <strong>' + c.history + '</strong> study session' + (c.history === 1 ? '' : 's');
        }
        setDataStatus('', '');
        return;
    }

    var overlay = document.createElement('div');
    overlay.className = 'data-overlay';
    overlay.id = 'dataOverlay';
    overlay.onclick = closeDataPanel;

    var panel = document.createElement('div');
    panel.className = 'data-panel';
    panel.id = 'dataPanel';
    panel.innerHTML =
        '<div class="data-panel-header">' +
            '<h3>💾 Backup &amp; Restore</h3>' +
            '<button class="menu-close" onclick="closeDataPanel()" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="data-panel-body">' +
            '<div class="data-summary" id="dataSummary"></div>' +
            '<div class="data-block">' +
                '<h4>⬆️ Export</h4>' +
                '<p>Save your bookmarks, every test attempt with its analysis, any unfinished test, your study history and your theme to one JSON file. Downloaded question packs are not included — you can re-download those on the new device.</p>' +
                '<button class="btn btn-primary" onclick="exportQuizzyData()">Download my data</button>' +
            '</div>' +
            '<div class="data-block">' +
                '<h4>⬇️ Import</h4>' +
                '<p>Restore from a Quizzy backup file. <strong>Merge</strong> keeps what is already here and adds anything new. <strong>Replace</strong> wipes this device first.</p>' +
                '<input type="file" id="dataImportInput" accept="application/json,.json" style="display:none">' +
                '<div class="data-import-actions">' +
                    '<button class="btn btn-primary" onclick="pickImport(\'merge\')">Merge</button>' +
                    '<button class="btn btn-ghost" onclick="pickImport(\'replace\')">Replace</button>' +
                '</div>' +
            '</div>' +
            '<div class="data-status" id="dataStatus"></div>' +
        '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    var input = document.getElementById('dataImportInput');
    input.addEventListener('change', function () {
        if (this.files && this.files[0]) importQuizzyFile(this.files[0], this._mode || 'merge');
        this.value = '';
    });

    buildDataPanel(); // fill in the summary now that the nodes exist
}

function pickImport(mode) {
    var input = document.getElementById('dataImportInput');
    if (!input) return;
    input._mode = mode;
    input.click();
}

/* ---- 5. Universal Syllabus Modal & Handler ---- */
function openSyllabus(syllabusData, contextTitle) {
    if (!syllabusData) return;
    if (typeof syllabusData === 'string') {
        var str = syllabusData.trim();
        if (str.startsWith('http://') || str.startsWith('https://') || str.endsWith('.pdf')) {
            syllabusData = { enabled: true, type: 'pdf', content: str, title: contextTitle || 'Syllabus' };
        } else {
            syllabusData = { enabled: true, type: 'text', content: str, title: contextTitle || 'Syllabus' };
        }
    }

    if (syllabusData.enabled === false) return;

    var type = syllabusData.type || 'text';
    var content = (syllabusData.content || '').trim();
    var title = syllabusData.title || contextTitle || 'Syllabus';

    if (!content) {
        alert('No syllabus details available.');
        return;
    }

    if (type === 'pdf') {
        try {
            var url = new URL(content, window.location.href);
            window.open(url.href, '_blank', 'noopener,noreferrer');
        } catch (e) {
            if (content.startsWith('http://') || content.startsWith('https://') || content.startsWith('/') || content.startsWith('data/')) {
                window.open(content, '_blank', 'noopener,noreferrer');
            } else {
                alert('Invalid syllabus link URL: ' + content);
            }
        }
        return;
    }

    // Text type - display in modal
    buildSyllabusModal();
    var modalTitle = document.getElementById('syllabusModalTitle');
    var modalBody = document.getElementById('syllabusModalBody');
    var overlay = document.getElementById('syllabusOverlay');
    var panel = document.getElementById('syllabusPanel');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = content;

    if (overlay) overlay.classList.add('active');
    if (panel) panel.classList.add('active');
}

function closeSyllabusModal() {
    var overlay = document.getElementById('syllabusOverlay');
    var panel = document.getElementById('syllabusPanel');
    if (overlay) overlay.classList.remove('active');
    if (panel) panel.classList.remove('active');
}

function copySyllabusText() {
    var modalBody = document.getElementById('syllabusModalBody');
    if (!modalBody) return;
    var text = modalBody.textContent || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            var btn = document.getElementById('syllabusCopyBtn');
            if (btn) {
                var orig = btn.textContent;
                btn.textContent = '✓ Copied!';
                setTimeout(function() { btn.textContent = orig; }, 2000);
            }
        }).catch(function() {
            alert('Copied to clipboard');
        });
    } else {
        alert('Syllabus copied');
    }
}

function buildSyllabusModal() {
    if (document.getElementById('syllabusPanel')) return;

    var overlay = document.createElement('div');
    overlay.className = 'syllabus-overlay';
    overlay.id = 'syllabusOverlay';
    overlay.onclick = function(e) {
        if (e.target === overlay) closeSyllabusModal();
    };

    var panel = document.createElement('div');
    panel.className = 'syllabus-panel';
    panel.id = 'syllabusPanel';
    panel.innerHTML =
        '<div class="syllabus-header">' +
            '<h3>📖 <span id="syllabusModalTitle">Syllabus</span></h3>' +
            '<button class="menu-close" onclick="closeSyllabusModal()" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="syllabus-body" id="syllabusModalBody"></div>' +
        '<div class="syllabus-footer">' +
            '<button class="btn btn-ghost btn-sm" id="syllabusCopyBtn" onclick="copySyllabusText()">📋 Copy Text</button>' +
            '<button class="btn btn-primary btn-sm" onclick="closeSyllabusModal()">Close</button>' +
        '</div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

/* ============================================================
   Question Search with Match Percentage
   ============================================================ */

function stripHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\\text\{([^}]*)\}/g, '$1')
        .replace(/\\[a-zA-Z]+/g, ' ')
        .replace(/[\$\{\}\(\)\[\]\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanTextForMatching(str) {
    if (!str) return '';
    return String(str)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&[a-z0-9#]+;/gi, ' ')
        .replace(/\\text\{([^}]*)\}/g, '$1')
        .replace(/\\[a-zA-Z]+/g, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
}

function getActiveQuestionsForSearch() {
    // 1. Question Cafe (quiz-core.js questions)
    if (typeof questions !== 'undefined' && Array.isArray(questions) && questions.length > 0) {
        var title = (typeof currentChapter !== 'undefined' && currentChapter && currentChapter.name) ||
                    (typeof currentFileName !== 'undefined' && currentFileName ? currentFileName.replace('.json', '').replace(/[-_]/g, ' ') : null) ||
                    'Active Topic';
        return {
            source: 'question-cafe',
            title: title,
            list: questions
        };
    }
    // 2. Test Cafe (test-ui.js TS.flat)
    if (typeof TS !== 'undefined' && TS && Array.isArray(TS.flat) && TS.flat.length > 0) {
        return {
            source: 'test-cafe',
            title: TS.title || 'Active Test',
            list: TS.flat
        };
    }
    return null;
}

function ensureQuestionSearchModal() {
    var modal = document.getElementById('questionSearchModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'questionSearchModal';
        modal.className = 'qsearch-modal-overlay';
        modal.innerHTML =
            '<div class="qsearch-modal-dialog">' +
                '<div class="qsearch-header">' +
                    '<div class="qsearch-input-wrap">' +
                        '<span class="qsearch-icon">🔍</span>' +
                        '<input type="text" id="qSearchInput" class="qsearch-input" placeholder="Search questions (e.g. keywords, formula, phrase)..." autocomplete="off" spellcheck="false">' +
                        '<button type="button" class="qsearch-clear-btn" id="qSearchClearBtn" onclick="clearQSearch()" title="Clear">✕</button>' +
                    '</div>' +
                    '<button class="qsearch-close-btn" onclick="closeQuestionSearch()">Close</button>' +
                '</div>' +
                '<div class="qsearch-context-bar" id="qSearchContextBar"></div>' +
                '<div class="qsearch-results-list" id="qSearchResultsList"></div>' +
            '</div>';
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeQuestionSearch();
        });
        document.body.appendChild(modal);

        var input = modal.querySelector('#qSearchInput');
        if (input) {
            var debounceTimer = null;
            input.addEventListener('input', function() {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(function() {
                    performQuestionSearch(input.value);
                }, 120);
            });
        }
    }
    return modal;
}

function openQuestionSearch() {
    closeMenu();
    var modal = ensureQuestionSearchModal();
    modal.classList.add('active');
    document.body.classList.add('qsearch-open');

    var input = document.getElementById('qSearchInput');
    var ctxBar = document.getElementById('qSearchContextBar');
    var resList = document.getElementById('qSearchResultsList');
    var activeData = getActiveQuestionsForSearch();

    if (activeData) {
        if (ctxBar) {
            ctxBar.innerHTML = '<span class="qsearch-pill">📚 <strong>' + (typeof escapeHtml === 'function' ? escapeHtml(activeData.title) : activeData.title) + '</strong> (' + activeData.list.length + ' Questions)</span>';
        }
        if (input && !input.value.trim() && resList) {
            resList.innerHTML = '<div class="qsearch-prompt-state">Type any keyword or sentence from a question above. Matched questions will appear with percentage scores.</div>';
        }
    } else {
        if (ctxBar) {
            ctxBar.innerHTML = '<span class="qsearch-pill empty">⚠️ No Active Quiz Open</span>';
        }
        if (resList) {
            resList.innerHTML =
                '<div class="qsearch-empty-state">' +
                    '<div class="qsearch-empty-icon">☕</div>' +
                    '<div class="qsearch-empty-title">No Active Questions Loaded</div>' +
                    '<p>Open a chapter in <a href="question-cafe.html" class="qsearch-link">Question Cafe</a> or start a test in <a href="test-cafe.html" class="qsearch-link">Test Cafe</a> to search questions.</p>' +
                '</div>';
        }
    }

    if (input) {
        setTimeout(function() {
            input.focus();
            if (input.value.trim()) performQuestionSearch(input.value);
        }, 80);
    }
}

function closeQuestionSearch() {
    var modal = document.getElementById('questionSearchModal');
    if (modal) modal.classList.remove('active');
    document.body.classList.remove('qsearch-open');
}

function clearQSearch() {
    var input = document.getElementById('qSearchInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    var resList = document.getElementById('qSearchResultsList');
    if (resList) {
        resList.innerHTML = '<div class="qsearch-prompt-state">Type any keyword or sentence from a question above.</div>';
    }
}

function performQuestionSearch(rawQuery) {
    var resList = document.getElementById('qSearchResultsList');
    if (!resList) return;

    var qClean = cleanTextForMatching(rawQuery);
    if (!qClean || qClean.length < 2) {
        resList.innerHTML = '<div class="qsearch-prompt-state">Type at least 2 characters to search...</div>';
        return;
    }

    var activeData = getActiveQuestionsForSearch();
    if (!activeData || !activeData.list || activeData.list.length === 0) {
        resList.innerHTML = '<div class="qsearch-empty-state"><p>No active questions available to search.</p></div>';
        return;
    }

    var queryTokens = qClean.split(/\s+/).filter(function(t) { return t.length > 1; });
    var stopWords = new Set(['is', 'are', 'was', 'were', 'the', 'a', 'an', 'in', 'on', 'at', 'of', 'for', 'to', 'by', 'with', 'from', 'as', 'that', 'this', 'and', 'or', 'which']);
    var significantTokens = queryTokens.filter(function(t) { return !stopWords.has(t); });
    var tokensToSearch = significantTokens.length > 0 ? significantTokens : queryTokens;

    var results = [];

    activeData.list.forEach(function(q, idx) {
        var qRawText = (q.question || q.questionText || '') + ' ' + (q.translations && q.translations.hi && q.translations.hi.question ? q.translations.hi.question : '');
        var optText = Array.isArray(q.options) ? q.options.join(' ') : '';
        var combinedRaw = qRawText + ' ' + optText;
        var normalizedTarget = cleanTextForMatching(combinedRaw);

        if (!normalizedTarget) return;

        var score = 0;

        // 1. Exact phrase match in question text
        if (normalizedTarget.indexOf(qClean) !== -1) {
            var lengthRatio = Math.min(1, qClean.length / Math.max(qClean.length, normalizedTarget.length));
            score = Math.round(92 + (lengthRatio * 8)); // 92% to 100%
        } else {
            // 2. Token overlap matching
            var matchedCount = 0;
            var partialBonus = 0;

            tokensToSearch.forEach(function(t) {
                if (normalizedTarget.indexOf(t) !== -1) {
                    matchedCount++;
                } else if (t.length > 4) {
                    var stem = t.substring(0, t.length - 2);
                    if (normalizedTarget.indexOf(stem) !== -1) {
                        matchedCount += 0.8;
                        partialBonus += 2;
                    }
                }
            });

            if (matchedCount > 0) {
                var tokenRatio = matchedCount / tokensToSearch.length;
                var base = tokenRatio * 80;

                // 3. Proximity / subsequence bonus if words appear close to each other
                if (queryTokens.length >= 2) {
                    var firstIdx = normalizedTarget.indexOf(tokensToSearch[0]);
                    var lastIdx = normalizedTarget.indexOf(tokensToSearch[tokensToSearch.length - 1]);
                    if (firstIdx !== -1 && lastIdx !== -1 && lastIdx > firstIdx && (lastIdx - firstIdx) < (qClean.length * 3)) {
                        base += 12;
                    }
                }

                score = Math.min(94, Math.round(base + partialBonus));
            }

            // 4. Consecutive subphrase matching (e.g. for "stretched by the application of a force")
            if (queryTokens.length >= 3) {
                var longestSubphraseLen = 0;
                for (var i = 0; i < queryTokens.length; i++) {
                    for (var j = i + 2; j <= queryTokens.length; j++) {
                        var subphrase = queryTokens.slice(i, j).join(' ');
                        if (normalizedTarget.indexOf(subphrase) !== -1) {
                            if ((j - i) > longestSubphraseLen) {
                                longestSubphraseLen = (j - i);
                            }
                        }
                    }
                }
                if (longestSubphraseLen >= 3) {
                    var phraseRatio = longestSubphraseLen / queryTokens.length;
                    var phraseScore = Math.round(75 + (phraseRatio * 23)); // 75% to 98%
                    if (phraseScore > score) score = phraseScore;
                }
            }
        }

        if (score >= 25) {
            results.push({
                index: idx,
                q: q,
                score: score,
                rawText: qRawText
            });
        }
    });

    results.sort(function(a, b) { return b.score - a.score; });

    if (results.length === 0) {
        resList.innerHTML =
            '<div class="qsearch-empty-state">' +
                '<div class="qsearch-empty-icon">🔎</div>' +
                '<div class="qsearch-empty-title">No matching questions found</div>' +
                '<p>Try searching different keywords, or check spelling.</p>' +
            '</div>';
        return;
    }

    resList.innerHTML = results.map(function(item) {
        var q = item.q;
        var qNum = (typeof q.globalNumber === 'number' ? q.globalNumber : (item.index + 1));
        var topicName = q.topicName || q.topic || q.sectionName || q.category || 'Question';
        var cleanSnippet = stripHtml(item.rawText);
        var highlightedSnippet = highlightSearchTokens(cleanSnippet, tokensToSearch);

        var badgeCls = 'fair';
        if (item.score >= 80) badgeCls = 'high';
        else if (item.score >= 55) badgeCls = 'good';

        var safeTopic = typeof escapeHtml === 'function' ? escapeHtml(topicName) : topicName;

        return (
            '<div class="qsearch-card" onclick="selectSearchResult(' + item.index + ')">' +
                '<div class="qsearch-card-header">' +
                    '<div class="qsearch-card-meta">' +
                        '<span class="qsearch-qno">Q. ' + qNum + '</span>' +
                        '<span class="qsearch-topic">' + safeTopic + '</span>' +
                    '</div>' +
                    '<span class="qsearch-pct ' + badgeCls + '">' + item.score + '% Match</span>' +
                '</div>' +
                '<div class="qsearch-snippet">' + highlightedSnippet + '</div>' +
            '</div>'
        );
    }).join('');
}

function highlightSearchTokens(text, tokens) {
    if (!text) return '';
    var truncated = text.length > 220 ? text.substring(0, 220) + '...' : text;
    var safe = typeof escapeHtml === 'function' ? escapeHtml(truncated) : truncated;

    if (tokens && tokens.length > 0) {
        tokens.forEach(function(tok) {
            if (!tok || tok.length < 2) return;
            var re = new RegExp('(' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
            safe = safe.replace(re, '<mark class="qsearch-hl">$1</mark>');
        });
    }
    return safe;
}

function selectSearchResult(index) {
    closeQuestionSearch();

    // 1. If on Question Cafe:
    if (typeof jumpToQuestion === 'function') {
        var activeScreen = document.querySelector('.screen.active');
        var screenId = activeScreen ? activeScreen.id : '';
        if (screenId === 'screenQuiz' || screenId === 'screenFullQuiz' || screenId === 'screenTestMode') {
            jumpToQuestion(index);
        } else if (typeof showQuiz === 'function') {
            showQuiz(index);
        }
        setTimeout(function() {
            var el = document.getElementById('fullQ-' + index) ||
                     document.getElementById('testQ-' + index) ||
                     document.querySelector('#screenQuiz .quiz-card') ||
                     document.getElementById('quizContainer');
            if (el) {
                el.classList.add('qsearch-jump-flash');
                setTimeout(function() { el.classList.remove('qsearch-jump-flash'); }, 1800);
            }
        }, 120);
        return;
    }

    // 2. If on Test Cafe:
    if (typeof goToQuestion === 'function') {
        goToQuestion(index);
        var card = document.querySelector('.q-card');
        if (card) {
            card.classList.add('qsearch-jump-flash');
            setTimeout(function() { card.classList.remove('qsearch-jump-flash'); }, 1800);
        }
        return;
    }

    // 3. Fallback: navigate to question-cafe.html
    window.location.href = 'question-cafe.html#q' + index;
}

window.stripHtml = stripHtml;
window.cleanTextForMatching = cleanTextForMatching;
window.openQuestionSearch = openQuestionSearch;
window.closeQuestionSearch = closeQuestionSearch;
window.clearQSearch = clearQSearch;
window.performQuestionSearch = performQuestionSearch;
window.selectSearchResult = selectSearchResult;
