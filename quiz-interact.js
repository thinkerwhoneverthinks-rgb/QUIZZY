// ==================== INTERACTIONS ====================

/* ---- Surgical reveal: update option classes, flags, show-answer button and
   explanation box IN PLACE so the browser never tears down / recreates the
   card's DOM tree.  This eliminates the visible blink that the old full
   `refreshQuestionCard(innerHTML)` approach caused. ---- */
function _applyRevealInPlace(idx, opts = {}) {
    const q = questions[idx];
    const saved = userAnswers[idx] || {};
    const isMulti = q.type === 'multi_mcq';
    const selected = isMulti ? (saved.selected || []) : (saved.selected !== undefined ? [saved.selected] : []);
    const card = getQuestionCardElement(idx);
    if (!card) { refreshQuestionCard(idx); return; } // fallback

    const isFullQuiz = currentMode === 'fullquiz';
    const autoShowSolution = opts.autoShowSolution !== undefined ? opts.autoShowSolution : !isFullQuiz;

    /* -- 1. Determine the options container id (scoped to active card) -- */
    const containerId = q.type === 'image_mcq' ? `imgMcqOptions-${idx}` : `mcqOptions-${idx}`;
    const optContainer = card.querySelector('.mcq-options') || card.querySelector('#' + containerId) || document.getElementById(containerId);

    if (optContainer) {
        const optEls = optContainer.querySelectorAll('.mcq-option');
        optEls.forEach((el, i) => {
            const isChosen = selected.includes(i);
            const isCorrect = isCorrectOption(q, i);

            // Reset state classes
            el.classList.remove('selected', 'correct', 'wrong', 'partial');

            if (isChosen) el.classList.add('selected');
            if (isCorrect && isChosen) {
                el.classList.add('correct');
            } else if (isCorrect) {
                el.classList.add('correct');
            } else if (isChosen) {
                el.classList.add('wrong');
            }
            if (isMulti && isChosen && isCorrect && !allCorrectSelected(q, selected)) {
                el.classList.add('partial');
            }

            // Disable further clicks
            el.removeAttribute('onclick');
            el.style.cursor = 'default';

            // Update / insert flag text
            let flagEl = el.querySelector('.mcq-flag');
            let flagText = '';
            if (isCorrect && isChosen) {
                flagText = 'Correct (Marked By You)';
            } else if (isCorrect) {
                flagText = 'Correct (Not Marked By You)';
            } else if (isChosen) {
                flagText = 'Incorrect (Marked By You)';
            }

            if (flagText) {
                if (!flagEl) {
                    flagEl = document.createElement('div');
                    flagEl.className = 'mcq-flag';
                    const textBody = el.querySelector('.mcq-text');
                    if (textBody) textBody.appendChild(flagEl);
                }
                flagEl.textContent = flagText;
            } else if (flagEl) {
                flagEl.remove();
            }

            // Compact badge handling
            let badgeEl = el.querySelector('.mcq-compact-flag-badge');
            if (flagText) {
                if (!badgeEl && el.classList.contains('mcq-compact-block')) {
                    badgeEl = document.createElement('div');
                    badgeEl.className = 'mcq-compact-flag-badge';
                    el.appendChild(badgeEl);
                }
                if (badgeEl) {
                    badgeEl.textContent = flagText.includes('Correct') ? '✓' : '✕';
                    badgeEl.title = flagText;
                }
            } else if (badgeEl) {
                badgeEl.remove();
            }
        });
    }

    /* -- 2. Update show-answer button (scoped to active card) -- */
    const btn = card.querySelector('.show-answer-btn') || document.getElementById(`mcqBtn-${idx}`) || document.getElementById(`imgMcqBtn-${idx}`) || document.getElementById(`fibBtn-${idx}`) || document.getElementById(`intShowBtn-${idx}`);
    if (btn) {
        if (!autoShowSolution) {
            btn.classList.remove('revealed');
            btn.classList.add('ready-solution');
            btn.textContent = '💡 Show Solution';
            btn.setAttribute('onclick', `revealSolutionOnly(${idx})`);
            btn.removeAttribute('disabled');
            btn.style.cursor = 'pointer';
        } else {
            btn.classList.remove('ready-solution');
            btn.classList.add('revealed');
            btn.textContent = '✅ Solution Revealed';
            btn.removeAttribute('onclick');
            btn.style.cursor = 'default';
        }
    }

    /* -- 3. Show explanation & answer boxes only if autoShowSolution is true -- */
    if (autoShowSolution) {
        card.querySelectorAll('.explanation-box').forEach(el => el.classList.add('show'));
        card.querySelectorAll('.fib-answer-box').forEach(el => el.classList.add('show'));
        if (saved) saved.solutionRequested = true;
    }

    /* -- 4. Remove multi-submit controls if present (scoped to active card) -- */
    const countEl = card.querySelector('.multi-selected-count') || document.getElementById(`multiCount-${idx}`);
    const submitBtn = card.querySelector('.multi-submit-btn') || document.getElementById(`multiSubmit-${idx}`);
    if (countEl) countEl.remove();
    if (submitBtn) submitBtn.remove();

    /* -- 5. Re-render math if needed -- */
    typesetMath(card);

    if (typeof recordStudySession === 'function') recordStudySession();
    if (typeof saveActiveExercise === 'function') saveActiveExercise();
}

function revealSolutionOnly(idx) {
    const card = getQuestionCardElement(idx);
    if (card) {
        card.querySelectorAll('.explanation-box').forEach(el => el.classList.add('show'));
        card.querySelectorAll('.fib-answer-box').forEach(el => el.classList.add('show'));
        const btn = card.querySelector('.show-answer-btn') || document.getElementById(`mcqBtn-${idx}`) || document.getElementById(`imgMcqBtn-${idx}`) || document.getElementById(`fibBtn-${idx}`) || document.getElementById(`intShowBtn-${idx}`);
        if (btn) {
            btn.classList.remove('ready-solution');
            btn.classList.add('revealed');
            btn.textContent = '✅ Solution Revealed';
            btn.removeAttribute('onclick');
            btn.style.cursor = 'default';
        }
        typesetMath(card);
    }
    if (userAnswers[idx]) {
        userAnswers[idx].solutionRequested = true;
    }
    if (typeof recordStudySession === 'function') recordStudySession();
    if (typeof saveActiveExercise === 'function') saveActiveExercise();
}

/* Works for every question type, in one-by-one AND full-quiz mode. */
function revealAnswer(idx) {
    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].revealed = true;

    const q = questions[idx];
    if (q && q.type === 'multi_mcq') {
        userAnswers[idx].correct = allCorrectSelected(q, userAnswers[idx].selected || []);
    } else if (q && (q.type === 'mcq' || q.type === 'image_mcq') && userAnswers[idx].selected !== undefined) {
        userAnswers[idx].correct = isCorrectOption(q, userAnswers[idx].selected);
    }

    _applyRevealInPlace(idx);
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
    const card = document.getElementById(`qCard-${idx}`);
    if (card) return card;
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

        const card = getQuestionCardElement(idx);
        const options = card ? card.querySelectorAll('.mcq-option') : document.querySelectorAll(`#mcqOptions-${idx} .mcq-option`);
        options.forEach((opt, i) => {
            opt.classList.toggle('selected', selected.includes(i));
        });

        const countEl = card ? card.querySelector('.multi-selected-count') : document.getElementById(`multiCount-${idx}`);
        const submitBtn = card ? card.querySelector('.multi-submit-btn') : document.getElementById(`multiSubmit-${idx}`);
        if (countEl) {
            countEl.textContent = `${selected.length} option${selected.length !== 1 ? 's' : ''} selected`;
        }
        if (submitBtn) {
            submitBtn.disabled = selected.length === 0;
        }
    } else {
        // Single correct: one click answers AND reveals — surgical update, no blink.
        userAnswers[idx].selected = optionIdx;
        userAnswers[idx].type = 'mcq';
        userAnswers[idx].correct = isCorrectOption(q, optionIdx);
        userAnswers[idx].revealed = true;
        _applyRevealInPlace(idx, { autoShowSolution: currentMode !== 'fullquiz' });
    }
}

function submitMultiMCQ(idx) {
    const q = questions[idx];
    if (!userAnswers[idx]) return;

    userAnswers[idx].revealed = true;
    userAnswers[idx].correct = allCorrectSelected(q, userAnswers[idx].selected || []);
    _applyRevealInPlace(idx, { autoShowSolution: currentMode !== 'fullquiz' });
}

function nextQuestion() {
    if (currentQIndex < questions.length - 1) {
        currentQIndex++;
        renderQuestion();
        if (window.scrollY > 40) {
            window.scrollTo(0, 0);
        }
    } else {
        // On the last question the "Continue / Show results" panel is already
        // on screen, so Next simply follows it instead of raising a confirm().
        const nextInfo = typeof getNextTopicInfo === 'function' ? getNextTopicInfo() : null;
        if (nextInfo) {
            loadNextTopicOrChapter();
        } else {
            showResults();
        }
    }
}

function prevQuestion() {
    if (currentQIndex > 0) {
        currentQIndex--;
        renderQuestion();
        if (window.scrollY > 40) {
            window.scrollTo(0, 0);
        }
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
