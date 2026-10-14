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

    // 0. Convert markdown headers (e.g. ### Detailed Solution)
    s = s.replace(/^###\s+(.+)$/gm, '<h4 style="margin:0.8rem 0 0.35rem; font-size:1.02rem; font-weight:700; color:var(--text-primary);">$1</h4>');
    s = s.replace(/^##\s+(.+)$/gm, '<h3 style="margin:1rem 0 0.45rem; font-size:1.15rem; font-weight:700; color:var(--text-primary);">$1</h3>');
    s = s.replace(/^#\s+(.+)$/gm, '<h2 style="margin:1.2rem 0 0.55rem; font-size:1.25rem; font-weight:700; color:var(--text-primary);">$1</h2>');

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

    // 5.5. Auto-enhance table label cells and empty headers for matching tables
    const LABEL_REGEX = /^\s*(?:\([a-zA-Z0-9]{1,4}\)|\[[a-zA-Z0-9]{1,4}\]|(?:[a-dA-D1-9]|[p-tP-T]|i{1,3}|iv|vi{0,3}|ix|x)\.?)\s*$/i;
    s = s.replace(/<th(\s*[^>]*)>\s*<\/th>/gi, '<th$1 class="th-empty"></th>');
    s = s.replace(/<td(\s*[^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, content) => {
        if (LABEL_REGEX.test(content.trim())) {
            const cleanAttrs = attrs.replace(/\s*class\s*=\s*["'][^"']*["']/i, '');
            return `<td${cleanAttrs} class="td-label">${content}</td>`;
        }
        return match;
    });

    // 6. Protect all math blocks ($$, \[\], \(\), and inline $) so newlines and tags NEVER corrupt formulas
    const mathTokens = [];
    s = s.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+?\$)/g, (match) => {
        // Strip any rogue <br> tags from inside math
        let clean = match.replace(/<br\s*\/?>/gi, ' ');

        // Smart normalization (same as JeeHub and Acrolly):
        // If a $$...$$ block is single-line without multiline environments,
        // treat it as inline math \(...\) so words in sentences don't break into vertical blocks!
        if (clean.startsWith('$$') && clean.endsWith('$$') && !clean.includes('\n') && !clean.includes('\\begin{') && !clean.includes('\\\\')) {
            clean = '\\(' + clean.slice(2, -2).trim() + '\\)';
        }

        const token = `QQQMATHTOKEN${mathTokens.length}QQQ`;
        mathTokens.push(clean);
        return token;
    });

    // 6.5. Smart newline normalization on plain text only (never inside math!)
    // Preserves intentional paragraph breaks (\n\n+) and list/statement lines,
    // while merging soft-wrapped PDF/OCR single newlines into flowing prose.
    const hasBlockHtml = /<(ul|ol|table|tbody|thead|tr|li)/i.test(s);
    if (!hasBlockHtml) {
        s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        s = s.replace(/\n{2,}/g, '___PARABREAK___');

        const lines = s.split('\n');
        if (lines.length > 1) {
            const result = [lines[0]];
            const LIST_OR_STMT_REGEX = /^\s*(?:Statement|Assertion|Reason|List|Question|\([a-zA-Z0-9ivxIVX]+\)|\[[a-zA-Z0-9]+\]|[0-9]+[\.\)]|[a-zA-Z][\.\)]|[•\-\*]|=|\\Rightarrow|\\therefore|\\implies|Given)/i;
            for (let i = 1; i < lines.length; i++) {
                const prev = result[result.length - 1];
                const curr = lines[i];
                if (prev.trim().endsWith(':') || LIST_OR_STMT_REGEX.test(curr) || /<\/(?:h[1-6]|p|div)>\s*$/i.test(prev.trim())) {
                    result.push(curr);
                } else {
                    result[result.length - 1] = prev + ' ' + curr;
                }
            }
            s = result.join('<br>');
        }
        s = s.replace(/___PARABREAK___/g, '<br><br>');
    }

    // 7. Auto-wrap bare LaTeX tokens outside math tokens (math is 100% safe inside mathTokens!)
    if (/[\\^_]/.test(s)) {
        if (s.includes('\\left') && s.includes('\\right')) {
            s = s.replace(/((?:[A-Za-z0-9_^{}\\]+\s*=\s*)?[A-Za-z0-9_^{}\\]*\s*\\(?:sin|cos|tan|cot|sec|csc|ln|log|exp)?\s*[A-Za-z0-9_^{}\\]*\s*\\left[\(\[\{\|\.][^\n]*?\\right[\)\]\}\|\.]|\\left[\(\[\{\|\.][^\n]*?\\right[\)\]\}\|\.])/g, '$$$1$$');
        }
        s = s.replace(/([A-Za-z0-9]+(?:\^\{[^{}]*\}|_\{[^{}]*\}|[\^_][A-Za-z0-9])+(?:\^\{[^{}]*\}|_\{[^{}]*\}|[\^_][A-Za-z0-9])*)/g, '$$$1$$');
        s = s.replace(/(\\(?!left|right|begin|end|cdot|to|pm|mp|times|div|infty|ldots|dots|vdots|cdots|frac)[a-zA-Z]+(?:\{[^{}]*\}|\[[^\[\]]*\])*)/g, '$$$1$$');
    }

    // 7.5. Restore math tokens
    s = s.replace(/QQQMATHTOKEN(\d+)QQQ/g, (match, idx) => {
        return mathTokens[parseInt(idx, 10)] || match;
    });

    // 7.6. Clean spacing around headings and display math ($$ and \[)
    // Strip redundant <br> directly after headings and directly before/after display math
    s = s.replace(/(<\/(?:h[1-6]|p)>)(?:\s*<br\s*\/?>)+/gi, '$1');
    s = s.replace(/(?:<br\s*\/?>\s*)+(?=\$\$|\\\[)/gi, '');
    s = s.replace(/(?<=\$\$|\\\])(?:\s*<br\s*\/?>)+/gi, '');

    // 7.7. Ensure \begin{aligned|gathered|matrix|cases} blocks are properly enclosed in $$ ... $$
    s = s.replace(/(^|[^$])\\begin\{(aligned|gathered|matrix|cases)\}([\s\S]*?)\\end\{\2\}\$\$?/g, '$1$$\\begin{$2}$3\\end{$2}$$');
    s = s.replace(/(^|[^$])\\begin\{(aligned|gathered|matrix|cases)\}([\s\S]*?)\\end\{\2\}(?!\$)/g, '$1$$\\begin{$2}$3\\end{$2}$$');

    // 8. If KaTeX is loaded, pre-render math tokens directly to HTML string
    //    so the browser never paints raw LaTeX text and eliminates any flash/blink!
    s = renderMathInString(s);

    return s;
}

/**
 * Synchronously converts LaTeX delimiters ($$...$$, $...$, \[...\], \(...\))
 * inside an HTML string directly into KaTeX HTML elements.
 * If KaTeX is not loaded, returns the string untouched.
 */
function renderMathInString(html) {
    if (!html || typeof katex === 'undefined' || typeof katex.renderToString !== 'function') {
        return html;
    }
    let s = String(html);
    // Display math: $$...$$
    s = s.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
        const clean = tex.replace(/<br\s*\/?>/gi, ' ').trim();
        if (!clean) return match;
        try {
            return katex.renderToString(clean, { displayMode: true, throwOnError: false });
        } catch (e) {
            return match;
        }
    });
    // Display math: \[...\]
    s = s.replace(/\\\[([\s\S]*?)\\\]/g, (match, tex) => {
        const clean = tex.replace(/<br\s*\/?>/gi, ' ').trim();
        if (!clean) return match;
        try {
            return katex.renderToString(clean, { displayMode: true, throwOnError: false });
        } catch (e) {
            return match;
        }
    });
    // Inline math: $...$ (ensure not empty and not crossing lines if simple)
    s = s.replace(/\$([^$\n]+?)\$/g, (match, tex) => {
        const clean = tex.replace(/<br\s*\/?>/gi, ' ').trim();
        if (!clean) return match;
        try {
            return katex.renderToString(clean, { displayMode: false, throwOnError: false });
        } catch (e) {
            return match;
        }
    });
    // Inline math: \(...\)
    s = s.replace(/\\\(([\s\S]*?)\\\)/g, (match, tex) => {
        const clean = tex.replace(/<br\s*\/?>/gi, ' ').trim();
        if (!clean) return match;
        try {
            return katex.renderToString(clean, { displayMode: false, throwOnError: false });
        } catch (e) {
            return match;
        }
    });
    return s;
}