// ==================== PYQHUB / ALLEN DEDICATED RENDERER ====================
// Natively handles standard LaTeX ($...$, $$...$$), markdown tables, and Allen formats.

(function (window) {
    function renderPyqhubText(raw) {
        if (!raw) return '';
        let s = String(raw);

        // 1. Markdown Headings
        s = s.replace(/^###\s+(.+)$/gm, '<h4 style="margin:0.8rem 0 0.35rem; font-size:1.02rem; font-weight:700; color:var(--text-primary);">$1</h4>');
        s = s.replace(/^##\s+(.+)$/gm, '<h3 style="margin:1rem 0 0.45rem; font-size:1.15rem; font-weight:700; color:var(--text-primary);">$1</h3>');

        // 2. Bold and italic markdown
        s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');

        // 3. Convert $$ ... $$ to display math container
        s = s.replace(/\$\$([\s\S]*?)\$\$/g, '<div class="pyq-display-math" style="overflow-x:auto; margin:0.6rem 0;">\\[$1\\]</div>');

        // 4. Convert single-line breaks outside math
        s = s.replace(/\n\n+/g, '<br><br>');
        s = s.replace(/\n/g, '<br>');

        return s;
    }

    function renderPyqhubOption(opt) {
        if (!opt) return '';
        let s = String(opt).trim();
        // Wrap plain math without delimiters
        if (/[\\_{}^=]/.test(s) && !s.startsWith('$') && !s.startsWith('\\(')) {
            return `\\(${s}\\)`;
        }
        return s;
    }

    window.renderPyqhubText = renderPyqhubText;
    window.renderPyqhubOption = renderPyqhubOption;
})(typeof window !== 'undefined' ? window : global);
