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

    // -1. Convert OOXML / Word MathML namespace tags (<m:omath>, <m:r>, <m:ssup> …)
    //     into LaTeX before any other processing. These appear when questions are
    //     exported from MS Word / OOXML and not yet converted to LaTeX.
    if (s.includes('<m:omath') || s.includes('&lt;m:omath')) {
        // Decode HTML-entity-encoded OOXML if needed
        if (s.includes('&lt;m:omath')) {
            s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        }
        // Inner helper: strip all XML tags from a fragment and return plain text
        function ooExtract(xml) {
            return (xml || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        }
        // Convert each <m:omath>...</m:omath> block to \(...\)
        s = s.replace(/<m:omath[^>]*>([\s\S]*?)<\/m:omath>/gi, function(_, inner) {
            var latex = inner;
            // Superscript:  <m:sSup><m:e>base</m:e><m:sup>exp</m:sup></m:sSup>
            latex = latex.replace(/<m:sSup[^>]*>([\s\S]*?)<\/m:sSup>/gi, function(__, c) {
                var base = (c.match(/<m:e[^>]*>([\s\S]*?)<\/m:e>/i) || [])[1] || '';
                var sup  = (c.match(/<m:sup[^>]*>([\s\S]*?)<\/m:sup>/i) || [])[1] || '';
                return ooExtract(base) + '^{' + ooExtract(sup) + '}';
            });
            // Subscript:  <m:sSub>
            latex = latex.replace(/<m:sSub[^>]*>([\s\S]*?)<\/m:sSub>/gi, function(__, c) {
                var base = (c.match(/<m:e[^>]*>([\s\S]*?)<\/m:e>/i) || [])[1] || '';
                var sub  = (c.match(/<m:sub[^>]*>([\s\S]*?)<\/m:sub>/i) || [])[1] || '';
                return ooExtract(base) + '_{' + ooExtract(sub) + '}';
            });
            // SubSup
            latex = latex.replace(/<m:sSubSup[^>]*>([\s\S]*?)<\/m:sSubSup>/gi, function(__, c) {
                var base = (c.match(/<m:e[^>]*>([\s\S]*?)<\/m:e>/i) || [])[1] || '';
                var sub  = (c.match(/<m:sub[^>]*>([\s\S]*?)<\/m:sub>/i) || [])[1] || '';
                var sup  = (c.match(/<m:sup[^>]*>([\s\S]*?)<\/m:sup>/i) || [])[1] || '';
                return ooExtract(base) + '_{' + ooExtract(sub) + '}^{' + ooExtract(sup) + '}';
            });
            // Fraction:  <m:f><m:num>...</m:num><m:den>...</m:den></m:f>
            latex = latex.replace(/<m:f[^>]*>([\s\S]*?)<\/m:f>/gi, function(__, c) {
                var num = (c.match(/<m:num[^>]*>([\s\S]*?)<\/m:num>/i) || [])[1] || '';
                var den = (c.match(/<m:den[^>]*>([\s\S]*?)<\/m:den>/i) || [])[1] || '';
                return '\\frac{' + ooExtract(num) + '}{' + ooExtract(den) + '}';
            });
            // Square root:  <m:rad>
            latex = latex.replace(/<m:rad[^>]*>([\s\S]*?)<\/m:rad>/gi, function(__, c) {
                var e = (c.match(/<m:e[^>]*>([\s\S]*?)<\/m:e>/i) || [])[1] || '';
                return '\\sqrt{' + ooExtract(e) + '}';
            });
            // Strip any remaining m: namespace tags, keeping their text content
            latex = latex.replace(/<\/?m:[a-zA-Z]+[^>]*>/g, '');
            return '\\(' + latex.replace(/\s+/g, ' ').trim() + '\\)';
        });
        // Strip any leftover m: namespace tags outside <m:omath>
        s = s.replace(/<\/?m:[a-zA-Z]+[^>]*>/g, '');
    }

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
        'munder', 'munderover', 'semantics', 'annotation', 'menclose',
        'mfenced', 'mstyle', 'mmultiscripts', 'mprescripts', 'mpadded'
    ]);

    // 4. Strip dangerous/garbage tags entirely (script, style, comments, and quillbot extension tags)
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
    s = s.replace(/&lt;style[\s\S]*?&lt;\/style&gt;/gi, '');
    s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/&lt;!--[\s\S]*?--&gt;/g, '');
    s = s.replace(/<quillbot[\w-]*[\s\S]*?<\/quillbot[\w-]*>/gi, '');
    s = s.replace(/<quillbot[\w-]*[^>]*\/?>/gi, '');
    s = s.replace(/&lt;quillbot[\w-]*[\s\S]*?&lt;\/quillbot[\w-]*&gt;/gi, '');
    s = s.replace(/&lt;quillbot[\w-]*[^&]*&gt;/gi, '');

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
            // Preserve explicit width if specified in tag attributes or inline style
            const wAttr = (attrs.match(/width\s*=\s*["']?(\d+)(?:px)?["']?/i) || [])[1];
            const wStyle = (attrs.match(/width\s*:\s*(\d+)px/i) || [])[1];
            const explicitWidth = wAttr || wStyle;
            const sizeStyle = explicitWidth
                ? `width:${explicitWidth}px;max-width:100%;height:auto;`
                : 'max-width:100%;height:auto;';
            return `<img src="${src}" alt="${escapeHtml(alt)}" class="${escapeHtml(cls)}" loading="${loading}" data-original-url="${src}" onerror="handleImageError(this)" style="${sizeStyle}display:inline-block;vertical-align:middle;margin:0.2rem 0.15rem;">`;
        }
        // For table tags: auto-wrap in .table-scroll-wrap for horizontal scrolling and attach match-table class
        if (t === 'table') {
            if (!slash) {
                let tableAttrs = attrs;
                // Remove restrictive inline width and height from table attributes
                tableAttrs = tableAttrs.replace(/\s*(?:width|height)\s*=\s*["'][^"']*["']/gi, '');
                // Clean fixed width/height from inline style attribute if present
                tableAttrs = tableAttrs.replace(/style\s*=\s*["']([^"']*)["']/gi, (m, st) => {
                    const cleanStyle = st.replace(/(?:width|height)\s*:[^;]+;?/gi, '').trim();
                    return cleanStyle ? ` style="${cleanStyle}"` : '';
                });
                if (!/class\s*=\s*["'][^"']*["']/i.test(tableAttrs)) {
                    tableAttrs += ' class="match-table"';
                } else if (!tableAttrs.includes('match-table')) {
                    tableAttrs = tableAttrs.replace(/class\s*=\s*["']([^"']*)["']/i, 'class="$1 match-table"');
                }
                return `<div class="table-scroll-wrap"><table${tableAttrs}>`;
            } else {
                return `</table></div>`;
            }
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

    // 6. Smart newline normalization on plain text only (never inside math or block HTML!)
    const hasBlockHtml = /<(ul|ol|table|tbody|thead|tr|li|p|div)/i.test(s);
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
    } else {
        // For block HTML (p, div, tables): collapse whitespace/newlines between tags and around br to avoid pre-wrap gaps
        s = s.replace(/<br\s*\/?>\s*[\r\n]+/gi, '<br>');
        s = s.replace(/[\r\n]+\s*(?=<br\s*\/?>)/gi, '');
        s = s.replace(/(<\/(?:p|div|table|ul|ol|h[1-6])>)\s*(?:<br\s*\/?>\s*)+/gi, '$1');
        s = s.replace(/(?:<br\s*\/?>\s*)+(<(?:p|div|table|ul|ol|h[1-6]))/gi, '$1');
        for (let pass = 0; pass < 5; pass++) {
            s = s.replace(/(<\/?(?:table|thead|tbody|tfoot|tr|ul|ol)[^>]*>)\s+(<\/?(?:table|thead|tbody|tfoot|tr|td|th|li)[^>]*>)/gi, '$1$2');
            s = s.replace(/(<\/(?:td|th)>)\s+(<(?:td|th)[^>]*>)/gi, '$1$2');
            s = s.replace(/(<\/(?:p|div|h[1-6])>)\s+(<(?:p|div|h[1-6]|table|ul|ol)[^>]*>)/gi, '$1$2');
            s = s.replace(/\s*[\r\n]+\s*(<\/(?:tr|tbody|thead|tfoot|table|td|th)>)/gi, '$1');
            s = s.replace(/(<(?:tr|tbody|thead|tfoot|table|td|th)[^>]*>)\s*[\r\n]+\s*/gi, '$1');
        }
        s = s.replace(/<p>\s*(?:&nbsp;)?\s*<\/p>\s*$/gi, '');
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

    return s.trim();
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
    window.safeHtml = safeHtml;
    window.typesetMath = typesetMath;
    window.tcTypeset = typesetMath;
    window.renderMathInElement = function(el) {
        return typesetMath(el);
    };
    window.getPedagogicalSortRank = getPedagogicalSortRank;
}

/**
 * initTableScrollHints(root)
 * Scans all .table-scroll-wrap elements inside `root` (defaults to document)
 * and adds .is-scrollable only when the inner table genuinely overflows the
 * wrapper width. This prevents showing a scroll hint — or forcing scroll —
 * on small 2-column tables that fit just fine on mobile.
 *
 * Uses ResizeObserver so it re-evaluates on orientation change / panel resize.
 */
function initTableScrollHints(root) {
    const scope = root || document;
    const wrappers = scope.querySelectorAll('.table-scroll-wrap');
    if (!wrappers.length) return;

    const markOverflow = (wrap) => {
        // scrollWidth > clientWidth means the content overflows and needs scroll
        const overflows = wrap.scrollWidth > wrap.clientWidth + 1;
        wrap.classList.toggle('is-scrollable', overflows);
    };

    wrappers.forEach(wrap => {
        markOverflow(wrap);
        // Re-evaluate whenever the container width changes (e.g. orientation flip)
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => markOverflow(wrap));
            ro.observe(wrap);
        }
    });
}

if (typeof window !== 'undefined') {
    window.initTableScrollHints = initTableScrollHints;

    // Auto-run after every likely DOM mutation that adds table-scroll-wrap elements
    if (window.MutationObserver) {
        const _tableHintObserver = new MutationObserver((mutations) => {
            let shouldCheck = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1) {
                        if (node.classList && node.classList.contains('table-scroll-wrap')) {
                            shouldCheck = true; break;
                        }
                        if (node.querySelector && node.querySelector('.table-scroll-wrap')) {
                            shouldCheck = true; break;
                        }
                    }
                }
                if (shouldCheck) break;
            }
            if (shouldCheck) {
                // Small delay to let layout settle after innerHTML assignment
                requestAnimationFrame(() => initTableScrollHints());
            }
        });
        _tableHintObserver.observe(document.body || document.documentElement, {
            childList: true, subtree: true
        });
    }
}

/**
 * getPedagogicalSortRank(str, filePath)
 * Returns the sort order for in-chapter exercise / question set presentation.
 * 
 * 1. PW MODULES:
 *    ARAMBH / AARAMBH -> PRARAMBH -> PRABAL -> PARIKSHIT -> PYQ -> Supplemental
 * 
 * 2. NEETPREP BIOLOGY (Botany & Zoology):
 *    Full QBank -> Mini Q Bank -> Level 0.5 -> Recommended MCQs -> Recommended PYQs ->
 *    NCERT Exemplar -> AR & Other Type -> Past Year (2019 onward) -> Past Year (2016-2018) ->
 *    Past Year (2006-2015) -> Past Year (1998-2005) -> Excluded Topics -> NEET 2025 Level
 * 
 * 3. NEETPREP PHYSICS & CHEMISTRY:
 *    Full QBank -> Absorb Before You Solve -> Level 0.5 -> Recommended MCQs -> Recommended PYQs ->
 *    Mini Q Bank -> NCERT Solved Examples -> NCERT Exercise -> NCERT Exemplar -> AR & Other Type ->
 *    HC Verma -> Past Year (2019 onward) -> Past Year (2016-2018) -> Past Year (2006-2015) ->
 *    Past Year (1998-2005) -> NEET 2025 Level -> JEE-Mains MCQs
 * 
 * 4. General / NCERT Punch fallback: standard pedagogical sequence.
 */
function getPedagogicalSortRank(str, filePath) {
    if (!str && !filePath) return 999;
    const s = (String(str || '') + ' ' + String(filePath || '')).toLowerCase().replace(/[-_]/g, ' ');
    const p = String(filePath || '').toLowerCase();

    // Check if this is a PW Module
    const isPW = p.includes('pw-modules') || p.includes('pw module') || 
                 s.includes('prarambh') || s.includes('prabal') || s.includes('parikshit') || 
                 s.includes('aarambh') || s.includes('arambh');

    if (isPW) {
        if (s.includes('aarambh') || s.includes('arambh')) return 10;
        if (s.includes('prarambh')) return 20;
        if (s.includes('prabal')) return 30;
        if (s.includes('parikshit')) return 40;
        if (s.includes('pyq') || s.includes('past year')) return 50;
        if (s.includes('setu') || s.includes('bridge')) return 60;
        if (s.includes('challenger')) return 70;
        return 80;
    }

    // Check if this is NEETPrep
    const isNeetprep = p.includes('neetprep') || s.includes('neetprep');
    if (isNeetprep) {
        // Full QBank is always FIRST (Rank 1)
        const isFullQbank = s.includes('full qbank') || s.includes('full q bank') || s.includes('full question bank') ||
            (p.endsWith('.json') && !p.includes('/absorb') && !p.includes('/level') && !p.includes('/mini') && 
             !p.includes('/recommended') && !p.includes('/ncert') && !p.includes('/ar-') && !p.includes('/past-year') && 
             !p.includes('/excluded') && !p.includes('/neet-2025') && !p.includes('/jee-') && !p.includes('/hcv'));
        if (isFullQbank) return 1;

        const isBiology = p.includes('botany') || p.includes('zoology') || p.includes('biology') ||
                          s.includes('botany') || s.includes('zoology') || s.includes('biology');

        if (isBiology) {
            if (s.includes('mini q bank') || s.includes('mini qbank') || s.includes('mini question bank')) return 2;
            if (s.includes('level 0.5') || s.includes('level 0 5')) return 3;
            if (s.includes('recommended mcq') && !s.includes('pyq')) return 4;
            if (s.includes('recommended pyq')) return 5;
            if (s.includes('exemplar') || s.includes('exampler')) return 6;
            if (s.includes('ar & other') || s.includes('ar other') || s.includes('assertion')) return 7;
            if (s.includes('2019 onward') || s.includes('2019 onwards') || (s.includes('past year') && s.includes('2019'))) return 8;
            if (s.includes('2016 2018') || (s.includes('past year') && s.includes('2016'))) return 9;
            if (s.includes('2006 2015') || (s.includes('past year') && s.includes('2006'))) return 10;
            if (s.includes('1998 2005') || (s.includes('past year') && s.includes('1998'))) return 11;
            if (s.includes('excluded topic') || s.includes('excluded')) return 12;
            if (s.includes('neet 2025') || s.includes('2025 level')) return 13;
            return 30;
        } else {
            if (s.includes('absorb before you solve') || s.includes('absorb')) return 2;
            if (s.includes('level 0.5') || s.includes('level 0 5')) return 3;
            if (s.includes('recommended mcq') && !s.includes('pyq')) return 4;
            if (s.includes('recommended pyq')) return 5;
            if (s.includes('mini q bank') || s.includes('mini qbank') || s.includes('mini question bank')) return 6;
            if (s.includes('solved example') || s.includes('solved examples')) return 7;
            if (s.includes('intext')) return 7.5;
            if (s.includes('ncert exercise') || s.includes('exercise based')) return 8;
            if (s.includes('exemplar') || s.includes('exampler')) return 9;
            if (s.includes('ar & other') || s.includes('ar other') || s.includes('assertion')) return 10;
            if (s.includes('h c verma') || s.includes('hc verma') || s.includes('hcv')) return 11;
            if (s.includes('2019 onward') || s.includes('2019 onwards') || (s.includes('past year') && s.includes('2019'))) return 12;
            if (s.includes('2016 2018') || (s.includes('past year') && s.includes('2016'))) return 13;
            if (s.includes('2006 2015') || (s.includes('past year') && s.includes('2006'))) return 14;
            if (s.includes('1998 2005') || (s.includes('past year') && s.includes('1998'))) return 15;
            if (s.includes('neet 2025') || s.includes('2025 level')) return 16;
            if (s.includes('jee main') || s.includes('jee mains') || s.includes('jee')) return 17;
            return 30;
        }
    }

    // General fallback for NCERT Punch / other books
    if (s.includes('topic wise') || s.includes('topicwise')) return 101;
    if (s.includes('exemplar') || s.includes('exampler')) return 102;
    if (s.includes('statement')) return 103;
    if (s.includes('assertion')) return 104;
    if (s.includes('correct incorrect') || s.includes('correct & incorrect') || s.includes('correct') || s.includes('incorrect')) return 105;
    if (s.includes('matching') || s.includes('match the column') || s.includes('match')) return 106;
    if (s.includes('sequence') || s.includes('multi')) return 107;
    if (s.includes('high order') || s.includes('hots') || s.includes('time intensive')) return 108;
    if (s.includes('kattar')) return 109;
    if (s.includes('past year') || s.includes('pyq') || s.includes('aiims') || s.includes('past')) return 110;
    if (s.includes('image based') || s.includes('image')) return 111;

    return 500;
}

if (typeof global !== 'undefined') {
    global.safeHtml = safeHtml;
    global.getPedagogicalSortRank = getPedagogicalSortRank;
}