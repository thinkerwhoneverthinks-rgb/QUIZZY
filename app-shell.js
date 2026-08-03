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
    if (e.key === 'Escape') closeMenu();
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
