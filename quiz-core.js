// ==================== DATA CONFIG ====================
// subjects are now handled via manifest.json
let currentDirectory = []; // Breadcrumb navigation stack
let manifestRoot = null; // Root manifest node

// ==================== STATE ====================
let currentSubject = null;
let currentChapter = null;
let currentMode = null; 
let questions = [];
let topics = [];
let currentQIndex = 0;
let userAnswers = {};
let isGridOpen = false;
let selectedTopics = [];
let subjectData = null; 
let topicQuestionCounts = {}; 
let currentFileName = null; // Currently loaded file name
let loadedFiles = {}; // Cache of loaded & normalized file data

let testStartTime = null;
let testSubmitted = false; // gates correct/wrong grid coloring so a live test never leaks answers
let testTimerInterval = null;
let testTimeLimit = 30 * 60; 
let testQuestionCount = 10; 
let reviewFilter = 'all';

// Bilingual Language State ('en' or 'hi')
let currentLanguage = 'en';
try {
    const savedLang = localStorage.getItem('quizzy-language');
    if (savedLang === 'hi' || savedLang === 'en') currentLanguage = savedLang;
} catch (e) { /* ignore */ }

function toggleQuestionLanguage() {
    currentLanguage = currentLanguage === 'en' ? 'hi' : 'en';
    try { localStorage.setItem('quizzy-language', currentLanguage); } catch (e) { /* ignore */ }
    if (typeof updateCardInCurrentMode === 'function' && typeof currentQIndex !== 'undefined') {
        updateCardInCurrentMode(currentQIndex);
    } else if (typeof renderQuestion === 'function') {
        renderQuestion();
    }
}

// ==================== UTILS ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function escapeHtmlAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * safeHtml(text)
 * Used for question bodies and explanations which may contain:
 *   - **markdown bold** → <strong>
 *   - Safe HTML: <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <td>, <th>,
 *                <img>, <br>, <b>, <strong>, <em>, <i>, <sup>, <sub>, <p>, <hr>
 *   - Dangerous tags are stripped (script, iframe, style, object, a[href=js])
 * Math delimiters ($, $$) are passed through untouched for KaTeX.
 */
function safeHtml(text) {
    if (!text) return '';
    let s = String(text);

    // 1. Convert **bold** markdown to <strong>
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    // 2. Convert *italic* markdown to <em> only when surrounded by word chars or spaces (not inside LaTeX)
    s = s.replace(/(?:^|(?<=[^*]))\*([^*\n]+?)\*(?=[^*]|$)/g, '<em>$1</em>');

    // 3. Allowed tag names (case-insensitive)
    const ALLOWED = new Set([
        'b', 'strong', 'i', 'em', 'u', 'sup', 'sub', 'br', 'hr',
        'p', 'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'img', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'code', 'pre'
    ]);

    // 4. Strip dangerous tags entirely (including their content for script/style)
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
    s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');

    // 5. For any remaining tag: allow if whitelisted, strip if not
    s = s.replace(/<(\/?)([\w-]+)([^>]*)>/g, (match, slash, tag, attrs) => {
        const t = tag.toLowerCase();
        if (!ALLOWED.has(t)) return ''; // strip unknown/dangerous tags
        // For img tags: only allow src, alt, class, style, loading, width, height attrs
        if (t === 'img') {
            const src = (attrs.match(/src\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
            const alt = (attrs.match(/alt\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
            const cls = (attrs.match(/class\s*=\s*["']([^"']*)["']/i) || [])[1] || 'question-image';
            const loading = 'lazy';
            if (!src) return '';
            return `<img src="${src}" alt="${escapeHtml(alt)}" class="${escapeHtml(cls)}" loading="${loading}" style="max-width:100%;height:auto;display:inline-block;vertical-align:middle;margin:0.2rem 0.15rem;">`;
        }
        // For all other tags: strip any event handlers (onclick, onerror, etc.)
        const cleanAttrs = attrs
            .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '')
            .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '');
        return `<${slash}${t}${cleanAttrs}>`;
    });

    // 6. Convert bare newlines to <br> (but not inside already-rendered HTML lists/tables)
    const hasBlockHtml = /<(ul|ol|table|p|h[1-6]|div|li)/i.test(s);
    if (!hasBlockHtml) {
        s = s.replace(/\n\n+/g, '<br><br>');
        s = s.replace(/\n/g, '<br>');
    }

    // 7. Auto-wrap bare LaTeX superscript/subscript tokens that are outside $...$ delimiters.
    //    e.g. "A^{2} $-$ B^{2}C^{2}" → "$A^{2}$ $-$ $B^{2}C^{2}$"
    //    Split on existing math delimiters AND HTML tags, so tags (like <img src="...">) are never corrupted
    const mathParts = s.split(/(<[^>]+>|\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g);
    s = mathParts.map(part => {
        if (!part) return '';
        // If it is an HTML tag or an existing math block, leave it completely untouched
        if (part.startsWith('<') || part.startsWith('$')) {
            return part;
        }
        if (/[\\^_]/.test(part)) {
            // Wrap tokens: sequences of word chars, ^{...}, _{...}, \cmd{...} not already in $
            part = part.replace(/([A-Za-z0-9]+(?:\^\{[^{}]*\}|_\{[^{}]*\}|[\^_][A-Za-z0-9])+(?:\^\{[^{}]*\}|_\{[^{}]*\}|[\^_][A-Za-z0-9])*)/g, '$$$1$$');
            // Wrap isolated \command{...} patterns
            part = part.replace(/(\\[a-zA-Z]+(?:\{[^{}]*\}|\[[^\[\]]*\])*)/g, '$$$1$$');
        }
        return part;
    }).join('');

    return s;
}