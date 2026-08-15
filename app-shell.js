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
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeMenu(); closeDataPanel(); }
});

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
