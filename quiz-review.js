// ==================== RESULTS ====================
function showResults() {
    let correct = 0, wrong = 0, skipped = 0;
    const total = questions.length;

    questions.forEach((q, i) => {
        const ans = userAnswers[i];
        if (!ans) {
            skipped++;
        } else if (q.type === 'image_mcq') {
            // Image MCQ: check selected vs correct
            if (ans.selected !== undefined) {
                if (ans.selected === q.correct) correct++;
                else wrong++;
            } else {
                skipped++;
            }
        } else if (q.type === 'mcq' || q.type === 'multi_mcq') {
            if (ans.revealed || currentMode === 'test') {
                if (q.type === 'multi_mcq') {
                    const selected = ans.selected || [];
                    if (allCorrectSelected(q, selected)) correct++;
                    else wrong++;
                } else {
                    ans.correct ? correct++ : wrong++;
                }
            } else {
                skipped++;
            }
        } else if (q.type === 'integer') {
            const isCorrect = ans.userAnswer && ans.userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
            if (ans.revealed || currentMode === 'test') {
                isCorrect ? correct++ : wrong++;
            } else {
                skipped++;
            }
        } else {
            if (currentMode === 'test') {
                if (ans.userAnswer && ans.userAnswer.trim()) {
                    const isCorrect = ans.userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase();
                    isCorrect ? correct++ : wrong++;
                } else {
                    skipped++;
                }
            } else {
                ans.revealed ? correct++ : skipped++;
            }
        }
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
}

function restartQuiz() {
    currentQIndex = 0;
    userAnswers = {};
    testStartTime = null;
    if (currentMode === 'onebyone') {
        showQuiz();
    } else if (currentMode === 'fullquiz') {
        showFullQuiz();
    } else if (currentMode === 'test') {
        showTestConfig();
    } else {
        showQuiz();
    }
}

// ==================== REVIEW MODE ====================
function reviewTest() {
    reviewFilter = 'all';
    renderReview();
    showScreen('screenReview');
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

        // Build user answer display
        let userAnswerText = 'Not answered';
        if (ans) {
            if (q.type === 'image_mcq') {
                if (ans.selected !== undefined) {
                    userAnswerText = `Option ${ans.selected + 1}`;
                }
            } else if (q.type === 'mcq' || q.type === 'multi_mcq') {
                const selected = ans.selected;
                if (selected !== undefined) {
                    if (Array.isArray(selected)) {
                        userAnswerText = selected.map(idx => `${['A','B','C','D'][idx]}. ${q.options[idx]}`).join(', ');
                    } else {
                        userAnswerText = `${['A','B','C','D'][selected]}. ${q.options[selected]}`;
                    }
                }
            } else if (ans.userAnswer) {
                userAnswerText = ans.userAnswer;
            }
        }

        // Build correct answer display
        let correctAnswerText = '';
        if (q.type === 'image_mcq') {
            correctAnswerText = `Option ${q.correct + 1}`;
        } else if (q.type === 'mcq' || q.type === 'multi_mcq') {
            if (q.type === 'multi_mcq' && q.correct) {
                correctAnswerText = q.correct.map(idx => `${['A','B','C','D'][idx]}. ${q.options[idx]}`).join(', ');
            } else if (q.correct !== undefined) {
                correctAnswerText = `${['A','B','C','D'][q.correct]}. ${q.options[q.correct]}`;
            }
        } else {
            correctAnswerText = q.answer;
        }

        // Image display for image_mcq
        let imageHTML = '';
        if (q.type === 'image_mcq' && q.image_url) {
            imageHTML = `
                <div class="review-image-wrap">
                    <img src="${q.image_url}" class="question-image" alt="Question ${i + 1}" 
                         loading="lazy" data-original-url="${q.image_url}" onerror="handleImageError(this)">
                </div>
            `;
        }

        html += `
            <div class="review-question-card ${cardClass}">
                <div class="review-status-badge ${status}">${statusText}</div>
                <div class="question-number">Question ${i + 1}</div>
                ${q.topicName ? `<div class="question-topic-tag">📂 ${escapeHtml(q.topicName)}</div>` : ''}
                ${q.question ? `<div class="question-text">${escapeHtml(q.question)}</div>` : ''}
                ${imageHTML}
                <div class="review-user-answer">
                    <div class="label">Your Answer:</div>
                    <div class="value">${escapeHtml(userAnswerText)}</div>
                </div>
                <div class="review-correct-answer">
                    <div class="label">Correct Answer:</div>
                    <div class="value">${escapeHtml(correctAnswerText)}</div>
                </div>
                ${q.explanation ? `
                <div class="explanation-box show" style="margin-top:1rem;">
                    <h4>Explanation</h4>
                    <p>${escapeHtml(q.explanation)}</p>
                </div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html || '<p style="text-align:center;color:var(--text-muted);padding:2rem;">No questions match this filter.</p>';

    setTimeout(() => {
        if (typeof renderMathInElement !== 'undefined') {
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
    }, 100);

    loadOfflineImagesInContainer(container);
}

function filterReview(filter) {
    reviewFilter = filter;
    renderReview();
}
