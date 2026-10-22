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

function updateHeaderLangPills() {
    const hasHi = typeof questions !== 'undefined' && questions && questions.some(q => q.translations && q.translations.hi);
    ['headerLangPills', 'fullHeaderLangPills', 'testHeaderLangPills'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = hasHi ? 'inline-flex' : 'none';
        }
    });
    document.querySelectorAll('.header-lang-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLanguage);
    });
}
window.updateHeaderLangPills = updateHeaderLangPills;

function setQuizLanguage(lang) {
    if (lang !== 'en' && lang !== 'hi') return;
    currentLanguage = lang;
    try { localStorage.setItem('quizzy-language', currentLanguage); } catch (e) { /* ignore */ }
    updateHeaderLangPills();
    const activeScreen = document.querySelector('.screen.active');
    const screenId = activeScreen ? activeScreen.id : '';
    if (screenId === 'screenFullQuiz' && typeof renderFullQuiz === 'function') {
        renderFullQuiz();
    } else if (screenId === 'screenTestMode' && typeof renderTestMode === 'function') {
        renderTestMode();
    } else if (screenId === 'screenReview' && typeof renderReview === 'function') {
        renderReview();
    } else if (screenId === 'screenBookmarks' && typeof renderBookmarks === 'function') {
        renderBookmarks();
    } else if (typeof renderQuestion === 'function') {
        renderQuestion();
    }
    if (typeof renderQuestionGrid === 'function') {
        renderQuestionGrid();
    }
}

function toggleQuestionLanguage() {
    setQuizLanguage(currentLanguage === 'en' ? 'hi' : 'en');
}

// ==================== UTILS ====================
function escapeHtml(text) {
    if (!text) return '';
    if (typeof document !== 'undefined') {
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
 * resolveImageUrl(src)
 * Resolves local, relative, or custom protocol URLs into fully-qualified CDN URLs:
 * - pyq-asset://... → https://www.neetpulse.online/api/pyq/asset?file=...
 * - Bare numeric Allen images → https://d2lbh14zkcqlst.cloudfront.net/content_data/content_images/...
 */
function resolveImageUrl(src) {
    if (!src) return '';
    let url = String(src).trim();
    if (url.startsWith('pyq-asset://')) {
        return url.replace('pyq-asset://', 'https://www.neetpulse.online/api/pyq/asset?file=');
    }
    if (/^[0-9]{10,}[a-zA-Z0-9_-]*\.(?:png|jpg|webp|jpeg)$/i.test(url)) {
        return `https://d2lbh14zkcqlst.cloudfront.net/content_data/content_images/${url}`;
    }
    return url;
}
if (typeof window !== 'undefined') window.resolveImageUrl = resolveImageUrl;

/**
 * safeHtml(text)
 * Cleans and formats question bodies, options, and explanations.
 * - Resolves image URLs
 * - Extracts LaTeX from <img alt="...">
 * - Fixes rogue $ around tags and common words
 * - Normalizes nested minus in superscripts ({$-$1} -> {-1})
 * - Converts markdown headers and bold/italic
 * - Protects math blocks ($$, \[\], \(\), and inline $)
 * - Preserves HTML formatting without KaTeX error pollution
 */
function safeHtml(text) {
    if (!text) return '';
    let s = String(text);

    // 0. Clean up triple-escaped JSON artifacts and excessive backslashes
    if (s.includes('\\\\\\\"')) s = s.replace(/\\\\\\"/g, '"');
    if (s.includes('\\\\\"')) s = s.replace(/\\\\"/g, '"');
    s = s.replace(/\\\\([a-zA-Z]+)/g, '\\$1');

    // 0.1. Fix nested minus signs in superscripts (e.g. s^{$-$1} -> s^{-1})
    s = s.replace(/\{\s*\$\s*-\s*\$\s*([0-9]+)\s*\}/g, '{-$1}');
    s = s.replace(/\$\s*-\s*\$/g, '-');
    s = s.replace(/\{\s*-\s*\$\s*([0-9]+)\s*\}/g, '{-$1}');

    // 0.2. Extract LaTeX from <img alt="..."> (handles World B formulas trapped in image tags)
    s = s.replace(/<img[^>]+alt="([\\$][^"]+)"[^>]*\/?>/gi, (match, alt) => {
        let cleanLatex = alt.replace(/\\\\/g, '\\').trim();
        if (cleanLatex.startsWith('$') && cleanLatex.endsWith('$')) return cleanLatex;
        return `$${cleanLatex}$`;
    });

    // 0.3. Protect all math blocks ($$, \[\], \(\), and inline $) BEFORE any tag/markdown manipulation!
    const mathTokens = [];
    s = s.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+?\$)/g, (match) => {
        let clean = match.replace(/<br\s*\/?>/gi, ' ');
        // If a $$...$$ block is single-line without multiline environments, treat as inline \(...\)
        if (clean.startsWith('$$') && clean.endsWith('$$') && !clean.includes('\n') && !clean.includes('\\begin{') && !clean.includes('\\\\')) {
            clean = '\\(' + clean.slice(2, -2).trim() + '\\)';
        }
        const token = `QQQMATHTOKEN${mathTokens.length}QQQ`;
        mathTokens.push(clean);
        return token;
    });

    // 0.4. Clean rogue isolated dollars around empty block containers and standard keywords
    s = s.replace(/\$\s*(Match|Assume|Which|Choose|Select|Following|Given|Statement|Assertion|Reason)\s*\$/gi, '$1');

    // 0.5. Clean broken markdown bold closing
    s = s.replace(/\*\*([^*<]+)<\/strong>/gi, '<strong>$1</strong>');

    // 0.6. Convert markdown headers (e.g. ### Detailed Solution)
    s = s.replace(/^###\s+(.+)$/gm, '<h4 style="margin:0.8rem 0 0.35rem; font-size:1.02rem; font-weight:700; color:var(--text-primary);">$1</h4>');
    s = s.replace(/^##\s+(.+)$/gm, '<h3 style="margin:1rem 0 0.45rem; font-size:1.15rem; font-weight:700; color:var(--text-primary);">$1</h3>');
    s = s.replace(/^#\s+(.+)$/gm, '<h2 style="margin:1.2rem 0 0.55rem; font-size:1.25rem; font-weight:700; color:var(--text-primary);">$1</h2>');

    // 1. Convert **bold** markdown to <strong>
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    // 2. Convert *italic* markdown to <em> only when surrounded by word chars or spaces (not inside LaTeX)
    s = s.replace(/(?:^|(?<=[^*]))\*([^*\n]+?)\*(?=[^*]|$)/g, '<em>$1</em>');

    // 3. Allowed tag names (case-insensitive) - including MathML for offline math formulas
    const ALLOWED = new Set([
        'b', 'strong', 'i', 'em', 'u', 'sup', 'sub', 'br', 'hr',
        'p', 'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'img', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'code', 'pre',
        'math', 'mrow', 'mi', 'mo', 'mn', 'mfrac', 'msup', 'msub', 'msubsup',
        'msqrt', 'mroot', 'mspace', 'mtext', 'mtable', 'mtr', 'mtd', 'mover',
        'munder', 'munderover', 'semantics', 'annotation', 'menclose'
    ]);

    // 4. Strip dangerous tags entirely (including their content for script/style)
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
    s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');

    // 5. For any remaining tag: allow if whitelisted, strip if not
    s = s.replace(/<(\/?)([\w-]+)([^>]*)>/g, (match, slash, tag, attrs) => {
        const t = tag.toLowerCase();
        if (!ALLOWED.has(t)) return ''; // strip unknown/dangerous tags
        // For img tags: resolve source and ensure clean responsive styling
        if (t === 'img') {
            let src = (attrs.match(/src\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
            const alt = (attrs.match(/alt\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
            const cls = (attrs.match(/class\s*=\s*["']([^"']*)["']/i) || [])[1] || 'question-image';
            const loading = 'lazy';
            src = resolveImageUrl(src);
            if (!src) return '';
            return `<img src="${src}" alt="${escapeHtml(alt)}" class="${escapeHtml(cls)}" loading="${loading}" data-original-url="${src}" onerror="handleImageError(this)" style="max-width:100%;height:auto;display:inline-block;vertical-align:middle;margin:0.2rem 0.15rem;">`;
        }
        // For table tags: auto-attach match-table class for neat dual-column layout
        if (t === 'table' && !slash) {
            let tableAttrs = attrs;
            if (!/class\s*=\s*["'][^"']*["']/i.test(tableAttrs)) {
                tableAttrs += ' class="match-table"';
            } else if (!tableAttrs.includes('match-table')) {
                tableAttrs = tableAttrs.replace(/class\s*=\s*["']([^"']*)["']/i, 'class="$1 match-table"');
            }
            return `<table${tableAttrs}>`;
        }
        // For all other tags: strip any event handlers (onclick, onerror, etc.)
        const cleanAttrs = attrs
            .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '')
            .replace(/href\s*=\s*["']javascript:[^"']*["']/gi);
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

    // 6. Smart newline normalization on plain text only (never inside math!)
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

    // 7. Restore all protected math tokens
    s = s.replace(/QQQMATHTOKEN(\d+)QQQ/g, (match, idx) => {
        return mathTokens[parseInt(idx, 10)] || match;
    });

    // 7.6. Clean spacing around headings and display math
    s = s.replace(/(<\/(?:h[1-6]|p)>)(?:\s*<br\s*\/?>)+/gi, '$1');
    s = s.replace(/(?:<br\s*\/?>\s*)+(?=\$\$|\\\[)/gi, '');
    s = s.replace(/(?<=\$\$|\\\])(?:\s*<br\s*\/?>)+/gi, '');

    // 7.7. Ensure \begin{aligned|gathered|matrix|cases} blocks are properly enclosed in $$ ... $$
    s = s.replace(/(^|[^$])\\begin\{(aligned|gathered|matrix|cases)\}([\s\S]*?)\\end\{\2\}\$\$?/g, '$1$$\\begin{$2}$3\\end{$2}$$');
    s = s.replace(/(^|[^$])\\begin\{(aligned|gathered|matrix|cases)\}([\s\S]*?)\\end\{\2\}(?!\$)/g, '$1$$\\begin{$2}$3\\end{$2}$$');

    return s;
}

// ==================== MATHJAX 3 TYPESETTING QUEUE ====================
let mathJaxQueue = Promise.resolve();

/**
 * typesetMath(el)
 * High-performance, queue-safe MathJax 3 typesetter for dynamic DOM updates.
 * Guarantees zero-conflict execution, handles Chemistry (mhchem), Physics (cancel),
 * and suppresses errors cleanly (noerrors).
 */
function typesetMath(el) {
    if (!el) return Promise.resolve();
    if (window.MathJax && window.MathJax.typesetPromise) {
        if (window.MathJax.typesetClear) {
            try { window.MathJax.typesetClear([el]); } catch (e) { /* ignore */ }
        }
        mathJaxQueue = mathJaxQueue
            .then(() => window.MathJax.typesetPromise([el]))
            .catch(err => console.warn('MathJax typeset error:', err));
        return mathJaxQueue;
    } else {
        const interval = setInterval(() => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                clearInterval(interval);
                typesetMath(el);
            }
        }, 50);
        setTimeout(() => clearInterval(interval), 6000);
        return Promise.resolve();
    }
}
if (typeof window !== 'undefined') {
    window.typesetMath = typesetMath;
    window.tcTypeset = typesetMath;
    window.renderMathInElement = function(el) {
        return typesetMath(el);
    };
}