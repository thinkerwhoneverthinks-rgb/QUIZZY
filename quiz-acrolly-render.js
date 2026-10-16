// ==================== ACROLLY DEDICATED RENDERER ====================
// Exactly mirrors Acrolly's native production engine for questions, options, and explanations.

(function (window) {
    function Bw(str) {
        if (!str) return '';
        let t = String(str);
        t = t.replace(/\\\\\(/g, '\\(');
        t = t.replace(/\\\\\)/g, '\\)');
        t = t.replace(/\\\\\[/g, '\\[');
        t = t.replace(/\\\\\]/g, '\\]');
        t = t.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
        return t;
    }

    function cleanOption(opt) {
        if (!opt) return '';
        let s = String(opt).trim();
        if (!s) return '';

        // If already enclosed in \( ... \)
        if (s.startsWith('\\(') && s.endsWith('\\)')) {
            let inner = s.slice(2, -2).trim();
            // Strip any nested \( or \)
            inner = inner.replace(/\\\(|\\\)/g, '').trim();
            return `\\(${inner}\\)`;
        }

        // If it has internal \( ... \) like "1 : \( \sqrt{3} \) : 2"
        if (s.includes('\\(')) {
            const textOutside = s.replace(/\\\(.*?\\\)/g, '');
            if (/^[0-9\s:+\-*/=.,()]+$/.test(textOutside)) {
                let inner = s.replace(/\\\(|\\\)/g, '').trim();
                return `\\(${inner}\\)`;
            }
            return s;
        }

        // Formula or ratio
        if (/[\\_{}^=]/.test(s) || (/^[0-9a-zA-Z\s+\-*/:.]+$/.test(s) && !/^(?:[A-D]\s*Only|None|Both|All|Statement|Assertion|Reason)/i.test(s))) {
            if (!s.startsWith('$')) {
                return `\\(${s}\\)`;
            }
        }
        return s;
    }

    function renderAcrollyText(raw) {
        if (!raw) return '';
        const text = Bw(raw);

        // If the content is an Acrolly blocks array (JSON or parsed)
        if (Array.isArray(text)) {
            return renderBlocks(text);
        }
        if (typeof text === 'string' && text.trim().startsWith('[')) {
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) return renderBlocks(parsed);
            } catch (e) { /* not JSON, continue as text */ }
        }

        const lines = text.split('\n');
        const out = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const s = line.trim();
            if (!s) continue;

            // 1. Headings
            if (s.startsWith('### ')) {
                const h = s.slice(4).trim();
                out.push(`<h4 class="acro-heading" style="margin:0.9rem 0 0.4rem; font-size:1.05rem; font-weight:700; color:var(--text-primary);">${h}</h4>`);
                continue;
            }
            if (s.startsWith('## ')) {
                const h = s.slice(3).trim();
                out.push(`<h3 class="acro-heading" style="margin:1.1rem 0 0.5rem; font-size:1.18rem; font-weight:700; color:var(--text-primary);">${h}</h3>`);
                continue;
            }

            // 2. Bullet list
            if (s.startsWith('• ') || s.startsWith('- ') || s.startsWith('* ')) {
                let b = s.slice(2).trim();
                b = b.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                out.push(`<li class="acro-bullet" style="margin:0.25rem 0; line-height:1.6;">${b}</li>`);
                continue;
            }

            // 3. Pre-wrapped display math
            if ((s.startsWith('\\[') && s.endsWith('\\]')) || (s.startsWith('$$') && s.endsWith('$$'))) {
                out.push(`<div class="acro-math-block" style="overflow-x:auto; margin:0.6rem 0;">${s}</div>`);
                continue;
            }

            // 4. Identify if this line is an English paragraph:
            // - Has inline math \(...\) like "Radius of the large disc \(R = 20\) cm."
            // - Starts with sentence words (Since, Substitute, Let, Given, Distance...)
            let isEnglish = false;
            if (s.includes('\\(')) {
                isEnglish = true;
            } else if (/^(?:The|Let|Given|From|Since|Substitute|This|We|In|On|Here|Where|Therefore|Hence|Distance|Note|Then|Option|Because|Thus|mass of disc|The ball|From equation)\b/i.test(s)) {
                isEnglish = true;
            } else {
                // Count English words >= 3 letters outside \text{...} and units
                const cleanWords = s.replace(/\\[a-zA-Z]+(?:\{[^{}]*\})*|\b(?:cm|kg|m|s|KE|COM)\b/g, '');
                const words = cleanWords.match(/\b[a-zA-Z]{3,}\b/g) || [];
                if (words.length >= 2) {
                    isEnglish = true;
                }
            }

            if (isEnglish) {
                let p = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                out.push(`<p class="acro-para" style="margin:0.4rem 0; line-height:1.65;">${p}</p>`);
                continue;
            }

            // 5. Standalone Equation: wrap in \[ ... \]
            if (/[=≈≤≥<>]/.test(s) || s.includes('\\propto') || s.startsWith('\\Rightarrow') || s.startsWith('\\implies') || s.startsWith('\\text{') || s.startsWith('\\frac') || s.startsWith('\\sqrt') || s.startsWith('\\int') || s.startsWith('\\sum') || s.includes('\\frac') || s.includes('\\sqrt') || /[A-Za-z0-9_^{}]+:\s*[A-Za-z0-9_^{}]+:\s*[A-Za-z0-9_^{}]+/.test(s)) {
                out.push(`<div class="acro-math-block" style="overflow-x:auto; margin:0.6rem 0;">\\[${s}\\]</div>`);
            } else {
                let p = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                out.push(`<p class="acro-para" style="margin:0.4rem 0; line-height:1.65;">${p}</p>`);
            }
        }

        return out.join('');
    }

    function renderBlocks(blocks) {
        if (!Array.isArray(blocks)) return '';
        return blocks.map(b => {
            if (!b) return '';
            if (b.heading) return `<h3 class="acro-heading" style="margin:1rem 0 0.5rem; font-size:1.15rem; font-weight:700;">${b.heading}</h3>`;
            if (b.subheading) return `<h4 class="acro-subheading" style="margin:0.8rem 0 0.35rem; font-size:1.05rem; font-weight:700;">${b.subheading}</h4>`;
            if (b.bold) return `<div class="font-bold" style="margin:0.4rem 0;">${b.bold}</div>`;
            if (b.paragraph) {
                let p = b.paragraph.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                return `<p class="acro-para" style="margin:0.4rem 0; line-height:1.65;">${p}</p>`;
            }
            if (b.latex) return `<div class="acro-math-block" style="overflow-x:auto; margin:0.6rem 0;">\\[${Bw(b.latex)}\\]</div>`;
            if (b.bullet) {
                const items = Array.isArray(b.bullet) ? b.bullet : [b.bullet];
                return `<ul class="acro-bullet-list" style="padding-left:1.25rem; margin:0.4rem 0;">${items.map(it => `<li style="margin:0.25rem 0;">${it}</li>`).join('')}</ul>`;
            }
            return '';
        }).join('');
    }

    window.renderAcrollyText = renderAcrollyText;
    window.renderAcrollyOption = cleanOption;
})(typeof window !== 'undefined' ? window : global);
