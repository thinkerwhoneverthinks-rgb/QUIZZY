// ==================== SHARED CARD BUILDERS ====================
/* One place that knows how each question type is labelled and drawn, so
   practice mode, full-quiz mode and every re-render stay in sync. */
function getTypeLabel(q) {
    if (q.type === 'image_mcq') return 'Image MCQ';
    if (q.type === 'integer') return 'Integer Type';
    if (q.type === 'multi_mcq') return 'Multiple Correct MCQ';
    if (q.type === 'mcq') return 'Single Correct MCQ';
    return 'Fill in the Blank';
}

function buildQuestionBody(q, idx) {
    if (q.type === 'image_mcq') return renderImageMCQ(q, idx);
    if (q.type === 'integer') return renderInteger(q, idx);
    if (q.type === 'mcq' || q.type === 'multi_mcq') return renderMCQ(q, idx);
    return renderFillBlank(q, idx); // fill_blank / untyped
}

/* Inner HTML of a question card (everything inside .question-card). */
function buildQuestionCardInner(q, idx, total) {
    const isBookmarked = (typeof isQuestionBookmarked === 'function' && currentChapter)
        ? isQuestionBookmarked(currentChapter.id, idx)
        : false;

    return `
        <div class="question-card-header">
            <div class="type-badge">● ${getTypeLabel(q)}</div>
            <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark(${idx})" title="Bookmark this question">
                ${isBookmarked ? '🔖' : '📑'}
            </button>
        </div>
        <div class="question-number">Question ${idx + 1} of ${total}</div>
        ${q.topicName ? `<div class="question-topic-tag">📂 ${escapeHtml(q.topicName)}</div>` : ''}
        ${q.question ? `<div class="question-text">${escapeHtml(q.question)}</div>` : ''}
        ${q.image_url && q.type !== 'image_mcq' ? `
            <div class="image-question-wrap">
                <img src="${q.image_url}" class="question-image" alt="Question Diagram" loading="lazy" data-original-url="${q.image_url}" onerror="handleImageError(this)">
            </div>
        ` : ''}
        ${buildQuestionBody(q, idx)}
    `;
}

function typesetMath(el) {
    if (!el) return;
    setTimeout(() => {
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(el, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\[', right: '\\]', display: true},
                    {left: '\\(', right: '\\)', display: false}
                ],
                throwOnError: false
            });
        }
    }, 50);
}

/* Redraw a single card wherever it currently lives (practice or full quiz). */
function refreshQuestionCard(idx) {
    const card = (typeof getQuestionCardElement === 'function')
        ? getQuestionCardElement(idx)
        : document.getElementById(`fullQ-${idx}`);
    if (!card) return;
    card.innerHTML = buildQuestionCardInner(questions[idx], idx, questions.length);
    typesetMath(card);
    loadOfflineImagesInContainer(card);
}

// ==================== QUESTION RENDERING ====================
function renderQuestion() {
    const q = questions[currentQIndex];
    const container = document.getElementById('quizContainer');
    const total = questions.length;

    document.getElementById('quizProgress').textContent = `${currentQIndex + 1} / ${total}`;
    document.getElementById('progressFill').style.width = `${((currentQIndex + 1) / total) * 100}%`;
    document.getElementById('quizChapterTitle').textContent = currentChapter ? currentChapter.name : '';
    document.getElementById('quizTopicName').textContent = q.topicName || '';

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

    return `
        <div class="image-question-wrap">
            <img src="${q.image_url}" 
                 class="question-image" 
                 alt="Question ${idx + 1}" 
                 loading="lazy"
                 data-original-url="${q.image_url}"
                 onerror="handleImageError(this)">
        </div>
        <div class="image-mcq-options" id="imgMcqOptions-${idx}">
            ${[1, 2, 3, 4].map(num => {
                const optIdx = num - 1;
                let cls = 'image-mcq-option';
                if (selected.includes(optIdx)) cls += ' selected';
                if (revealed && optIdx === q.correct) cls += ' correct';
                if (revealed && selected.includes(optIdx) && optIdx !== q.correct) cls += ' wrong';
                return `
                    <div class="${cls}" onclick="selectImageMCQ(${idx}, ${optIdx})">
                        <span class="image-mcq-num">${num}</span>
                    </div>
                `;
            }).join('')}
        </div>
        <button class="show-answer-btn ${revealed ? 'revealed' : ''}" 
                onclick="revealImageAnswer(${idx})" 
                id="imgMcqBtn-${idx}">
            ${revealed ? '✅ Answer Revealed' : '💡 Show Answer'}
        </button>
    `;
}

function updateCardInCurrentMode(idx) {
    if (currentMode === 'fullquiz') {
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
    // Try to load from IndexedDB
    const originalUrl = img.dataset.originalUrl || img.src;
    offlineStorage.getOfflineImageUrl(originalUrl).then(offlineUrl => {
        if (offlineUrl !== originalUrl) {
            img.src = offlineUrl;
        } else {
            img.alt = 'Image unavailable offline';
            img.style.minHeight = '100px';
            img.style.display = 'flex';
            img.style.alignItems = 'center';
            img.style.justifyContent = 'center';
            img.parentElement.innerHTML = `
                <div class="image-offline-placeholder">
                    📷 Image not available offline
                    <span>Download this topic for offline access</span>
                </div>
            `;
        }
    });
}

async function loadOfflineImagesInContainer(container) {
    if (navigator.onLine) return; // Only needed when offline
    
    const images = container.querySelectorAll('img[data-original-url]');
    for (const img of images) {
        const url = img.dataset.originalUrl;
        try {
            const offlineUrl = await offlineStorage.getOfflineImageUrl(url);
            if (offlineUrl !== url) {
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
        ${q.explanation ? `
        <div class="explanation-box ${revealed ? 'show' : ''}" id="fibExplain-${idx}">
            <h4>Explanation</h4>
            <p>${escapeHtml(q.explanation)}</p>
        </div>` : ''}
    `;
}

// ==================== INTEGER TYPE ====================
function renderInteger(q, idx) {
    const saved = userAnswers[idx];
    const hasAnswer = saved && saved.userAnswer !== undefined;
    const revealed = saved && saved.revealed;

    let feedbackHTML = '';
    if (hasAnswer && !revealed) {
        const isCorrect = saved.userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
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
        ${q.explanation ? `
        <div class="explanation-box ${revealed ? 'show' : ''}" id="intExplain-${idx}">
            <h4>Explanation</h4>
            <p>${escapeHtml(q.explanation)}</p>
        </div>` : ''}
    `;
}

// ==================== MCQ RENDERING ====================
function renderMCQ(q, idx) {
    const saved = userAnswers[idx];
    const isMulti = q.type === 'multi_mcq';
    const selected = saved ? (isMulti ? (saved.selected || []) : (saved.selected !== undefined ? [saved.selected] : [])) : [];
    const revealed = saved && saved.revealed;
    const letters = ['A', 'B', 'C', 'D', 'E'];

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
        <div class="mcq-options" id="mcqOptions-${idx}">
            ${q.options.map((opt, i) => `
                <div class="mcq-option ${selected.includes(i) ? 'selected' : ''} ${revealed && isCorrectOption(q, i) ? 'correct' : ''} ${revealed && selected.includes(i) && !isCorrectOption(q, i) ? 'wrong' : ''} ${revealed && isMulti && selected.includes(i) && isCorrectOption(q, i) && !allCorrectSelected(q, selected) ? 'partial' : ''}" 
                     onclick="selectMCQ(${idx}, ${i})">
                    <div class="mcq-letter">${letters[i]}</div>
                    <div class="mcq-text">${escapeHtml(opt)}</div>
                </div>
            `).join('')}
        </div>
        ${submitHTML}
        <button class="show-answer-btn ${revealed ? 'revealed' : ''}" 
                onclick="revealAnswer(${idx})" 
                id="mcqBtn-${idx}">
            ${revealed ? '✅ Answer Revealed' : '💡 Show Answer'}
        </button>
        ${q.explanation ? `
        <div class="explanation-box ${revealed ? 'show' : ''}" id="mcqExplain-${idx}">
            <h4>Explanation</h4>
            <p>${escapeHtml(q.explanation)}</p>
        </div>` : ''}
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

    document.getElementById('fullQuizTitle').textContent = currentChapter ? currentChapter.name : '';
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
