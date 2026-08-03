// ==================== TEST CONFIG ====================
function renderTestConfig() {
    const list = document.getElementById('topicSelectList');

    if (!topics || topics.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No topics available. All questions will be used.</p>';
        return;
    }

    // Show topic selection with per-topic question count
    list.innerHTML = topics.map((topic, i) => {
        const qCount = topic.questions ? topic.questions.length : 0;
        const isSelected = selectedTopics.includes(i);
        const topicCount = topicQuestionCounts[i] !== undefined ? topicQuestionCounts[i] : qCount;

        let countInput = '';
        if (isSelected) {
            countInput = `
                <div class="count-slider-wrap" style="margin-top:0.5rem;" onclick="event.stopPropagation();">
                    <input type="number" class="int-input" 
                           value="${topicCount}" 
                           min="1" max="${qCount}" 
                           style="width:60px;text-align:center;padding:0.4rem;font-size:0.85rem;"
                           onchange="updateTopicCount(${i}, this.value)">
                    <span style="color:var(--text-muted);font-size:0.78rem;">/ ${qCount}</span>
                </div>
            `;
        }

        return `
            <div class="topic-select-item ${isSelected ? 'selected' : ''}" onclick="toggleTopic(${i})">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleTopic(${i})">
                <div style="flex:1;">
                    <label>${escapeHtml(topic.topic)}</label>
                    ${countInput}
                </div>
                <span class="topic-meta-count">${qCount} Qs</span>
            </div>
        `;
    }).join('');

    // Show total questions summary
    const totalQs = selectedTopics.reduce((sum, idx) => {
        const qCount = topics[idx].questions ? topics[idx].questions.length : 0;
        const tCount = topicQuestionCounts[idx] !== undefined ? topicQuestionCounts[idx] : qCount;
        return sum + Math.min(tCount, qCount);
    }, 0);

    const summary = document.getElementById('testSummary');
    if (summary) {
        summary.innerHTML = selectedTopics.length > 0 
            ? `<strong>${totalQs}</strong> questions from <strong>${selectedTopics.length}</strong> topic(s)`
            : 'Select at least one topic';
    }

    // Enable/disable start button
    const startBtn = document.getElementById('startTestBtn');
    if (startBtn) {
        startBtn.disabled = selectedTopics.length === 0;
    }
}

function updateTopicCount(topicIdx, value) {
    let count = parseInt(value);
    const maxCount = topics[topicIdx].questions ? topics[topicIdx].questions.length : 0;
    if (isNaN(count) || count < 1) count = 1;
    if (count > maxCount) count = maxCount;
    topicQuestionCounts[topicIdx] = count;
    renderTestConfig();
}

function updateCountDisplay() {
    // Legacy function - no longer used in test mode
}

function toggleTopic(index) {
    if (selectedTopics.includes(index)) {
        selectedTopics = selectedTopics.filter(i => i !== index);
        delete topicQuestionCounts[index];
    } else {
        selectedTopics.push(index);
        const qCount = topics[index].questions ? topics[index].questions.length : 0;
        topicQuestionCounts[index] = qCount; // default: all questions
    }
    renderTestConfig();
}

function startTestMode() {
    // Build questions from selected topics with per-topic counts
    let filteredQuestions = [];

    if (selectedTopics.length > 0 && topics.length > 0) {
        selectedTopics.forEach(idx => {
            if (topics[idx] && topics[idx].questions) {
                const qCount = topics[idx].questions.length;
                const takeCount = topicQuestionCounts[idx] !== undefined 
                    ? Math.min(topicQuestionCounts[idx], qCount) 
                    : qCount;

                // Shuffle within topic and take requested count
                const shuffled = shuffleArray([...topics[idx].questions]);
                shuffled.slice(0, takeCount).forEach(q => {
                    filteredQuestions.push({...q, topicName: topics[idx].topic});
                });
            }
        });
    } else {
        filteredQuestions = [...questions];
    }

    // Filter out fill_blank questions for test mode (keep image_mcq, mcq, integer)
    filteredQuestions = filteredQuestions.filter(q => {
        if (q.type === 'fill_blank') return false;
        if (!q.type) return false; // undefined type = fill_blank
        return true;
    });

    // Shuffle all selected questions together
    filteredQuestions = shuffleArray(filteredQuestions);

    // Replace questions with filtered set
    questions = filteredQuestions;
    userAnswers = {};
    testStartTime = Date.now();

    renderTestMode();
    startTestTimer();
    showScreen('screenTestMode');
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ==================== TEST TIMER ====================
function startTestTimer() {
    stopTestTimer();
    testTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - testStartTime) / 1000);
        const remaining = testTimeLimit - elapsed;

        if (remaining <= 0) {
            submitTest();
            return;
        }

        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        const timerEl = document.getElementById('testTimer');
        timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        if (remaining < 60) {
            timerEl.classList.add('danger');
            timerEl.classList.remove('warning');
        } else if (remaining < 300) {
            timerEl.classList.add('warning');
            timerEl.classList.remove('danger');
        }
    }, 1000);
}

function updateTestTimeLimit() {
    const input = document.getElementById('timerInput');
    let mins = parseInt(input.value);
    if (isNaN(mins) || mins < 1) mins = 1;
    testTimeLimit = mins * 60;
}

function stopTestTimer() {
    if (testTimerInterval) {
        clearInterval(testTimerInterval);
        testTimerInterval = null;
    }
}

function confirmEndTest() {
    if (confirm('Are you sure you want to end the test? Your progress will be submitted.')) {
        submitTest();
    }
}

// ==================== TEST MODE RENDERING ====================
function renderTestMode() {
    const container = document.getElementById('testQuestionList');
    const total = questions.length;

    document.getElementById('testChapterTitle').textContent = currentChapter ? currentChapter.name : 'Custom Test';
    document.getElementById('testProgress').textContent = `0 / ${total}`;
    document.getElementById('testTotalCount').textContent = total;
    document.getElementById('testAnsweredCount').textContent = '0';
    document.getElementById('testProgressFill').style.width = '0%';

    container.innerHTML = questions.map((q, idx) => {
        let typeLabel = '';
        let questionHTML = '';

        if (q.type === 'image_mcq') {
            typeLabel = 'Image MCQ';
            questionHTML = renderTestImageMCQ(q, idx);
        } else if (q.type === 'fill_blank' || !q.type) {
            typeLabel = 'Fill in the Blank';
            questionHTML = renderTestFillBlank(q, idx);
        } else if (q.type === 'integer') {
            typeLabel = 'Integer Type';
            questionHTML = renderTestInteger(q, idx);
        } else if (q.type === 'mcq' || q.type === 'multi_mcq') {
            typeLabel = q.type === 'multi_mcq' ? 'Multiple Correct MCQ' : 'Single Correct MCQ';
            questionHTML = renderTestMCQ(q, idx);
        }

        const isReviewed = userAnswers[idx] && userAnswers[idx].reviewed;

        return `
            <div class="question-card test-mode" id="testQ-${idx}">
                <div class="question-card-header">
                    <div class="type-badge">● ${typeLabel}</div>
                    <button class="review-btn ${isReviewed ? 'active' : ''}" onclick="toggleReview(${idx})" title="Mark for review">
                        🚩 ${isReviewed ? 'Reviewed' : 'Review'}
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
                ${questionHTML}
            </div>
        `;
    }).join('');

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

// ==================== TEST IMAGE MCQ ====================
function renderTestImageMCQ(q, idx) {
    const saved = userAnswers[idx];
    const selected = saved && saved.selected !== undefined ? saved.selected : -1;

    return `
        <div class="image-question-wrap">
            <img src="${q.image_url}" 
                 class="question-image" 
                 alt="Question ${idx + 1}" 
                 loading="lazy"
                 data-original-url="${q.image_url}"
                 onerror="handleImageError(this)">
        </div>
        <div class="image-mcq-options test-mode" id="testImgMcqOptions-${idx}">
            ${[1, 2, 3, 4].map(num => {
                const optIdx = num - 1;
                return `
                    <div class="image-mcq-option ${selected === optIdx ? 'selected' : ''}" 
                         onclick="selectTestImageMCQ(${idx}, ${optIdx})">
                        <span class="image-mcq-num">${num}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function selectTestImageMCQ(idx, optIdx) {
    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].selected = optIdx;
    userAnswers[idx].type = 'image_mcq';

    // Re-render just this question's options
    const container = document.getElementById(`testImgMcqOptions-${idx}`);
    if (container) {
        container.innerHTML = [1, 2, 3, 4].map(num => {
            const oIdx = num - 1;
            return `
                <div class="image-mcq-option ${optIdx === oIdx ? 'selected' : ''}" 
                     onclick="selectTestImageMCQ(${idx}, ${oIdx})">
                    <span class="image-mcq-num">${num}</span>
                </div>
            `;
        }).join('');
    }

    updateTestProgress();
}

// ==================== EXISTING TEST RENDERERS ====================
function renderTestFillBlank(q, idx) {
    const saved = userAnswers[idx];
    const answered = saved && saved.userAnswer;
    return `
        <div class="int-input-wrap">
            <input type="text" 
                   class="int-input" 
                   placeholder="Type your answer..." 
                   id="testFibInput-${idx}"
                   value="${answered ? escapeHtml(saved.userAnswer) : ''}"
                   oninput="updateTestAnswer(${idx}, this.value)"
                   onkeypress="if(event.key==='Enter'){event.preventDefault();document.getElementById('testQ-${Math.min(idx+1, questions.length-1)}').scrollIntoView({behavior:'smooth',block:'start'});}">
        </div>
    `;
}

function renderTestInteger(q, idx) {
    const saved = userAnswers[idx];
    const answered = saved && saved.userAnswer;
    return `
        <div class="int-input-wrap">
            <input type="text" 
                   class="int-input" 
                   placeholder="Type your answer..." 
                   id="testIntInput-${idx}"
                   value="${answered ? escapeHtml(saved.userAnswer) : ''}"
                   oninput="updateTestAnswer(${idx}, this.value)"
                   onkeypress="if(event.key==='Enter'){event.preventDefault();document.getElementById('testQ-${Math.min(idx+1, questions.length-1)}').scrollIntoView({behavior:'smooth',block:'start'});}">
        </div>
    `;
}

function renderTestMCQ(q, idx) {
    const saved = userAnswers[idx];
    const isMulti = q.type === 'multi_mcq';
    const selected = saved ? (isMulti ? (saved.selected || []) : (saved.selected !== undefined ? [saved.selected] : [])) : [];
    const letters = ['A', 'B', 'C', 'D', 'E'];

    return `
        <div class="mcq-options" id="testMcqOptions-${idx}">
            ${q.options.map((opt, i) => `
                <div class="mcq-option ${selected.includes(i) ? 'selected' : ''}" 
                     onclick="selectTestMCQ(${idx}, ${i})">
                    <div class="mcq-letter">${letters[i]}</div>
                    <div class="mcq-text">${escapeHtml(opt)}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function updateTestAnswer(idx, value) {
    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].userAnswer = value;
    userAnswers[idx].type = questions[idx].type || 'fill_blank';
    updateTestProgress();
}

function selectTestMCQ(idx, optionIdx) {
    const q = questions[idx];
    const isMulti = q.type === 'multi_mcq';

    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].type = 'mcq';

    if (isMulti) {
        let selected = userAnswers[idx].selected || [];
        if (selected.includes(optionIdx)) {
            selected = selected.filter(i => i !== optionIdx);
        } else {
            selected.push(optionIdx);
        }
        userAnswers[idx].selected = selected;
    } else {
        userAnswers[idx].selected = optionIdx;
    }

    // Re-render just this question's options
    const optionsContainer = document.getElementById(`testMcqOptions-${idx}`);
    if (optionsContainer) {
        const saved = userAnswers[idx];
        const selected = isMulti ? (saved.selected || []) : (saved.selected !== undefined ? [saved.selected] : []);
        const letters = ['A', 'B', 'C', 'D', 'E'];
        optionsContainer.innerHTML = q.options.map((opt, i) => `
            <div class="mcq-option ${selected.includes(i) ? 'selected' : ''}" 
                 onclick="selectTestMCQ(${idx}, ${i})">
                <div class="mcq-letter">${letters[i]}</div>
                <div class="mcq-text">${escapeHtml(opt)}</div>
            </div>
        `).join('');
    }

    updateTestProgress();
}

function updateTestProgress() {
    const answered = Object.keys(userAnswers).filter(k => {
        const ans = userAnswers[k];
        if (!ans) return false;
        if (ans.type === 'mcq' || ans.type === 'image_mcq') {
            return ans.selected !== undefined && (Array.isArray(ans.selected) ? ans.selected.length > 0 : true);
        }
        return ans.userAnswer && ans.userAnswer.trim() !== '';
    }).length;

    const total = questions.length;
    document.getElementById('testAnsweredCount').textContent = answered;
    document.getElementById('testProgress').textContent = `${answered} / ${total}`;
    document.getElementById('testProgressFill').style.width = `${(answered / total) * 100}%`;
}

function submitTest() {
    stopTestTimer();
    showResults();
}
