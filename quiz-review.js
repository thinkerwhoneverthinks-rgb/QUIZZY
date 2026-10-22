// ==================== RESULTS ====================
/* Tri-state per-question grading, shared by showResults() and the question grid
   (renderQuestionGrid() in quiz-screens.js) so the two never drift out of sync. */
function getAnswerStatus(idx) {
    const q = questions[idx];
    const ans = userAnswers[idx];
    if (!q || !ans) return 'skipped';

    if (q.type === 'image_mcq') {
        if (ans.selected !== undefined) return ans.selected === q.correct ? 'correct' : 'wrong';
        return 'skipped';
    }
    if (q.type === 'mcq' || q.type === 'multi_mcq') {
        if (!ans.revealed && currentMode !== 'test') return 'skipped';
        if (q.type === 'multi_mcq') {
            return allCorrectSelected(q, ans.selected || []) ? 'correct' : 'wrong';
        }
        return ans.correct ? 'correct' : 'wrong';
    }
    if (q.type === 'integer') {
        if (!ans.revealed && currentMode !== 'test') return 'skipped';
        const isCorrect = !!(ans.userAnswer && q.answer && ans.userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase());
        return isCorrect ? 'correct' : 'wrong';
    }
    // fill_blank / untyped
    if (currentMode === 'test') {
        if (!ans.userAnswer || !ans.userAnswer.trim()) return 'skipped';
        const isCorrect = !!(q.answer && ans.userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase());
        return isCorrect ? 'correct' : 'wrong';
    }
    return ans.revealed ? 'correct' : 'skipped';
}

function showResults() {
    let correct = 0, wrong = 0, skipped = 0;
    const total = questions.length;

    questions.forEach((_, i) => {
        const status = getAnswerStatus(i);
        if (status === 'correct') correct++;
        else if (status === 'wrong') wrong++;
        else skipped++;
    });

    const percentage = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;

    document.getElementById('resultsScore').textContent = correct;
    document.getElementById('resultsLabel').textContent = `out of ${total}`;
    document.getElementById('resultsPercentage').textContent = `${percentage}%`;

    let timeText = '';
    if (testStartTime && currentMode === 'test') {
        const elapsed = Math.floor((Date.now() - testStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        timeText = `Time taken: ${mins}m ${secs}s`;
    } else {
        timeText = 'Practice Mode';
    }
    document.getElementById('resultsTime').textContent = timeText;

    document.getElementById('statCorrect').textContent = correct;
    document.getElementById('statWrong').textContent = wrong;
    document.getElementById('statSkipped').textContent = skipped;

    closeGrid();
    showScreen('screenResults');
    if (typeof pushQuizHistory === 'function') {
        pushQuizHistory({ cafe: 'question', screen: 'screenResults' });
    }
}

function restartQuiz() {
    currentQIndex = 0;
    userAnswers = {};
    testStartTime = null;
    if (currentMode === 'onebyone') {
        showQuiz(0);
    } else if (currentMode === 'fullquiz') {
        showFullQuiz();
    } else if (currentMode === 'test') {
        if (currentChapter && currentChapter.id && currentChapter.id.startsWith('custom_test') && typeof startCustomTest === 'function') {
            startCustomTest();
        } else {
            showTestConfig();
        }
    } else {
        showQuiz(0);
    }
}

// ==================== REVIEW MODE ====================
function reviewTest() {
    reviewFilter = 'all';
    showScreen('screenReview');   // show first so render lands on a visible screen
    if (typeof pushQuizHistory === 'function') {
        pushQuizHistory({ cafe: 'question', screen: 'screenReview' });
    }
    renderReview();
}

function renderReview() {
    const container = document.getElementById('reviewContainer');

    document.querySelectorAll('.review-filter-btn').forEach(btn => btn.classList.remove('active'));
    const filterBtn = document.getElementById(`filter${reviewFilter.charAt(0).toUpperCase() + reviewFilter.slice(1)}`);
    if (filterBtn) filterBtn.classList.add('active');

    let html = '';

    questions.forEach((q, i) => {
        const ans = userAnswers[i];
        let status = 'skipped';
        let statusText = 'Skipped';
        let cardClass = 'skipped-card';

        if (ans) {
            if (q.type === 'image_mcq') {
                if (ans.selected !== undefined) {
                    if (ans.selected === q.correct) {
                        status = 'correct';
                        statusText = 'Correct';
                        cardClass = 'correct-card';
                    } else {
                        status = 'wrong';
                        statusText = 'Wrong';
                        cardClass = 'wrong-card';
                    }
                }
            } else if (q.type === 'mcq' || q.type === 'multi_mcq') {
                if (q.type === 'multi_mcq') {
                    const selected = ans.selected || [];
                    if (allCorrectSelected(q, selected)) {
                        status = 'correct';
                        statusText = 'Correct';
                        cardClass = 'correct-card';
                    } else if (selected.length > 0) {
                        status = 'wrong';
                        statusText = 'Wrong';
                        cardClass = 'wrong-card';
                    }
                } else {
                    if (ans.correct) {
                        status = 'correct';
                        statusText = 'Correct';
                        cardClass = 'correct-card';
                    } else if (ans.selected !== undefined) {
                        status = 'wrong';
                        statusText = 'Wrong';
                        cardClass = 'wrong-card';
                    }
                }
            } else if (q.type === 'integer') {
                const isCorrect = ans.userAnswer && ans.userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
                if (ans.userAnswer && ans.userAnswer.trim()) {
                    status = isCorrect ? 'correct' : 'wrong';
                    statusText = isCorrect ? 'Correct' : 'Wrong';
                    cardClass = isCorrect ? 'correct-card' : 'wrong-card';
                }
            } else {
                if (currentMode === 'test' && ans.userAnswer && ans.userAnswer.trim()) {
                    const isCorrect = ans.userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
                    status = isCorrect ? 'correct' : 'wrong';
                    statusText = isCorrect ? 'Correct' : 'Wrong';
                    cardClass = isCorrect ? 'correct-card' : 'wrong-card';
                } else if (ans.revealed) {
                    status = 'correct';
                    statusText = 'Revealed';
                    cardClass = 'correct-card';
                }
            }
        }

        if (reviewFilter !== 'all' && status !== reviewFilter) return;

        /* Option-based questions get the very same graded option rows the Test
           Cafe shows after submission, so the two review screens read alike.
           Typed-answer questions keep the "Your answer / Correct answer" pair. */
        const isOptionType = q.type === 'mcq' || q.type === 'multi_mcq' || q.type === 'image_mcq';
        const isMulti = q.type === 'multi_mcq';

        let answerHTML = '';
        if (isOptionType) {
            let selected = [];
            if (ans && ans.selected !== undefined && ans.selected !== null) {
                selected = Array.isArray(ans.selected) ? ans.selected : [ans.selected];
            }
            answerHTML = buildOptionList(q, i, {
                selected,
                revealed: true,
                isMulti,
                readOnly: true,
                containerId: `reviewOptions-${i}`
            });
        } else {
            const userAnswerText = (ans && ans.userAnswer) ? ans.userAnswer : 'Not answered';
            const correctAnswerText = q.answer !== undefined && q.answer !== null ? String(q.answer) : '';
            answerHTML = `
                <div class="review-user-answer">
                    <div class="label">Your Answer:</div>
                    <div class="value">${escapeHtml(userAnswerText)}</div>
                </div>
                <div class="review-correct-answer">
                    <div class="label">Correct Answer:</div>
                    <div class="value">${escapeHtml(correctAnswerText)}</div>
                </div>
            `;
        }

        // Image display
        const qImages = typeof getActiveQuestionImages === 'function' ? getActiveQuestionImages(q) : (Array.isArray(q.images) && q.images.length > 0 ? q.images : (q.image_url ? [q.image_url] : []));
        let imageHTML = '';
        if (qImages.length > 1) {
            imageHTML = `
                <div class="q-images-container" style="display:flex;flex-direction:column;gap:0.75rem;margin:0.75rem 0;">
                    ${qImages.map((img, k) => `
                        <div class="image-question-wrap">
                            <img src="${img}" class="question-image" alt="Question ${i + 1} Diagram ${k + 1}" 
                                 loading="lazy" data-original-url="${img}" onerror="handleImageError(this)">
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (qImages.length === 1) {
            imageHTML = `
                <div class="image-question-wrap">
                    <img src="${qImages[0]}" class="question-image" alt="Question ${i + 1}" 
                         loading="lazy" data-original-url="${qImages[0]}" onerror="handleImageError(this)">
                </div>
            `;
        }

        const topicLabel = q.topic || q.topicName || (currentChapter ? currentChapter.name : '');
        const qText = typeof getActiveQuestionText === 'function' ? getActiveQuestionText(q) : (q.question || '');
        const expText = typeof getActiveExplanationText === 'function' ? getActiveExplanationText(q) : (q.explanation || '');
        const expImages = typeof getActiveExplanationImages === 'function' ? getActiveExplanationImages(q) : (Array.isArray(q.explanation_images) && q.explanation_images.length > 0 ? q.explanation_images : (q.explanation_image ? [q.explanation_image] : []));
        const hasHi = Boolean(q.translations && q.translations.hi);

        let explanationHTML = '';
        if (expText || expImages.length > 0) {
            explanationHTML = `
                <div class="explanation-box show" style="margin-top:1rem;">
                    <h4>💡 Explanation</h4>
                    ${expText ? `<div class="explanation-text" style="line-height:1.7;margin-top:0.5rem;">${typeof renderSmartExplanationText === 'function' ? renderSmartExplanationText(q) : (typeof safeHtml === 'function' ? safeHtml(expText) : escapeHtml(expText))}</div>` : ''}
                    ${expImages.length > 1 ? `
                        <div class="exp-images-container" style="display:flex;flex-direction:column;gap:0.75rem;margin:0.75rem 0;">
                            ${expImages.map((eimg, k) => `
                                <img class="explanation-img" src="${eimg}" alt="Explanation Diagram ${k + 1}" loading="lazy">
                            `).join('')}
                        </div>
                    ` : (expImages.length === 1 ? `
                        <img class="explanation-img" src="${expImages[0]}" alt="Explanation Diagram" loading="lazy">
                    ` : '')}
                </div>
            `;
        }

        html += `
            <div class="review-question-card ${cardClass}">
                <div class="question-card-header">
                    <div class="question-meta-group">
                        <span class="question-number">Q. ${i + 1}</span>
                        <span class="meta-dot">·</span>
                        <span class="type-badge">${typeof getTypeLabel === 'function' ? getTypeLabel(q) : 'single'}</span>
                        ${topicLabel ? `<span class="meta-dot">·</span><span class="question-topic-tag" title="${escapeHtml(topicLabel)}">📂 ${escapeHtml(topicLabel)}</span>` : ''}
                        ${typeof buildExamBadge === 'function' ? buildExamBadge(q) : ''}
                    </div>
                    <div class="question-card-top-actions" style="display:flex;align-items:center;gap:0.5rem;">
                        ${hasHi ? `
                            <button class="lang-toggle-btn ${currentLanguage === 'hi' ? 'active' : ''}" onclick="toggleQuestionLanguage()" title="Switch Language (English / हिन्दी)">
                                ${currentLanguage === 'hi' ? '🇮🇳 HI' : '🇬🇧 EN'}
                            </button>
                        ` : ''}
                        <div class="review-status-badge ${status}">${statusText}</div>
                    </div>
                </div>
                ${qText ? `<div class="question-text">${typeof renderSmartQuestionText === 'function' ? renderSmartQuestionText(q) : (typeof safeHtml === 'function' ? safeHtml(qText) : escapeHtml(qText))}</div>` : ''}
                ${q.matchLists && typeof buildMatchLists === 'function' ? buildMatchLists(q.matchLists) : ''}
                ${imageHTML}
                ${answerHTML}
                ${explanationHTML}
            </div>
        `;
    });

    container.innerHTML = html || '<p style="text-align:center;color:var(--text-muted);padding:2rem;">No questions match this filter.</p>';

    if (typeof typesetMath === 'function') {
        typesetMath(container);
    } else if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(container, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\[', right: '\\]', display: true},
                {left: '\\(', right: '\\)', display: false}
            ],
            throwOnError: false
        });
    }

    loadOfflineImagesInContainer(container);
}

function filterReview(filter) {
    reviewFilter = filter;
    renderReview();
}
