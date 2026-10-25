// ==================== SHARED CARD BUILDERS ====================
/* One place that knows how each question type is labelled and drawn, so
   practice mode, full-quiz mode and every re-render stay in sync. */
function buildExamBadge(q) {
    const examName = q.exam_name || q.exam_reference || '';
    if (!examName) return '';
    const isAdv = (q.exam_type && String(q.exam_type).toLowerCase().includes('advanced')) || String(examName).toUpperCase().includes('ADVANCED');
    const icon = isAdv ? '🔥' : '🎯';
    const tagClass = isAdv ? 'question-exam-tag advanced' : 'question-exam-tag mains';
    return `<span class="${tagClass}">${icon} ${escapeHtml(examName)}</span>`;
}

function getTypeLabel(q) {
    const t = (q.type || '').toLowerCase();
    if (t.includes('paragraph') || t.includes('comprehension')) return 'comprehension';
    if (t === 'multi_mcq' || t === 'multi' || t === 'multiple') return 'multi';
    if (t === 'integer' || t === 'numerical') return 'integer';
    if (t === 'fill_blank' || t === 'subjective' || t === 'notebook') return 'subjective';
    return 'single';
}

function formatQuizHeaderTitle(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    // 1. Lecture DPP (e.g. "DPP of Lec 8", "DPP on Lecture 08", "DPP 08 (Lecture 08)", "Lec 04 DPP")
    const mLec = s.match(/(?:dpp.*?lec(?:ture)?\s*[:#\-_]?\s*0*(\d+))|(?:lec(?:ture)?\s*[:#\-_]?\s*0*(\d+).*?dpp)/i);
    if (mLec) {
        const num = mLec[1] || mLec[2];
        return `DPP L${num}`;
    }
    // 2. DPP Number (e.g. "Basic Concepts and Institutions : DPP 01 || MCQ QUIZ", "DPP-02", "DPP 3")
    const mDpp = s.match(/\bdpp\s*[:#\-_]?\s*0*(\d+)/i);
    if (mDpp) {
        return `DPP ${mDpp[1]}`;
    }
    // 3. Plain DPP
    if (/\bdpp\b/i.test(s)) {
        return 'DPP';
    }
    return s;
}

function getActiveQuestionText(q) {
    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'hi' && q.translations && q.translations.hi && q.translations.hi.question) {
        return q.translations.hi.question;
    }
    return q.question || '';
}

function getActiveExplanationText(q) {
    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'hi' && q.translations && q.translations.hi && q.translations.hi.explanation) {
        return q.translations.hi.explanation;
    }
    return q.explanation || '';
}

function getActiveOptions(q) {
    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'hi' && q.translations && q.translations.hi && q.translations.hi.options && q.translations.hi.options.length) {
        return q.translations.hi.options;
    }
    return q.options || [];
}

function isImageInText(imgUrl, text) {
    if (!imgUrl || !text || typeof text !== 'string') return false;
    if (!text.includes('<img')) return false;
    if (text.includes(imgUrl)) return true;
    const cleanImg = String(imgUrl).replace(/^https?:\/\//i, '').split('?')[0].split('#')[0];
    if (text.includes(cleanImg)) return true;
    const segments = cleanImg.split('/');
    const filename = segments.pop();
    if (filename && filename.length >= 6 && text.includes(filename)) {
        return true;
    }
    return false;
}
window.isImageInText = isImageInText;

function getActiveQuestionImages(q) {
    let imgs = [];
    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'hi' && q.translations && q.translations.hi) {
        if (Array.isArray(q.translations.hi.images) && q.translations.hi.images.length > 0) {
            imgs = q.translations.hi.images;
        } else if (q.translations.hi.image_url || q.translations.hi.image) {
            imgs = [q.translations.hi.image_url || q.translations.hi.image];
        }
    }
    if (imgs.length === 0) {
        if (Array.isArray(q.images) && q.images.length > 0) {
            imgs = q.images;
        } else {
            const single = q.image_url || q.image || null;
            if (single) imgs = [single];
        }
    }
    const qText = getActiveQuestionText(q);
    if (!qText || !qText.includes('<img')) return imgs;
    return imgs.filter(img => !isImageInText(img, qText));
}

function getActiveQuestionImage(q) {
    const list = getActiveQuestionImages(q);
    return list.length > 0 ? list[0] : null;
}

function getActiveExplanationImages(q) {
    let imgs = [];
    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'hi' && q.translations && q.translations.hi) {
        if (Array.isArray(q.translations.hi.explanation_images) && q.translations.hi.explanation_images.length > 0) {
            imgs = q.translations.hi.explanation_images;
        } else if (q.translations.hi.explanation_image) {
            imgs = [q.translations.hi.explanation_image];
        }
    }
    if (imgs.length === 0) {
        if (Array.isArray(q.explanation_images) && q.explanation_images.length > 0) {
            imgs = q.explanation_images;
        } else if (q.explanation_image) {
            imgs = [q.explanation_image];
        }
    }
    const expText = getActiveExplanationText(q);
    if (!expText || !expText.includes('<img')) return imgs;
    return imgs.filter(img => !isImageInText(img, expText));
}

function getActiveExplanationImage(q) {
    const list = getActiveExplanationImages(q);
    return list.length > 0 ? list[0] : null;
}

function getActiveOptionImages(q) {
    if (typeof currentLanguage !== 'undefined' && currentLanguage === 'hi' && q.translations && q.translations.hi && q.translations.hi.optionImages && q.translations.hi.optionImages.length) {
        return q.translations.hi.optionImages;
    }
    return q.optionImages || [];
}

function isAcrollyContent(q) {
    if (!q) return false;
    if (q.id && (String(q.id).includes('acrolly') || String(q.id).includes('jee_mains_') || String(q.id).includes('jee_jee_'))) return true;
    if (q.exam_reference && String(q.exam_reference).startsWith('JEE_MAINS_')) return true;
    if (typeof currentFileName === 'string' && (currentFileName.includes('jee-chapterwise') || currentFileName.includes('jee-mains-tests'))) return true;
    return false;
}

function isPyqhubContent(q) {
    if (!q) return false;
    if (q.id && String(q.id).includes('pyqhub')) return true;
    if (typeof currentFileName === 'string' && currentFileName.includes('pyqhub')) return true;
    return false;
}

function renderSmartQuestionText(q) {
    const raw = getActiveQuestionText(q);
    if (!raw) return '';
    const fnAcro = typeof renderAcrollyText === 'function' ? renderAcrollyText : (typeof window !== 'undefined' ? window.renderAcrollyText : null);
    const fnPyq = typeof renderPyqhubText === 'function' ? renderPyqhubText : (typeof window !== 'undefined' ? window.renderPyqhubText : null);
    if (isAcrollyContent(q) && fnAcro) {
        return fnAcro(raw);
    }
    if (isPyqhubContent(q) && fnPyq) {
        return fnPyq(raw);
    }
    return safeHtml(raw);
}

function renderSmartExplanationText(q) {
    const raw = getActiveExplanationText(q);
    if (!raw) return '';
    const fnAcro = typeof renderAcrollyText === 'function' ? renderAcrollyText : (typeof window !== 'undefined' ? window.renderAcrollyText : null);
    const fnPyq = typeof renderPyqhubText === 'function' ? renderPyqhubText : (typeof window !== 'undefined' ? window.renderPyqhubText : null);
    if (isAcrollyContent(q) && fnAcro) {
        return fnAcro(raw);
    }
    if (isPyqhubContent(q) && fnPyq) {
        return fnPyq(raw);
    }
    return safeHtml(raw);
}

function renderSmartOptionText(q, opt) {
    if (!opt && opt !== 0) return '';
    const fnAcroOpt = typeof renderAcrollyOption === 'function' ? renderAcrollyOption : (typeof window !== 'undefined' ? window.renderAcrollyOption : null);
    const fnPyqOpt = typeof renderPyqhubOption === 'function' ? renderPyqhubOption : (typeof window !== 'undefined' ? window.renderPyqhubOption : null);
    if (isAcrollyContent(q) && fnAcroOpt) {
        const cleaned = fnAcroOpt(opt);
        return safeHtml(cleaned);
    }
    if (isPyqhubContent(q) && fnPyqOpt) {
        const cleaned = fnPyqOpt(opt);
        return safeHtml(cleaned);
    }
    return safeHtml(opt);
}

window.renderSmartQuestionText = renderSmartQuestionText;
window.renderSmartExplanationText = renderSmartExplanationText;
window.renderSmartOptionText = renderSmartOptionText;
window.getActiveQuestionText = getActiveQuestionText;
window.getActiveExplanationText = getActiveExplanationText;
window.getActiveOptions = getActiveOptions;
window.getActiveQuestionImage = getActiveQuestionImage;
window.getActiveQuestionImages = getActiveQuestionImages;
window.getActiveExplanationImage = getActiveExplanationImage;
window.getActiveExplanationImages = getActiveExplanationImages;
window.getActiveOptionImages = getActiveOptionImages;

function buildQuestionBody(q, idx) {
    if (q.type === 'image_mcq') return renderImageMCQ(q, idx);
    if (q.type === 'integer' || q.type === 'paragraph_integer') return renderInteger(q, idx);
    if (q.type === 'mcq' || q.type === 'multi_mcq' || q.type === 'paragraph_mcq') return renderMCQ(q, idx);
    return renderFillBlank(q, idx); // fill_blank / untyped
}

/* Inner HTML of a question card (everything inside .question-card). */
function buildQuestionCardInner(q, idx, total) {
    const inBookmarkMode = currentMode === 'bookmark';
    const isBookmarked = inBookmarkMode
        ? (typeof isQuestionBookmarked === 'function' && q.origChapterId ? isQuestionBookmarked(q.origChapterId, q.origIndex) : true)
        : ((typeof isQuestionBookmarked === 'function' && currentChapter) ? isQuestionBookmarked(currentChapter.id, idx) : false);
    const bookmarkAction = inBookmarkMode ? `removeFromBookmarkFolder(${idx})` : `toggleBookmark(${idx})`;
    const bookmarkTitle = inBookmarkMode
        ? (isBookmarked ? 'Remove from this folder' : 'Bookmark this question')
        : (isBookmarked ? 'Bookmarked' : 'Bookmark this question');
    const displayNumber = q.originalNumber || (idx + 1);
    const questionLabel = `Q. ${displayNumber}`;

    const topicLabel = q.subtopic || q.sub_category || q.topicName || q.topic || (currentChapter ? currentChapter.name : '');
    const examBadge = buildExamBadge(q);
    const qText = getActiveQuestionText(q);
    const qImages = getActiveQuestionImages(q);
    const hasHi = Boolean(q.translations && q.translations.hi);

    return `
        <div class="question-card-header">
            <div class="question-meta-group">
                <span class="question-number">${questionLabel}</span>
                <span class="meta-dot">·</span>
                <span class="type-badge">${getTypeLabel(q)}</span>
                ${topicLabel ? `<span class="meta-dot">·</span><span class="question-topic-tag" title="${escapeHtml(topicLabel)}">📂 ${escapeHtml(topicLabel)}</span>` : ''}
                ${examBadge}
            </div>
            <div class="question-card-top-actions">
                <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="${bookmarkAction}" title="${bookmarkTitle}">
                    🔖
                </button>
            </div>
        </div>
        ${q.passage ? `
            <div class="common-passage-box" style="background:var(--bg-secondary); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:8px; padding:1rem; margin-bottom:1rem;">
                <div style="font-weight:700; font-size:0.85rem; color:var(--accent); margin-bottom:0.4rem; display:flex; align-items:center; gap:0.4rem;">
                    <span>📖</span><span>Common Comprehension Passage</span>
                </div>
                <div style="line-height:1.6; font-size:0.95rem;">${renderSmartQuestionText({question: q.passage, id: q.id})}</div>
            </div>
        ` : ''}
        ${qText ? `<div class="question-text">${renderSmartQuestionText(q)}</div>` : ''}
        ${qImages.length > 1 ? `
            <div class="q-images-container" style="display:flex;flex-direction:column;gap:0.75rem;margin:0.75rem 0;">
                ${qImages.map((img, i) => `
                    <div class="image-question-wrap">
                        <img src="${img}" class="question-image" alt="Question Diagram ${i + 1}" loading="lazy" data-original-url="${img}" onerror="handleImageError(this)">
                    </div>
                `).join('')}
            </div>
        ` : (qImages.length === 1 && q.type !== 'image_mcq' ? `
            <div class="image-question-wrap">
                <img src="${qImages[0]}" class="question-image" alt="Question Diagram" loading="lazy" data-original-url="${qImages[0]}" onerror="handleImageError(this)">
            </div>
        ` : '')}
        ${q.matchLists ? buildMatchLists(q.matchLists) : ''}
        ${buildQuestionBody(q, idx)}
    `;
}
window.buildQuestionCardInner = buildQuestionCardInner;

/* Renders a reconstructed "List-I / List-II" matching table
   matching textbook / exam styling with borders and label cells. */
function buildMatchLists(matchLists) {
    if (!matchLists) return '';
    const listI = matchLists.listI || { title: 'Column I', items: [] };
    const listII = matchLists.listII || { title: 'Column II', items: [] };
    const itemsI = listI.items || [];
    const itemsII = listII.items || [];
    const maxLen = Math.max(itemsI.length, itemsII.length);
    if (maxLen === 0) return '';

    // If either column has no content across all rows, do not draw a broken/empty table
    const hasAnyI = itemsI.some(it => Boolean(it && ((it.text && it.text.trim()) || (it.title && it.title.trim()) || it.image_url || it.image || it.imageUrl)));
    const hasAnyII = itemsII.some(it => Boolean(it && ((it.text && it.text.trim()) || (it.title && it.title.trim()) || it.image_url || it.image || it.imageUrl)));
    if (!hasAnyI || !hasAnyII) return '';

    const defaultLabelsI = ['A', 'B', 'C', 'D', 'E', 'F'];
    const defaultLabelsII = ['p', 'q', 'r', 's', 't', 'u'];

    function formatLabel(lbl, defaultVal) {
        let raw = String(lbl || defaultVal || '').trim();
        if (!raw) return '';
        if (raw.startsWith('(') && raw.endsWith(')')) return raw;
        return `(${raw})`;
    }

    let rowsHtml = '';
    for (let i = 0; i < maxLen; i++) {
        const itI = itemsI[i];
        const itII = itemsII[i];
        const hasContentI = Boolean(itI && ((itI.text && itI.text.trim()) || (itI.title && itI.title.trim()) || itI.image_url || itI.image || itI.imageUrl));
        const labelI = hasContentI ? formatLabel(itI.label || itI.key, defaultLabelsI[i]) : '';
        const textI = itI ? (itI.text || itI.title || '') : '';
        const imgI = itI ? resolveImageUrl(itI.image_url || itI.image || itI.imageUrl || null) : null;

        const hasContentII = Boolean(itII && ((itII.text && itII.text.trim()) || (itII.title && itII.title.trim()) || itII.image_url || itII.image || itII.imageUrl));
        const labelII = hasContentII ? formatLabel(itII.label || itII.key, defaultLabelsII[i]) : '';
        const textII = itII ? (itII.text || itII.title || '') : '';
        const imgII = itII ? resolveImageUrl(itII.image_url || itII.image || itII.imageUrl || null) : null;

        rowsHtml += `
            <tr>
                <td class="match-col-label">${escapeHtml(labelI)}</td>
                <td class="match-col-content">
                    ${imgI ? `<div class="match-item-img-wrap"><img src="${imgI}" class="match-item-img" alt="Diagram ${escapeHtml(labelI)}" loading="lazy"></div>` : ''}
                    ${textI ? `<div class="match-item-text">${safeHtml(textI)}</div>` : ''}
                </td>
                <td class="match-col-label">${escapeHtml(labelII)}</td>
                <td class="match-col-content">
                    ${imgII ? `<div class="match-item-img-wrap"><img src="${imgII}" class="match-item-img" alt="Diagram ${escapeHtml(labelII)}" loading="lazy"></div>` : ''}
                    ${textII ? `<div class="match-item-text">${safeHtml(textII)}</div>` : ''}
                </td>
            </tr>
        `;
    }

    return `
        <div class="match-table-wrap">
            <table class="match-table">
                <thead>
                    <tr>
                        <th colspan="2" class="match-th">${escapeHtml(listI.title || 'Column I')}</th>
                        <th colspan="2" class="match-th">${escapeHtml(listII.title || 'Column II')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

function renderVideoFacade(video, id) {
    if (!video || (!video.embed_url && !video.url)) return '';
    let embedUrl = video.embed_url || '';
    if (!embedUrl && video.url) {
        const m = String(video.url).match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        embedUrl = m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : video.url;
    }
    const thumb = video.thumbnail || (video.image || '');
    const duration = video.duration ? `<span class="solution-video-time-tag">⏱ ${escapeHtml(video.duration)}</span>` : '';
    const vId = 'video-container-' + String(id || Math.random()).replace(/[^a-zA-Z0-9_-]/g, '_');

    return `
        <div class="solution-video-card" id="${vId}">
            <div class="solution-video-facade" onclick="playSolutionVideo('${vId}', '${escapeHtmlAttr(embedUrl)}')">
                ${thumb ? `<img src="${escapeHtmlAttr(thumb)}" alt="Video Solution" class="solution-video-thumb" loading="lazy">` : ''}
                <div class="solution-video-play-btn" title="Click to play video solution">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" style="margin-left: 2px;">
                        <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z"/>
                    </svg>
                </div>
                ${duration}
            </div>
            <div class="solution-video-bar" onclick="playSolutionVideo('${vId}', '${escapeHtmlAttr(embedUrl)}')">
                <div class="solution-video-bar-left">
                    <span class="solution-video-bar-icon">▶</span>
                    <span class="solution-video-bar-title">Watch Video Solution</span>
                </div>
                <span class="solution-video-bar-hint">Plays right here</span>
            </div>
        </div>
    `;
}

function playSolutionVideo(containerId, embedUrl) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const sep = embedUrl.includes('?') ? '&' : '?';
    const autoplayUrl = embedUrl + sep + 'autoplay=1&rel=0';
    container.innerHTML = `
        <div class="solution-video-iframe-wrap">
            <iframe src="${autoplayUrl}" 
                    title="Video Solution" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
            </iframe>
        </div>
    `;
}
window.playSolutionVideo = playSolutionVideo;
window.renderVideoFacade = renderVideoFacade;

function renderExplanationBlock(q, revealed) {
    const expText = getActiveExplanationText(q);
    const expImages = getActiveExplanationImages(q);
    const hasVideo = Boolean(q.video && (q.video.embed_url || q.video.url));
    if (!expText && expImages.length === 0 && !hasVideo) return '';
    return `
        <div class="explanation-box ${revealed ? 'show' : ''}">
            <h4>💡 Explanation</h4>
            ${expText ? `<div class="explanation-text" style="line-height: 1.7; margin-top: 0.5rem;">${renderSmartExplanationText(q)}</div>` : ''}
            ${expImages.length > 1 ? `
                <div class="exp-images-container" style="display:flex;flex-direction:column;gap:0.75rem;margin:0.75rem 0;">
                    ${expImages.map((img, i) => `
                        <img class="explanation-img" src="${img}" alt="Explanation Diagram ${i + 1}" loading="lazy" data-original-url="${img}" onerror="handleImageError(this)">
                    `).join('')}
                </div>
            ` : (expImages.length === 1 ? `
                <img class="explanation-img" src="${expImages[0]}" alt="Explanation Diagram" loading="lazy" data-original-url="${expImages[0]}" onerror="handleImageError(this)">
            ` : '')}
            ${hasVideo ? renderVideoFacade(q.video, q.id) : ''}
        </div>
    `;
}

function typesetMath(el) {
    if (!el) return;
    if (typeof window !== 'undefined' && typeof window.typesetMath === 'function' && window.typesetMath !== typesetMath) {
        return window.typesetMath(el);
    }
    if (typeof window !== 'undefined' && window.MathJax && window.MathJax.typesetPromise) {
        if (window.MathJax.typesetClear) {
            try { window.MathJax.typesetClear([el]); } catch (e) { /* ignore */ }
        }
        return window.MathJax.typesetPromise([el]).catch(err => console.warn('MathJax error:', err));
    }
}
window.typesetMath = typesetMath;

/* Redraw a single card wherever it currently lives (practice or full quiz). */
function refreshQuestionCard(idx) {
    const card = (typeof getQuestionCardElement === 'function')
        ? getQuestionCardElement(idx)
        : document.getElementById(`fullQ-${idx}`);
    if (!card) return;
    card.innerHTML = buildQuestionCardInner(questions[idx], idx, questions.length);
    typesetMath(card);
    loadOfflineImagesInContainer(card);

    // Revealing an answer is progress worth remembering.
    if (typeof recordStudySession === 'function') recordStudySession();
}

// ==================== QUESTION RENDERING ====================
function renderQuestion() {
    const q = questions[currentQIndex];
    const container = document.getElementById('quizContainer');
    const total = questions.length;

    document.getElementById('quizProgress').textContent = `${currentQIndex + 1} / ${total}`;
    document.getElementById('progressFill').style.width = `${((currentQIndex + 1) / total) * 100}%`;
    document.getElementById('quizChapterTitle').textContent = currentChapter ? formatQuizHeaderTitle(currentChapter.name) : '';
    document.getElementById('quizTopicName').textContent = q.topicName || '';
    if (typeof updateHeaderLangPills === 'function') updateHeaderLangPills();

    document.getElementById('btnPrev').disabled = currentQIndex === 0;
    const nextInfo = typeof getNextTopicInfo === 'function' ? getNextTopicInfo() : null;
    const isLast = currentQIndex === total - 1;
    if (isLast) {
        document.getElementById('btnNext').textContent = nextInfo ? `Next: ${nextInfo.name} →` : 'Finish →';
    } else {
        document.getElementById('btnNext').textContent = 'Next →';
    }

    container.innerHTML = `
        <div class="question-card">
            ${buildQuestionCardInner(q, currentQIndex, total)}
        </div>
        ${isLast ? buildContinuePanel(nextInfo) : ''}
    `;

    typesetMath(container);
    loadOfflineImagesInContainer(container);

    if (typeof recordStudySession === 'function') recordStudySession();
    if (typeof renderQuestionGrid === 'function') renderQuestionGrid();
}

/* Shown on the last question so the user can jump straight into the next
   topic (or next chapter) without going back through the menus. */
function buildContinuePanel(nextInfo) {
    if (!nextInfo) {
        return `
            <div class="continue-panel">
                <h3>That was the last question! 🎉</h3>
                <p>Nothing left in this set — see how you did.</p>
                <div class="continue-actions">
                    <button class="btn btn-primary" onclick="showResults()">📊 Show Results</button>
                </div>
            </div>
        `;
    }
    const kind = nextInfo.type === 'chapter' ? 'Next chapter' : 'Next topic';
    const meta = nextInfo.type === 'topic' && nextInfo.count
        ? `<span class="continue-count">${nextInfo.count} questions</span>`
        : '';
    return `
        <div class="continue-panel">
            <h3>Set complete! 🎉</h3>
            <p>${kind}: <strong>${escapeHtml(nextInfo.name)}</strong> ${meta}</p>
            <div class="continue-actions">
                <button class="btn btn-primary" onclick="loadNextTopicOrChapter()">➡️ Continue to ${escapeHtml(nextInfo.name)}</button>
                <button class="btn btn-ghost" onclick="showResults()">📊 Show Results</button>
            </div>
        </div>
    `;
}

// ==================== IMAGE MCQ RENDERING ====================
function renderImageMCQ(q, idx) {
    const saved = userAnswers[idx];
    const selected = saved && saved.selected !== undefined ? [saved.selected] : [];
    const revealed = saved && saved.revealed;
    const qImages = getActiveQuestionImages(q);
    const mainImg = qImages[0] || q.image_url || '';

    return `
        ${qImages.length > 1 ? `
            <div class="q-images-container" style="display:flex;flex-direction:column;gap:0.75rem;margin:0.75rem 0;">
                ${qImages.map((img, i) => `
                    <div class="image-question-wrap">
                        <img src="${img}" class="question-image" alt="Question ${idx + 1} Diagram ${i + 1}" loading="lazy" data-original-url="${img}" onerror="handleImageError(this)">
                    </div>
                `).join('')}
            </div>
        ` : (mainImg ? `
            <div class="image-question-wrap">
                <img src="${mainImg}" class="question-image" alt="Question ${idx + 1}" loading="lazy" data-original-url="${mainImg}" onerror="handleImageError(this)">
            </div>
        ` : '')}
        ${buildOptionList(q, idx, {
            selected, revealed,
            handler: 'selectImageMCQ',
            containerId: `imgMcqOptions-${idx}`
        })}
        <button class="show-answer-btn ${revealed ? 'revealed' : ''}"
                onclick="revealImageAnswer(${idx})" 
                id="imgMcqBtn-${idx}">
            ${revealed ? '✅ Answer Revealed' : '💡 Show Answer'}
        </button>
        ${renderExplanationBlock(q, revealed)}
    `;
}

function updateCardInCurrentMode(idx) {
    /* Use the surgical in-place reveal if the function exists (loaded from
       quiz-interact.js).  Falls back to the old full-rebuild approach. */
    if (typeof _applyRevealInPlace === 'function') {
        _applyRevealInPlace(idx);
    } else if (currentMode === 'fullquiz') {
        refreshQuestionCard(idx);
    } else {
        renderQuestion();
    }
}

function selectImageMCQ(idx, optIdx) {
    const q = questions[idx];
    if (!userAnswers[idx]) userAnswers[idx] = {};
    if (userAnswers[idx].revealed) return;

    userAnswers[idx].selected = optIdx;
    userAnswers[idx].type = 'image_mcq';
    userAnswers[idx].correct = (optIdx === q.correct);
    userAnswers[idx].revealed = true;

    updateCardInCurrentMode(idx);
}

function revealImageAnswer(idx) {
    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].revealed = true;
    updateCardInCurrentMode(idx);
}

function handleImageError(img) {
    if (!img || img.dataset.hasFailed) return;
    const originalUrl = img.dataset.originalUrl || img.src;
    if (typeof offlineStorage !== 'undefined') {
        offlineStorage.getOfflineImageUrl(originalUrl).then(offlineUrl => {
            if (offlineUrl && offlineUrl !== originalUrl && offlineUrl !== img.src) {
                img.dataset.hasFailed = '1';
                img.src = offlineUrl;
            } else {
                img.dataset.hasFailed = '1';
                img.alt = 'Image unavailable offline';
                img.style.minHeight = '70px';
                if (img.parentElement && !img.parentElement.querySelector('.image-offline-placeholder')) {
                    img.parentElement.innerHTML = `
                        <div class="image-offline-placeholder">
                            📷 Diagram not downloaded
                            <span>Download this topic for offline access</span>
                        </div>
                    `;
                }
            }
        }).catch(() => { img.dataset.hasFailed = '1'; });
    }
}

async function loadOfflineImagesInContainer(container) {
    if (!container || typeof offlineStorage === 'undefined') return;
    const images = container.querySelectorAll('img[data-original-url], img.question-image, img.explanation-img, img.mcq-opt-image');
    for (const img of images) {
        const url = img.dataset.originalUrl || img.getAttribute('src');
        if (!url || url.startsWith('blob:') || url.startsWith('data:')) continue;
        try {
            const offlineUrl = await offlineStorage.getOfflineImageUrl(url);
            if (offlineUrl && offlineUrl !== url && offlineUrl !== img.src) {
                img.src = offlineUrl;
            }
        } catch (e) { /* ignore */ }
    }
}

// ==================== FILL IN THE BLANK ====================
function renderFillBlank(q, idx) {
    const saved = userAnswers[idx];
    const revealed = saved && saved.revealed;

    return `
        <button class="show-answer-btn ${revealed ? 'revealed' : ''}" 
                onclick="revealAnswer(${idx})" 
                id="fibBtn-${idx}">
            ${revealed ? '✅ Answer Revealed' : '💡 Show Answer'}
        </button>
        <div class="fib-answer-box ${revealed ? 'show' : ''}" id="fibAnswer-${idx}">
            <div class="fib-answer-label">Answer</div>
            <div class="fib-answer-text">${escapeHtml(q.answer)}</div>
        </div>
        ${renderExplanationBlock(q, revealed)}
    `;
}

// ==================== INTEGER TYPE ====================
function renderInteger(q, idx) {
    const saved = userAnswers[idx];
    const hasAnswer = saved && saved.userAnswer !== undefined;
    const revealed = saved && saved.revealed;

    let feedbackHTML = '';
    if (hasAnswer && !revealed) {
        const isCorrect = saved.userAnswer.trim().toLowerCase() === String(q.answer).trim().toLowerCase();
        feedbackHTML = `
            <div class="int-feedback ${isCorrect ? 'correct' : 'wrong'}" id="intFeedback-${idx}">
                ${isCorrect ? '✅ Correct!' : '❌ Incorrect. Try again or reveal answer.'}
            </div>
        `;
    }

    return `
        <div class="int-input-wrap">
            <input type="text" 
                   class="int-input" 
                   placeholder="Type your answer..." 
                   id="intInput-${idx}"
                   value="${hasAnswer ? escapeHtml(saved.userAnswer) : ''}"
                   onkeypress="if(event.key==='Enter')checkInteger(${idx})">
            <button class="int-check-btn" onclick="checkInteger(${idx})">Check</button>
        </div>
        ${feedbackHTML}
        <button class="show-answer-btn ${revealed ? 'revealed' : ''}" 
                onclick="revealAnswer(${idx})" 
                id="intShowBtn-${idx}">
            ${revealed ? '✅ Answer Revealed' : '💡 Show Answer'}
        </button>
        <div class="fib-answer-box ${revealed ? 'show' : ''}" id="intAnswer-${idx}">
            <div class="fib-answer-label">Correct Answer</div>
            <div class="fib-answer-text">${escapeHtml(q.answer)}</div>
        </div>
        ${renderExplanationBlock(q, revealed)}
    `;
}

// ==================== MCQ RENDERING ====================
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/* The single source of truth for what one option row looks like, shared by every
   question type and by both practice and test mode. It mirrors Test Cafe's
   `.opt` markup exactly (circular key, text, optional image, reveal flag), so an
   image question with placeholder options reads as "A / B / C / D" in the
   Question Cafe just like it does in the Test Cafe — no separate 4-box grid.

   `revealed` is false in test mode, which is what keeps the grading colours and
   flags off screen while the test is running. */
function buildOptionList(q, idx, { selected = [], revealed = false, isMulti = false, handler = 'selectMCQ', containerId, readOnly = false }) {
    /* An image-only question still needs four clickable rows — same fallback the
       Test Cafe engine applies. The blank labels render as "Option 1..4". */
    let options = getActiveOptions(q);
    if (options.length === 0 && q.type === 'image_mcq') options = ['', '', '', ''];

    const rows = options.map((opt, i) => {
        const isChosen = selected.includes(i);
        let stateCls = '';
        let flag = '';

        if (isChosen) stateCls += ' selected';
        if (revealed) {
            const isCorrect = isCorrectOption(q, i);
            if (isCorrect && isChosen) {
                stateCls += ' correct';
                flag = 'Correct (Marked By You)';
            } else if (isCorrect) {
                stateCls += ' correct';
                flag = 'Correct (Not Marked By You)';
            } else if (isChosen) {
                stateCls += ' wrong';
                flag = 'Incorrect (Marked By You)';
            }
            if (isMulti && isChosen && isCorrect && !allCorrectSelected(q, selected)) {
                stateCls += ' partial';
            }
        }

        const key = OPTION_LETTERS[i] || (i + 1);
        const optImages = getActiveOptionImages(q);
        const optImg = optImages && optImages[i]
            ? `<img class="mcq-opt-image" src="${optImages[i]}" alt="Option ${key}" loading="lazy" data-original-url="${optImages[i]}" onerror="handleImageError(this)">`
            : '';
        const label = opt && String(opt).trim() !== ''
            ? renderSmartOptionText(q, opt)
            : (optImg ? '' : `Option ${i + 1}`);

        return `
            <div class="mcq-option${stateCls}${readOnly ? ' read-only' : ''}"${readOnly ? '' : ` onclick="${handler}(${idx}, ${i})"`}>
                <div class="mcq-letter">${key}</div>
                <div class="mcq-text">
                    ${label ? `<span class="mcq-opt-text">${label}</span>` : ''}
                    ${optImg}
                    ${flag ? `<div class="mcq-flag">${flag}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    return `<div class="mcq-options" id="${containerId}">${rows}</div>`;
}

function renderMCQ(q, idx) {
    const saved = userAnswers[idx];
    const isMulti = q.type === 'multi_mcq';
    const selected = saved ? (isMulti ? (saved.selected || []) : (saved.selected !== undefined ? [saved.selected] : [])) : [];
    const revealed = saved && saved.revealed;

    let submitHTML = '';
    if (isMulti && !revealed) {
        const count = selected.length;
        submitHTML = `
            <div class="multi-selected-count" id="multiCount-${idx}">${count} option${count !== 1 ? 's' : ''} selected</div>
            <button class="multi-submit-btn" id="multiSubmit-${idx}" onclick="submitMultiMCQ(${idx})" ${count === 0 ? 'disabled' : ''}>
                ✅ Submit Answer
            </button>
        `;
    }

    return `
        ${buildOptionList(q, idx, {
            selected, revealed, isMulti,
            handler: 'selectMCQ',
            containerId: `mcqOptions-${idx}`
        })}
        ${submitHTML}
        <button class="show-answer-btn ${revealed ? 'revealed' : ''}" 
                onclick="revealAnswer(${idx})" 
                id="mcqBtn-${idx}">
            ${revealed ? '✅ Answer Revealed' : '💡 Show Answer'}
        </button>
        ${renderExplanationBlock(q, revealed)}
    `;
}

function isCorrectOption(q, index) {
    if (q.type === 'multi_mcq') {
        return q.correct && q.correct.includes(index);
    }
    return q.correct === index;
}

function allCorrectSelected(q, selected) {
    if (q.type !== 'multi_mcq' || !q.correct) return false;
    const correctSet = new Set(q.correct);
    const selectedSet = new Set(selected);
    return correctSet.size === selectedSet.size && [...correctSet].every(x => selectedSet.has(x));
}

// ==================== FULL QUIZ MODE ====================
function renderFullQuiz() {
    const container = document.getElementById('fullQuizContainer');
    const total = questions.length;

    const topicNames = [...new Set(questions.map(q => q.topicName).filter(Boolean))];

    document.getElementById('fullQuizTitle').textContent = currentChapter ? formatQuizHeaderTitle(currentChapter.name) : '';
    const topicEl = document.getElementById('fullQuizTopicName');
    if (topicEl) {
        topicEl.textContent = topicNames.length === 1
            ? topicNames[0]
            : (topicNames.length > 1 ? `${topicNames.length} topics` : '');
    }
    document.getElementById('fullQuizProgress').textContent = `${total} Questions`;
    document.getElementById('fullProgressFill').style.width = '100%';

    container.innerHTML = questions.map((q, idx) => `
        <div class="question-card" id="fullQ-${idx}">
            ${buildQuestionCardInner(q, idx, total)}
        </div>
    `).join('');

    const nextInfo = typeof getNextTopicInfo === 'function' ? getNextTopicInfo() : null;
    container.insertAdjacentHTML('beforeend', buildContinuePanel(nextInfo));

    typesetMath(container);
    loadOfflineImagesInContainer(container);

    if (typeof recordStudySession === 'function') recordStudySession();
}

function scrollToNext() {
    const cards = document.querySelectorAll('.full-quiz-container .question-card');
    const scrollPos = window.scrollY + 150;
    for (let card of cards) {
        if (card.offsetTop > scrollPos) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
    }
}

function scrollToPrev() {
    const cards = Array.from(document.querySelectorAll('.full-quiz-container .question-card'));
    const scrollPos = window.scrollY - 100;
    for (let i = cards.length - 1; i >= 0; i--) {
        if (cards[i].offsetTop < scrollPos) {
            cards[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
    }
}
