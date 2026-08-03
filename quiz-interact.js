// ==================== INTERACTIONS ====================
function revealAnswer(idx) {
    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].revealed = true;

    const fibBtn = document.getElementById(`fibBtn-${idx}`);
    const fibAnswer = document.getElementById(`fibAnswer-${idx}`);
    const fibExplain = document.getElementById(`fibExplain-${idx}`);
    const intShowBtn = document.getElementById(`intShowBtn-${idx}`);
    const intAnswer = document.getElementById(`intAnswer-${idx}`);
    const intExplain = document.getElementById(`intExplain-${idx}`);
    const mcqBtn = document.getElementById(`mcqBtn-${idx}`);
    const mcqExplain = document.getElementById(`mcqExplain-${idx}`);

    if (fibBtn) {
        fibBtn.classList.add('revealed');
        fibBtn.textContent = '✅ Answer Revealed';
    }
    if (fibAnswer) fibAnswer.classList.add('show');
    if (fibExplain) fibExplain.classList.add('show');

    if (intShowBtn) {
        intShowBtn.classList.add('revealed');
        intShowBtn.textContent = '✅ Answer Revealed';
    }
    if (intAnswer) intAnswer.classList.add('show');
    if (intExplain) intExplain.classList.add('show');

    if (mcqBtn) {
        mcqBtn.classList.add('revealed');
        mcqBtn.textContent = '✅ Answer Revealed';
    }
    if (mcqExplain) mcqExplain.classList.add('show');

    const q = questions[idx];
    if (q.type === 'mcq') {
        const optionsContainer = document.getElementById(`mcqOptions-${idx}`);
        if (optionsContainer) {
            const saved = userAnswers[idx];
            const isMulti = q.type === 'multi_mcq';
            const selected = saved ? (isMulti ? (saved.selected || []) : (saved.selected !== undefined ? [saved.selected] : [])) : [];
            const letters = ['A', 'B', 'C', 'D', 'E'];

            optionsContainer.innerHTML = q.options.map((opt, i) => {
                let cls = '';
                if (isCorrectOption(q, i)) cls = 'correct';
                else if (selected.includes(i)) cls = 'wrong';
                else if (isMulti && selected.includes(i) && isCorrectOption(q, i) && !allCorrectSelected(q, selected)) cls = 'partial';

                return `
                    <div class="mcq-option ${cls}">
                        <div class="mcq-letter">${letters[i]}</div>
                        <div class="mcq-text">${escapeHtml(opt)}</div>
                    </div>
                `;
            }).join('');
        }
    }
}

function checkInteger(idx) {
    const input = document.getElementById(`intInput-${idx}`);
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;

    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].userAnswer = val;
    userAnswers[idx].type = 'integer';

    const q = questions[idx];
    const isCorrect = val.toLowerCase() === q.answer.trim().toLowerCase();
    const feedbackId = `intFeedback-${idx}`;
    let feedbackEl = document.getElementById(feedbackId);

    if (!feedbackEl) {
        const wrap = input.closest('.int-input-wrap');
        feedbackEl = document.createElement('div');
        feedbackEl.id = feedbackId;
        feedbackEl.className = `int-feedback ${isCorrect ? 'correct' : 'wrong'}`;
        feedbackEl.textContent = isCorrect ? '✅ Correct!' : '❌ Incorrect. Try again or reveal answer.';
        wrap.after(feedbackEl);
    } else {
        feedbackEl.className = `int-feedback ${isCorrect ? 'correct' : 'wrong'}`;
        feedbackEl.textContent = isCorrect ? '✅ Correct!' : '❌ Incorrect. Try again or reveal answer.';
        feedbackEl.style.display = 'block';
    }
}

function getQuestionCardElement(idx) {
    if (currentMode === 'fullquiz') {
        return document.getElementById(`fullQ-${idx}`);
    }
    const container = document.getElementById('quizContainer');
    return container ? container.querySelector('.question-card') : null;
}

function selectMCQ(idx, optionIdx) {
    const q = questions[idx];
    const isMulti = q.type === 'multi_mcq';

    if (!userAnswers[idx]) userAnswers[idx] = {};
    if (userAnswers[idx].revealed) return;

    if (isMulti) {
        let selected = userAnswers[idx].selected || [];
        if (selected.includes(optionIdx)) {
            selected = selected.filter(i => i !== optionIdx);
        } else {
            selected.push(optionIdx);
        }
        userAnswers[idx].selected = selected;
        userAnswers[idx].type = 'mcq';

        const options = document.querySelectorAll(`#mcqOptions-${idx} .mcq-option`);
        options.forEach((opt, i) => {
            opt.classList.toggle('selected', selected.includes(i));
        });

        const countEl = document.getElementById(`multiCount-${idx}`);
        const submitBtn = document.getElementById(`multiSubmit-${idx}`);
        if (countEl) {
            countEl.textContent = `${selected.length} option${selected.length !== 1 ? 's' : ''} selected`;
        }
        if (submitBtn) {
            submitBtn.disabled = selected.length === 0;
        }
    } else {
        userAnswers[idx].selected = optionIdx;
        userAnswers[idx].type = 'mcq';
        userAnswers[idx].correct = (optionIdx === q.correct);
        userAnswers[idx].revealed = true;

        const card = getQuestionCardElement(idx);
        if (card) {
            const typeLabel = 'Single Correct MCQ';
            const isBookmarked = typeof isQuestionBookmarked === 'function' && currentChapter ? isQuestionBookmarked(currentChapter.id, idx) : false;
            card.innerHTML = `
                <div class="question-card-header">
                    <div class="type-badge">● ${typeLabel}</div>
                    <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark(${idx})" title="Bookmark this question">
                        ${isBookmarked ? '🔖' : '📑'}
                    </button>
                </div>
                <div class="question-number">Question ${idx + 1} of ${questions.length}</div>
                ${q.topicName ? `<div class="question-topic-tag">📂 ${escapeHtml(q.topicName)}</div>` : ''}
                ${q.question ? `<div class="question-text">${escapeHtml(q.question)}</div>` : ''}
                ${renderMCQ(q, idx)}
            `;

            setTimeout(() => {
                if (typeof renderMathInElement !== 'undefined') {
                    renderMathInElement(card, {
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
    }
}

function submitMultiMCQ(idx) {
    const q = questions[idx];
    if (!userAnswers[idx]) return;

    userAnswers[idx].revealed = true;
    const selected = userAnswers[idx].selected || [];
    userAnswers[idx].correct = allCorrectSelected(q, selected);

    const card = getQuestionCardElement(idx);
    if (card) {
        const typeLabel = 'Multiple Correct MCQ';
        const isBookmarked = typeof isQuestionBookmarked === 'function' && currentChapter ? isQuestionBookmarked(currentChapter.id, idx) : false;
        card.innerHTML = `
            <div class="question-card-header">
                <div class="type-badge">● ${typeLabel}</div>
                <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" onclick="toggleBookmark(${idx})" title="Bookmark this question">
                    ${isBookmarked ? '🔖' : '📑'}
                </button>
            </div>
            <div class="question-number">Question ${idx + 1} of ${questions.length}</div>
            ${q.topicName ? `<div class="question-topic-tag">📂 ${escapeHtml(q.topicName)}</div>` : ''}
            ${q.question ? `<div class="question-text">${escapeHtml(q.question)}</div>` : ''}
            ${renderMCQ(q, idx)}
        `;

        setTimeout(() => {
            if (typeof renderMathInElement !== 'undefined') {
                renderMathInElement(card, {
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
}

function nextQuestion() {
    if (currentQIndex < questions.length - 1) {
        currentQIndex++;
        renderQuestion();
    } else {
        const nextInfo = typeof getNextTopicInfo === 'function' ? getNextTopicInfo() : null;
        if (nextInfo) {
            if (confirm(`Topic complete! Would you like to move directly to next topic/chapter: "${nextInfo.name}"?`)) {
                loadNextTopicOrChapter();
            } else {
                showResults();
            }
        } else {
            showResults();
        }
    }
}

function prevQuestion() {
    if (currentQIndex > 0) {
        currentQIndex--;
        renderQuestion();
    }
}

// ==================== KEYBOARD NAVIGATION ====================
document.addEventListener('keydown', function(e) {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;

    const screenId = activeScreen.id;

    // One by One mode keyboard shortcuts
    if (screenId === 'screenQuiz') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            // Allow Enter to submit/check in input fields
            if (e.key === 'Enter') {
                const q = questions[currentQIndex];
                if (q.type === 'integer') {
                    checkInteger(currentQIndex);
                }
            }
            return;
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextQuestion();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevQuestion();
        } else if (e.key === ' ') {
            e.preventDefault();
            const q = questions[currentQIndex];
            const saved = userAnswers[currentQIndex];

            if (q.type === 'image_mcq') {
                revealImageAnswer(currentQIndex);
            } else if (q.type === 'multi_mcq') {
                if (saved && saved.selected && saved.selected.length > 0) {
                    submitMultiMCQ(currentQIndex);
                } else {
                    revealAnswer(currentQIndex);
                }
            } else if (q.type === 'mcq') {
                if (saved && saved.selected !== undefined) {
                    revealAnswer(currentQIndex);
                }
            } else {
                revealAnswer(currentQIndex);
            }
        } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
            e.preventDefault();
            const q = questions[currentQIndex];
            const optionIdx = parseInt(e.key) - 1;

            if (q.type === 'image_mcq' && optionIdx < 4) {
                selectImageMCQ(currentQIndex, optionIdx);
            } else if (q.type === 'mcq' && optionIdx < q.options.length) {
                selectMCQ(currentQIndex, optionIdx);
            }
        }
    }
});
