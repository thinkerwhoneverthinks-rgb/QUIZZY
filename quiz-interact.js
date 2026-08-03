// ==================== INTERACTIONS ====================
/* Works for every question type, in one-by-one AND full-quiz mode: mark the
   question revealed, then redraw the whole card from the shared builders so
   the options get their correct/wrong colouring and the submit controls go. */
function revealAnswer(idx) {
    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].revealed = true;

    const q = questions[idx];
    if (q && q.type === 'multi_mcq') {
        userAnswers[idx].correct = allCorrectSelected(q, userAnswers[idx].selected || []);
    } else if (q && (q.type === 'mcq' || q.type === 'image_mcq') && userAnswers[idx].selected !== undefined) {
        userAnswers[idx].correct = isCorrectOption(q, userAnswers[idx].selected);
    }

    refreshQuestionCard(idx);
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
        // Single correct: one click answers AND reveals.
        userAnswers[idx].selected = optionIdx;
        userAnswers[idx].type = 'mcq';
        userAnswers[idx].correct = (optionIdx === q.correct);
        userAnswers[idx].revealed = true;
        refreshQuestionCard(idx);
    }
}

function submitMultiMCQ(idx) {
    const q = questions[idx];
    if (!userAnswers[idx]) return;

    userAnswers[idx].revealed = true;
    userAnswers[idx].correct = allCorrectSelected(q, userAnswers[idx].selected || []);
    refreshQuestionCard(idx);
}

function nextQuestion() {
    if (currentQIndex < questions.length - 1) {
        currentQIndex++;
        renderQuestion();
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
