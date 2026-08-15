/* ============================================================
   Quizzy — Test Cafe UI
   Draws the four screens (browse, custom builder, runner,
   results). The runner is one layout serving three modes:
     'test'      — live, timed, answers hidden
     'analysis'  — read-only review of the attempt just finished
     'bookmark'  — read-only review of a saved bookmark folder
   ============================================================ */

const TC_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function showTcScreen(id) {
    document.querySelectorAll('.tc-screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    const running = id === 'scRunner';
    document.body.classList.toggle('tc-running', running);
    const footer = document.getElementById('siteFooter');
    if (footer) footer.style.display = running ? 'none' : '';
    if (!running) closeMobileGrid();
    window.scrollTo(0, 0);
}

function tcTypeset(el) {
    if (!el || typeof renderMathInElement === 'undefined') return;
    setTimeout(() => {
        try {
            renderMathInElement(el, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false
            });
        } catch (e) { /* ignore */ }
    }, 30);
}

// ==================== BOOT ====================
async function initTestCafe() {
    if (resumeBookmarkReview()) return;

    showTcScreen('scLoading');
    try {
        await loadTestManifest();
        testDirectory = [];
        renderTestTree();
        renderResumeBanner();
        if (location.hash === '#history') showTestHistory();
        else showTcScreen('scHome');
    } catch (e) {
        console.error(e);
        showTcScreen('scHome');
        document.getElementById('testTree').innerHTML = `
            <div class="tc-note error">
                <strong>Could not load the test list.</strong>
                <p>Check that <code>data/test-manifest.json</code> exists and is valid JSON. You can build it in the Manifest Editor under the "Test Cafe" tab.</p>
            </div>`;
    }
}

// ==================== HOME / BROWSE ====================
function currentTestNode() {
    return testDirectory.length ? testDirectory[testDirectory.length - 1] : testManifestRoot;
}

function renderTestTree() {
    const node = currentTestNode();
    const container = document.getElementById('testTree');
    if (!container || !node) return;

    let html = '';

    if (testDirectory.length > 0) {
        html += `
            <div class="tc-crumbs">
                <button class="tc-crumb-back" onclick="goBackTestTree()">← Back</button>
                <div class="tc-crumb-path">
                    <button class="tc-crumb" onclick="goTestHome()">🏠 All Tests</button>
                    ${testDirectory.map((d, i) => `
                        <span class="tc-crumb-sep">›</span>
                        <button class="tc-crumb ${i === testDirectory.length - 1 ? 'active' : ''}"
                                onclick="goToTestLevel(${i})">${tcEsc(d.name)}</button>
                    `).join('')}
                </div>
            </div>`;
    }

    const folders = node.subsections || [];
    const files = node.files || [];

    if (folders.length === 0 && files.length === 0) {
        html += `<div class="tc-note"><strong>This folder is empty.</strong><p>Add test files to it in the Manifest Editor.</p></div>`;
        container.innerHTML = html;
        return;
    }

    folders.forEach((f, i) => {
        const count = (f.subsections || []).length + (f.files || []).length;
        html += `
            <button class="tc-row folder" onclick="enterTestFolder(${i})">
                <span class="tc-row-icon">${tcEsc(f.icon || '📁')}</span>
                <span class="tc-row-body">
                    <span class="tc-row-name">${tcEsc(f.name)}</span>
                    <span class="tc-row-meta">${count} item${count !== 1 ? 's' : ''}</span>
                </span>
                <span class="tc-row-go">›</span>
            </button>`;
    });

    files.forEach(file => {
        const label = String(file).split('/').pop().replace(/\.json$/i, '').replace(/[_-]+/g, ' ');
        html += `
            <button class="tc-row file" onclick="openTestDetail('${tbAttr(file)}')">
                <span class="tc-row-icon">📝</span>
                <span class="tc-row-body">
                    <span class="tc-row-name">${tcEsc(label)}</span>
                    <span class="tc-row-meta">Tap to see sections &amp; start</span>
                </span>
                <span class="tc-row-go">›</span>
            </button>`;
    });

    container.innerHTML = html;
}

function enterTestFolder(i) {
    const node = currentTestNode();
    const sub = (node.subsections || [])[i];
    if (!sub) return;
    testDirectory.push(sub);
    renderTestTree();
}

function goBackTestTree() {
    testDirectory.pop();
    renderTestTree();
}

function goToTestLevel(i) {
    testDirectory = testDirectory.slice(0, i + 1);
    renderTestTree();
}

function goTestHome() {
    testDirectory = [];
    renderTestTree();
    renderResumeBanner();
    showTcScreen('scHome');
}

/* One unfinished test can be parked at a time; surface it wherever the user
   lands so it is never silently stranded. */
function renderResumeBanner() {
    const el = document.getElementById('resumeBanner');
    if (!el) return;
    const saved = getInProgressTest();
    if (!saved) { el.innerHTML = ''; return; }

    el.innerHTML = `
        <div class="tc-resume">
            <div class="tc-resume-body">
                <div class="tc-resume-title">⏸ Test in progress</div>
                <div class="tc-resume-meta">
                    ${tcEsc(saved.testName)} · ${formatClock(saved.remainingSec)} left · saved ${formatAttemptDate(saved.savedAt)}
                </div>
            </div>
            <div class="tc-resume-actions">
                <button class="btn btn-primary btn-sm" onclick="resumeSavedTest()">▶ Resume</button>
                <button class="btn btn-ghost btn-sm" onclick="discardSavedTest()">Discard</button>
            </div>
        </div>`;
}

async function resumeSavedTest() {
    const saved = getInProgressTest();
    if (!saved) return;
    showTcScreen('scLoading');
    try {
        await restoreInProgressSession(saved);
        openRunner();
        startTestTimerLoop(onTimerTick, handleTimeUp);
        updateTimerDisplay(TS.remainingSec);
    } catch (e) {
        alert('Could not resume that test: ' + e.message);
        clearInProgressTest();
        goTestHome();
    }
}

function discardSavedTest() {
    if (!confirm('Discard the unfinished test? Its answers will be lost.')) return;
    clearInProgressTest();
    renderResumeBanner();
    if (pendingTest) renderTestDetail(pendingTest, pendingSource);
}

// ==================== TEST DETAIL / INSTRUCTIONS ====================
let pendingTest = null;

async function openTestDetail(file) {
    showTcScreen('scLoading');
    try {
        pendingTest = await loadTestFile(file);
        renderTestDetail(pendingTest, { kind: 'file', file: file });
        showTcScreen('scInstructions');
    } catch (e) {
        alert('Could not open that test: ' + e.message);
        showTcScreen('scHome');
    }
}

let pendingSource = null;

function renderTestDetail(test, source) {
    pendingTest = test;
    pendingSource = source;
    const el = document.getElementById('testDetail');
    if (!el) return;

    const testKey = testKeyFor(source, test);
    const attempts = attemptsForKey(testKey).slice().reverse();   // newest first
    const saved = getInProgressTest();
    const hasResume = saved && saved.testKey === testKey;

    el.innerHTML = `
        <button class="tc-back-link" onclick="showTcScreen('${source.kind === 'custom' ? 'scCustom' : 'scHome'}')">← Back</button>
        <div class="tc-detail-card">
            <h1>${tcEsc(test.name)}</h1>
            ${test.description ? `<p class="tc-detail-desc">${tcEsc(test.description)}</p>` : ''}

            <div class="tc-detail-stats">
                <div><span class="v">${test.totalQuestions}</span><span class="l">Questions</span></div>
                <div><span class="v">${test.sections.length}</span><span class="l">Sections</span></div>
                <div><span class="v">${test.duration}</span><span class="l">Minutes</span></div>
                <div><span class="v">${test.totalMarks}</span><span class="l">Max Marks</span></div>
            </div>

            <h2 class="tc-detail-sub">Sections</h2>
            <div class="tc-detail-sections">
                ${test.sections.map(s => `
                    <div class="tc-detail-section">
                        <span class="s-icon">${tcEsc(s.icon || '📗')}</span>
                        <span class="s-name">${tcEsc(s.name)}</span>
                        <span class="s-meta">${s.questions.length} Qs · +${s.marking.correct} / ${s.marking.incorrect}</span>
                    </div>
                `).join('')}
            </div>

            ${hasResume ? `
                <div class="tc-resume inline">
                    <div class="tc-resume-body">
                        <div class="tc-resume-title">⏸ You left this test unfinished</div>
                        <div class="tc-resume-meta">${formatClock(saved.remainingSec)} left on the clock</div>
                    </div>
                    <div class="tc-resume-actions">
                        <button class="btn btn-primary btn-sm" onclick="resumeSavedTest()">▶ Resume</button>
                        <button class="btn btn-ghost btn-sm" onclick="discardSavedTest()">Discard</button>
                    </div>
                </div>` : ''}

            ${attempts.length ? renderAttemptList(attempts, 'Your attempts') : ''}

            <div class="tc-detail-actions">
                <button class="btn btn-primary tc-big-btn" onclick="startPendingTest()">
                    ${attempts.length ? '🔄 Re-attempt Test' : '▶ Start Test'}
                </button>
            </div>
            <p class="tc-detail-hint">
                The timer starts as soon as you begin.
                ${attempts.length
                    ? 'Your earlier attempts are kept — a re-attempt is saved alongside them.'
                    : 'Your answers and results are saved on this device.'}
            </p>
        </div>
    `;
    tcTypeset(el);
}

/* Shared by the test detail screen and the history screen. */
function renderAttemptList(attempts, heading) {
    return `
        <h2 class="tc-detail-sub" style="margin-top:1.75rem;">${tcEsc(heading)} (${attempts.length})</h2>
        <div class="att-list">
            ${attempts.map(a => {
                const s = a.summary || {};
                const pct = s.maxScore ? (s.score / s.maxScore) * 100 : 0;
                return `
                    <div class="att-row">
                        <div class="att-badge">${ordinal(a.attemptNo)}</div>
                        <div class="att-body">
                            <div class="att-score">
                                ${(s.score || 0).toFixed(2)} <span>/ ${s.maxScore || 0}</span>
                                <span class="att-pct ${pct >= 60 ? 'good' : pct >= 33 ? 'mid' : 'low'}">${pct.toFixed(0)}%</span>
                            </div>
                            <div class="att-meta">
                                ✔ ${s.correct || 0} · ✘ ${s.incorrect || 0} · — ${s.skipped || 0}
                                · ${formatClock((s.totalTimeMs || 0) / 1000)}
                            </div>
                            <div class="att-date">${formatAttemptDate(a.endedAt)}</div>
                        </div>
                        <div class="att-actions">
                            <button class="btn btn-ghost btn-sm" onclick="openAttemptAnalysis('${tbAttr(a.id)}')">
                                📊 ${ordinal(a.attemptNo)} attempt analysis
                            </button>
                            <button class="tb-icon-btn del" title="Delete this attempt"
                                    onclick="removeAttempt('${tbAttr(a.id)}')">✕</button>
                        </div>
                    </div>`;
            }).join('')}
        </div>`;
}

function startPendingTest() {
    if (!pendingTest) return;

    const saved = getInProgressTest();
    if (saved && !confirm(
        saved.testKey === testKeyFor(pendingSource, pendingTest)
            ? 'Starting fresh will discard the unfinished attempt you have saved for this test. Continue?'
            : `You have an unfinished "${saved.testName}" saved. Starting this test will discard it. Continue?`)) {
        return;
    }
    clearInProgressTest();

    beginTestSession(pendingTest, pendingSource);
    openRunner();
    startTestTimerLoop(onTimerTick, handleTimeUp);
    updateTimerDisplay(TS.remainingSec);
    saveInProgressTest();
}

// ==================== TEST HISTORY ====================
function showTestHistory() {
    renderTestHistory();
    showTcScreen('scHistory');
}

function renderTestHistory() {
    const el = document.getElementById('historyBody');
    if (!el) return;

    const groups = groupedAttemptHistory();
    const totalAttempts = groups.reduce((n, g) => n + g.attempts.length, 0);

    if (groups.length === 0) {
        el.innerHTML = `
            <button class="tc-back-link" onclick="goTestHome()">← Back to Test Cafe</button>
            <div class="tb-empty">
                <div class="tb-empty-icon">📊</div>
                <h3>No tests taken yet</h3>
                <p>Once you finish a test it appears here, with every attempt and its analysis.</p>
                <button class="btn btn-primary" style="margin-top:1.25rem;" onclick="goTestHome()">🧪 Browse tests</button>
            </div>`;
        return;
    }

    el.innerHTML = `
        <button class="tc-back-link" onclick="goTestHome()">← Back to Test Cafe</button>
        <section class="tc-hero" style="padding-top:1rem;">
            <h1>📊 Test History</h1>
            <p>${totalAttempts} attempt${totalAttempts !== 1 ? 's' : ''} across ${groups.length} test${groups.length !== 1 ? 's' : ''}, saved on this device.</p>
        </section>

        ${groups.map((g, gi) => `
            <div class="hist-group">
                <div class="hist-group-head">
                    <div>
                        <div class="hist-group-name">${g.kind === 'custom' ? '⚙️' : '📝'} ${tcEsc(g.testName)}</div>
                        <div class="hist-group-meta">
                            ${g.attempts.length} attempt${g.attempts.length !== 1 ? 's' : ''}
                            · best ${g.best.toFixed(2)} / ${g.maxScore}
                            · last on ${formatAttemptDate(g.lastAt)}
                        </div>
                    </div>
                    ${g.kind === 'file' && g.attempts[0].source && g.attempts[0].source.file ? `
                        <button class="btn btn-ghost btn-sm" onclick="openTestDetail('${tbAttr(g.attempts[0].source.file)}')">
                            🔄 Re-attempt
                        </button>` : ''}
                </div>
                ${renderAttemptList(g.attempts, 'Attempts')}
            </div>
        `).join('')}

        <div class="rs-actions secondary">
            <button class="btn btn-ghost" onclick="wipeTestHistory()" style="color:var(--error);">🗑️ Clear all history</button>
        </div>`;
}

function removeAttempt(id) {
    if (!confirm('Delete this attempt and its analysis?')) return;
    deleteAttempt(id);
    const historyOpen = document.getElementById('scHistory').classList.contains('active');
    if (historyOpen) renderTestHistory();
    else if (pendingTest) renderTestDetail(pendingTest, pendingSource);
}

function wipeTestHistory() {
    if (!confirm('Delete ALL saved attempts for every test? This cannot be undone.')) return;
    clearAllAttempts();
    renderTestHistory();
}

/* Opens a stored attempt: always the results dashboard, and the detailed
   analysis too whenever the questions could be rebuilt. */
async function openAttemptAnalysis(id) {
    const attempt = getAttemptById(id);
    if (!attempt) return;

    showTcScreen('scLoading');
    const detail = await loadAttemptIntoSession(attempt);
    renderResults(detail === 'summary');
    showResultsScreen();
}

// ==================== CUSTOM TEST BUILDER ====================
async function showTestCustomBuilder() {
    showTcScreen('scLoading');
    try {
        const { failed } = await loadAllTestFiles();
        if (Object.keys(loadedTests).length === 0) {
            throw new Error('No readable test files were found in the test manifest.');
        }
        renderCustomBuilder(failed);
        showTcScreen('scCustom');
    } catch (e) {
        alert('Could not open the custom test builder: ' + e.message);
        showTcScreen('scHome');
    }
}

function renderCustomBuilder(failed) {
    const container = document.getElementById('customTree');
    if (!container) return;

    let html = '';
    if (failed && failed.length) {
        html += `<div class="tc-note error"><strong>${failed.length} file(s) could not be read</strong><p>${failed.map(tcEsc).join(', ')}</p></div>`;
    }

    Object.entries(loadedTests).forEach(([file, test]) => {
        html += `
            <div class="ct-test">
                <div class="ct-test-head">
                    <span class="ct-test-name">📝 ${tcEsc(test.name)}</span>
                    <span class="ct-test-meta">${test.sections.length} sections · ${test.totalQuestions} Qs</span>
                </div>
                <div class="ct-section-list">
                    ${test.sections.map((s, si) => {
                        const key = customSelectionKey(file, si);
                        const pick = customSectionSelection[key];
                        const on = !!pick;
                        return `
                            <div class="ct-section ${on ? 'on' : ''}">
                                <label class="ct-section-main">
                                    <input type="checkbox" ${on ? 'checked' : ''}
                                           onchange="toggleCustomSection('${tbAttr(file)}', ${si}, this.checked)">
                                    <span class="ct-section-icon">${tcEsc(s.icon || '📗')}</span>
                                    <span class="ct-section-name">${tcEsc(s.name)}</span>
                                    <span class="ct-section-count">${s.questions.length} Qs</span>
                                </label>
                                ${on ? `
                                    <div class="ct-section-cfg">
                                        <label>Take</label>
                                        <input type="number" min="1" max="${s.questions.length}" value="${pick.count}"
                                               onchange="setCustomSectionCount('${tbAttr(file)}', ${si}, this.value)">
                                        <span>of ${s.questions.length}</span>
                                    </div>
                                ` : ''}
                            </div>`;
                    }).join('')}
                </div>
            </div>`;
    });

    container.innerHTML = html;
    updateCustomSummary();
}

function toggleCustomSection(file, sectionIndex, checked) {
    const key = customSelectionKey(file, sectionIndex);
    const test = loadedTests[file];
    if (!test) return;
    const section = test.sections[sectionIndex];
    if (!section) return;

    if (checked) {
        customSectionSelection[key] = {
            file: file,
            testName: test.name,
            sectionIndex: sectionIndex,
            sectionName: section.name,
            total: section.questions.length,
            count: section.questions.length
        };
    } else {
        delete customSectionSelection[key];
    }
    renderCustomBuilder();
}

function setCustomSectionCount(file, sectionIndex, value) {
    const key = customSelectionKey(file, sectionIndex);
    const pick = customSectionSelection[key];
    if (!pick) return;
    let n = parseInt(value, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > pick.total) n = pick.total;
    pick.count = n;
    updateCustomSummary();
}

function updateCustomSummary() {
    const picks = customSelectionList();
    const totalQs = picks.reduce((n, p) => n + p.count, 0);
    const summary = document.getElementById('ctSummary');
    const startBtn = document.getElementById('ctStartBtn');

    if (summary) {
        summary.innerHTML = picks.length === 0
            ? 'Pick at least one section to build your test.'
            : `<strong>${picks.length}</strong> section${picks.length !== 1 ? 's' : ''} · <strong>${totalQs}</strong> question${totalQs !== 1 ? 's' : ''} selected`;
    }
    if (startBtn) startBtn.disabled = picks.length === 0;
}

function clearCustomSelection() {
    customSectionSelection = {};
    renderCustomBuilder();
}

function buildAndPreviewCustomTest() {
    const nameInput = document.getElementById('ctNameInput');
    const durInput = document.getElementById('ctDurationInput');
    const shuffleInput = document.getElementById('ctShuffleInput');

    let duration = parseInt(durInput && durInput.value, 10);
    if (isNaN(duration) || duration < 1) duration = 60;

    const test = buildCustomTest({
        name: (nameInput && nameInput.value.trim()) || 'My Custom Test',
        duration: duration,
        shuffle: !!(shuffleInput && shuffleInput.checked)
    });

    if (!test) return;
    // customSource carries the blueprint an attempt needs to rebuild this paper.
    renderTestDetail(test, test.customSource);
    showTcScreen('scInstructions');
}

// ==================== RUNNER ====================
function openRunner() {
    showTcScreen('scRunner');
    renderRunnerChrome();
    renderQuestion();
    renderSidePanel();
}

/* Header and footer differ per mode: a live test needs a timer and Submit,
   a review needs a way back to where the reader came from. */
function renderRunnerChrome() {
    const timerEl = document.getElementById('trTimer');
    const titleEl = document.getElementById('trTitle');
    const submitBtn = document.getElementById('trSubmitBtn');

    if (titleEl) {
        const base = TS.test ? TS.test.name : '';
        titleEl.textContent = TS.mode === 'analysis' && TS.attemptNo
            ? `${base} · ${ordinal(TS.attemptNo)} attempt`
            : base;
    }

    if (TS.mode === 'test') {
        if (timerEl) { timerEl.style.display = ''; timerEl.classList.remove('low'); }
        if (submitBtn) {
            submitBtn.textContent = 'Submit';
            submitBtn.className = 'tr-submit';
            submitBtn.onclick = confirmSubmit;
        }
    } else if (TS.mode === 'analysis') {
        if (timerEl) timerEl.style.display = 'none';
        if (submitBtn) {
            submitBtn.textContent = '← Results';
            submitBtn.className = 'tr-submit ghost';
            submitBtn.onclick = showResultsScreen;
        }
    } else {
        if (timerEl) timerEl.style.display = 'none';
        if (submitBtn) {
            submitBtn.textContent = '← Bookmarks';
            submitBtn.className = 'tr-submit ghost';
            submitBtn.onclick = () => { window.location.href = 'test-bookmarks.html'; };
        }
    }
}

function updateTimerDisplay(sec) {
    const el = document.getElementById('trTimer');
    if (!el) return;
    el.innerHTML = `<span class="tr-clock-ico">⏱</span>${formatClock(sec)}`;
    el.classList.toggle('low', sec <= 300);
}

/* Persist every 5s so a crash costs at most five seconds of the clock. */
function onTimerTick(sec) {
    updateTimerDisplay(sec);
    if (sec % 5 === 0) saveInProgressTest();
}

function handleTimeUp() {
    alert('Time is up — your test has been submitted automatically.');
    doSubmit();
}

// ---- question area ----
function renderQuestion() {
    const main = document.getElementById('trMain');
    if (!main || !TS.flat.length) return;

    const q = TS.flat[TS.currentIndex];
    const rec = TS.answers[TS.currentIndex] || {};
    const live = TS.mode === 'test';

    if (live) rec.visited = true;
    TS.activeSection = q.sectionIndex;

    // Bookmark review has no attempt behind it, so it gets no correct/incorrect chip.
    const outcome = TS.mode === 'analysis' ? questionOutcome(TS.currentIndex) : null;
    const bookmarked = isTestQuestionBookmarked(q);

    const timeBadge = TS.mode === 'analysis'
        ? `<span class="q-time-badge">⏱ Time Spent: ${formatShortDuration(rec.timeMs || 0)}</span>`
        : '';

    const markBtn = live
        ? `<button class="q-mark-btn ${rec.marked ? 'on' : ''}" onclick="toggleMarkForReview()">
               🚩 ${rec.marked ? 'Marked' : 'Mark for Review'}
           </button>`
        : '';

    const outcomeChip = outcome
        ? `<span class="q-outcome ${outcome}">${outcome === 'correct' ? '✔ Correct' : outcome === 'incorrect' ? '✘ Incorrect' : '— Skipped'}</span>`
        : '';

    const markScheme = q.marking
        ? `<span class="q-marks">+${q.marking.correct} / ${q.marking.incorrect}</span>`
        : '';

    main.innerHTML = `
        <div class="q-card">
            <div class="q-card-top">
                <div class="q-no">Q. ${q.numberInSection}</div>
                <div class="q-top-actions">
                    ${timeBadge}
                    ${outcomeChip}
                    ${markBtn}
                    <button class="q-bm-btn ${bookmarked ? 'on' : ''}" onclick="bookmarkCurrentQuestion()"
                            title="${bookmarked ? 'Remove bookmark' : 'Bookmark this question'}">🔖</button>
                </div>
            </div>

            <div class="q-tags">
                <span class="q-section-tag">${tcEsc(q.sectionName)}</span>
                ${markScheme}
            </div>

            ${q.question ? `<div class="q-text">${tcEsc(q.question)}</div>` : ''}
            ${q.image_url ? `<div class="q-image-wrap"><img class="q-image" src="${tcAttr(q.image_url)}" alt="Question diagram" loading="lazy"></div>` : ''}

            ${q.type === 'integer' ? renderIntegerInput(q, rec) : renderOptions(q, rec)}

            ${TS.mode !== 'test' ? renderSolutionBlock(q) : ''}
        </div>
    `;

    updateFooterNav();
    renderGrid();
    tcTypeset(main);
}

function renderOptions(q, rec) {
    const live = TS.mode === 'test';
    const options = q.options || [];

    const boxes = options.map((text, i) => {
        let state = '';
        let flag = '';

        if (live) {
            if (rec.selected === i) state = 'selected';
        } else {
            const isCorrect = q.correct === i;
            const isChosen = rec.selected === i;
            if (isCorrect && isChosen) {
                state = 'correct';
                flag = 'Correct (Marked By You)';
            } else if (isCorrect) {
                state = 'correct';
                flag = 'Correct (Not Marked By You)';
            } else if (isChosen) {
                state = 'incorrect';
                flag = 'Incorrect (Marked By You)';
            }
        }

        const optImage = q.optionImages && q.optionImages[i]
            ? `<img class="opt-image" src="${tcAttr(q.optionImages[i])}" alt="Option ${TC_LETTERS[i]}" loading="lazy">`
            : '';
        const label = text && String(text).trim() !== ''
            ? tcEsc(text)
            : (optImage ? '' : `Option ${i + 1}`);

        return `
            <button type="button" class="opt ${state}" ${live ? `onclick="selectOption(${i})"` : 'disabled'}>
                <span class="opt-key">${TC_LETTERS[i] || i + 1}</span>
                <span class="opt-body">
                    ${label ? `<span class="opt-text">${label}</span>` : ''}
                    ${optImage}
                    ${flag ? `<span class="opt-flag">${flag}</span>` : ''}
                </span>
            </button>`;
    }).join('');

    const clearBtn = live && rec.selected !== null && rec.selected !== undefined
        ? `<button class="q-clear-btn" onclick="clearAnswer()">Clear response</button>`
        : '';

    return `<div class="q-options">${boxes}</div>${clearBtn}`;
}

function renderIntegerInput(q, rec) {
    const live = TS.mode === 'test';
    if (live) {
        return `
            <div class="q-integer">
                <label for="trIntInput">Your answer</label>
                <input type="text" inputmode="decimal" id="trIntInput" class="q-int-input"
                       value="${tcAttr(rec.value || '')}" placeholder="Type a number…"
                       oninput="setIntegerAnswer(this.value)">
                ${rec.value ? `<button class="q-clear-btn" onclick="clearAnswer()">Clear response</button>` : ''}
            </div>`;
    }

    const given = String(rec.value || '').trim();
    const correctVal = q.answer === null || q.answer === undefined ? '' : String(q.answer);
    const right = isQuestionCorrect(q, rec);

    return `
        <div class="q-integer-review">
            <div class="opt ${given === '' ? '' : (right ? 'correct' : 'incorrect')}">
                <span class="opt-key">You</span>
                <span class="opt-body">
                    <span class="opt-text">${given === '' ? 'Not attempted' : tcEsc(given)}</span>
                    ${given === '' ? '' : `<span class="opt-flag">${right ? 'Correct (Marked By You)' : 'Incorrect (Marked By You)'}</span>`}
                </span>
            </div>
            <div class="opt correct">
                <span class="opt-key">Ans</span>
                <span class="opt-body">
                    <span class="opt-text">${tcEsc(correctVal)}</span>
                    <span class="opt-flag">${right ? 'Correct (Marked By You)' : 'Correct (Not Marked By You)'}</span>
                </span>
            </div>
        </div>`;
}

/* Explanation is optional in the data, so the block only appears when there is
   something to show. */
function renderSolutionBlock(q) {
    if (!q.explanation && !q.explanation_image) {
        return `<div class="q-explain empty">No explanation was provided for this question.</div>`;
    }
    return `
        <div class="q-explain">
            <h4>💡 Explanation</h4>
            ${q.explanation ? `<p>${tcEsc(q.explanation)}</p>` : ''}
            ${q.explanation_image ? `<img class="q-explain-img" src="${tcAttr(q.explanation_image)}" alt="Solution" loading="lazy">` : ''}
        </div>`;
}

// ---- interactions ----
function selectOption(i) {
    if (TS.mode !== 'test') return;
    const rec = TS.answers[TS.currentIndex];
    rec.selected = rec.selected === i ? null : i;
    renderQuestion();
    saveInProgressTest();
}

function setIntegerAnswer(value) {
    if (TS.mode !== 'test') return;
    TS.answers[TS.currentIndex].value = value;
    renderGrid();
    updateFooterNav();
    saveInProgressTest();
}

function clearAnswer() {
    const rec = TS.answers[TS.currentIndex];
    rec.selected = null;
    rec.value = '';
    renderQuestion();
    saveInProgressTest();
}

function toggleMarkForReview() {
    const rec = TS.answers[TS.currentIndex];
    rec.marked = !rec.marked;
    renderQuestion();
    saveInProgressTest();
}

function goToQuestion(index) {
    if (index < 0 || index >= TS.flat.length) return;
    flushQuestionTime();
    TS.currentIndex = index;
    TS.qEnterAt = Date.now();
    if (TS.answers[index]) TS.answers[index].visited = true;
    if (TS.mode === 'test') saveInProgressTest();
    renderQuestion();
    renderSidePanel();
    closeMobileGrid();
    const main = document.getElementById('trMain');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
}

function nextQuestionTC() { goToQuestion(TS.currentIndex + 1); }
function prevQuestionTC() { goToQuestion(TS.currentIndex - 1); }

function switchSection(sectionIndex) {
    const first = TS.flat.findIndex(q => q.sectionIndex === sectionIndex);
    if (first >= 0) goToQuestion(first);
}

function updateFooterNav() {
    const prev = document.getElementById('trPrev');
    const next = document.getElementById('trNext');
    if (prev) prev.disabled = TS.currentIndex === 0;
    if (next) {
        const last = TS.currentIndex === TS.flat.length - 1;
        next.disabled = last;
        next.textContent = last ? 'Last question' : 'Next ›';
    }
}

function bookmarkCurrentQuestion() {
    const q = TS.flat[TS.currentIndex];
    openTestBookmarkPanel(q, TS.test ? TS.test.name : '');
}

/* Called by test-bookmarks.js after a save or an un-save. */
function onTestBookmarkChanged() {
    renderQuestion();
}

// ---- side panel: tabs, legend, grid ----
function renderSidePanel() {
    renderSectionTabs();
    renderFilters();
    renderLegend();
    renderGrid();
}

function renderSectionTabs() {
    const el = document.getElementById('trTabs');
    if (!el || !TS.test) return;
    el.innerHTML = TS.test.sections.map((s, i) => `
        <button class="tr-tab ${i === TS.activeSection ? 'active' : ''}" onclick="switchSection(${i})">
            ${tcEsc(s.name)}
        </button>
    `).join('');
}

function renderFilters() {
    const el = document.getElementById('trFilters');
    if (!el) return;
    if (TS.mode !== 'analysis') {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }
    el.style.display = '';
    const filters = [
        { id: 'all', label: 'All' },
        { id: 'correct', label: 'Correct' },
        { id: 'incorrect', label: 'Incorrect' },
        { id: 'skipped', label: 'Skipped' }
    ];
    el.innerHTML = filters.map(f => `
        <button class="tr-chip ${TS.analysisFilter === f.id ? 'active' : ''}" onclick="setAnalysisFilter('${f.id}')">
            ${f.label}
        </button>
    `).join('');
}

function setAnalysisFilter(id) {
    TS.analysisFilter = id;
    renderFilters();
    renderGrid();
}

function renderLegend() {
    const el = document.getElementById('trLegend');
    if (!el) return;

    const items = TS.mode === 'test'
        ? [
            ['answered', 'Answered'],
            ['unvisited', 'Not Visited'],
            ['visited', 'Not Answered'],
            ['marked', 'Marked for Review']
        ]
        : TS.mode === 'analysis'
            ? [
                ['answered', 'Correct'],
                ['wrong', 'Incorrect'],
                ['unvisited', 'Skipped']
            ]
            : [['unvisited', 'Bookmarked question']];

    el.innerHTML = items.map(([cls, label]) =>
        `<span class="tr-legend-item"><i class="dot ${cls}"></i>${label}</span>`).join('');
}

function renderGrid() {
    const el = document.getElementById('trGrid');
    if (!el) return;

    const inSection = TS.flat.filter(q => q.sectionIndex === TS.activeSection);

    const visible = inSection.filter(q => {
        if (TS.mode !== 'analysis' || TS.analysisFilter === 'all') return true;
        return questionOutcome(q.globalIndex) === TS.analysisFilter;
    });

    if (visible.length === 0) {
        el.innerHTML = `<p class="tr-grid-empty">No questions match this filter in ${tcEsc(TS.test.sections[TS.activeSection].name)}.</p>`;
        return;
    }

    el.innerHTML = visible.map(q => {
        let cls = 'tr-cell';
        if (TS.mode === 'test') {
            cls += ' ' + questionStatus(q.globalIndex);
        } else if (TS.mode === 'analysis') {
            const outcome = questionOutcome(q.globalIndex);
            cls += outcome === 'correct' ? ' answered' : outcome === 'incorrect' ? ' wrong' : ' unvisited';
        } else {
            cls += ' unvisited';
        }
        if (q.globalIndex === TS.currentIndex) cls += ' current';
        return `<button class="${cls}" onclick="goToQuestion(${q.globalIndex})">${q.numberInSection}</button>`;
    }).join('');
}

// ---- mobile grid drawer ----
function toggleMobileGrid() {
    const side = document.getElementById('trSide');
    const overlay = document.getElementById('trSideOverlay');
    if (!side) return;
    const open = side.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active', open);
}

function closeMobileGrid() {
    const side = document.getElementById('trSide');
    const overlay = document.getElementById('trSideOverlay');
    if (side) side.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

// ==================== SUBMIT ====================
function confirmSubmit() {
    flushQuestionTime();
    const answered = TS.flat.filter(q => isAnswered(TS.answers[q.globalIndex], q)).length;
    const marked = TS.flat.filter(q => TS.answers[q.globalIndex].marked).length;

    const body = document.getElementById('tcModalBody');
    if (body) {
        body.innerHTML = `
            <div class="tc-modal-stats">
                <div><span class="v">${answered}</span><span class="l">Answered</span></div>
                <div><span class="v">${TS.flat.length - answered}</span><span class="l">Not answered</span></div>
                <div><span class="v">${marked}</span><span class="l">Marked</span></div>
            </div>`;
    }
    const modal = document.getElementById('tcModal');
    if (modal) modal.classList.add('active');
}

function closeSubmitModal() {
    const modal = document.getElementById('tcModal');
    if (modal) modal.classList.remove('active');
    TS.qEnterAt = Date.now();
}

function doSubmit() {
    // Flush first: auto-submit on time-up reaches here without confirmSubmit().
    flushQuestionTime();
    closeSubmitModal();
    stopTestTimerLoop();
    TS.endedAt = Date.now();
    TS.submitted = true;
    TS.mode = 'analysis';
    TS.result = computeResult();
    TS.resultTestName = TS.test.name;
    closeMobileGrid();

    // The attempt joins the history the moment it is submitted.
    recordCurrentAttempt();
    clearInProgressTest();

    renderResults();
    showResultsScreen();
}

function showResultsScreen() {
    showTcScreen('scResults');
}

// ==================== RESULTS DASHBOARD ====================
/* summaryOnly: the attempt is stored but its questions could not be rebuilt,
   so everything except the question-by-question view still works. */
function renderResults(summaryOnly) {
    const el = document.getElementById('resultsBody');
    if (!el || !TS.result) return;
    const r = TS.result;
    const name = TS.resultTestName || (TS.test ? TS.test.name : '');
    const attemptLabel = TS.attemptNo ? `${ordinal(TS.attemptNo)} attempt` : '';

    el.innerHTML = `
        ${TS.viewingAttemptId ? `<button class="tc-back-link" onclick="showTestHistory()">← Back to Test History</button>` : ''}
        <div class="rs-banner">
            <div class="rs-banner-label">Your Score${attemptLabel ? ` · ${attemptLabel}` : ''}</div>
            <div class="rs-banner-score">${r.score.toFixed(2)} <span>Out of ${r.maxScore}</span></div>
            <div class="rs-banner-test">${tcEsc(name)}</div>
        </div>

        ${summaryOnly ? `
            <div class="tc-note error">
                <strong>Question-by-question analysis is unavailable for this attempt.</strong>
                <p>The test file it came from has changed or is no longer published, so the questions could not be rebuilt. Your score and section breakdown below are unaffected.</p>
            </div>` : ''}

        <div class="rs-stats">
            <div class="rs-stat correct">
                <div class="rs-stat-ico">✔</div>
                <div class="rs-stat-v">${r.correct}</div>
                <div class="rs-stat-l">Correct</div>
            </div>
            <div class="rs-stat wrong">
                <div class="rs-stat-ico">✘</div>
                <div class="rs-stat-v">${r.incorrect}</div>
                <div class="rs-stat-l">Incorrect</div>
            </div>
            <div class="rs-stat skip">
                <div class="rs-stat-ico">—</div>
                <div class="rs-stat-v">${r.skipped}</div>
                <div class="rs-stat-l">Skipped</div>
            </div>
            <div class="rs-stat acc">
                <div class="rs-stat-ico">🎯</div>
                <div class="rs-stat-v">${r.accuracy.toFixed(1)}%</div>
                <div class="rs-stat-l">Accuracy</div>
            </div>
            <div class="rs-stat time">
                <div class="rs-stat-ico">⏱</div>
                <div class="rs-stat-v">${formatClock(r.totalTimeMs / 1000)}</div>
                <div class="rs-stat-l">Time Taken</div>
            </div>
        </div>

        <h2 class="rs-heading">Section-wise Analysis</h2>
        <div class="rs-table-wrap">
            <table class="rs-table">
                <thead>
                    <tr><th>Section</th><th>Correct Answers</th><th>Score</th></tr>
                </thead>
                <tbody>
                    ${r.sections.map(s => `
                        <tr>
                            <td>
                                <span class="rs-sec-name">${tcEsc(s.icon || '')} ${tcEsc(s.name)}</span>
                                <span class="rs-sec-sub">${s.incorrect} incorrect · ${s.skipped} skipped · ${formatShortDuration(s.timeMs)}</span>
                            </td>
                            <td class="rs-num">${s.correct} / ${s.total}</td>
                            <td class="rs-num rs-score">${s.score.toFixed(2)} <span>/ ${s.maxScore}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="rs-actions">
            <button class="btn btn-ghost tc-big-btn" onclick="reattemptTest()">🔄 Re-attempt Test</button>
            <button class="btn btn-primary tc-big-btn" onclick="openAnalysis()" ${summaryOnly ? 'disabled' : ''}>
                🔍 Show Detailed Analysis
            </button>
        </div>
        <div class="rs-actions secondary">
            <button class="tc-back-link" onclick="showTestHistory()">📊 Test History</button>
            <button class="tc-back-link" onclick="goTestHome()">← Back to Test Cafe</button>
        </div>
    `;
}

function openAnalysis() {
    if (!TS.flat.length) return;
    TS.mode = 'analysis';
    TS.analysisFilter = 'all';
    TS.currentIndex = 0;
    TS.activeSection = 0;
    openRunner();
}

/* Results are kept in history, so a re-attempt adds one rather than replacing. */
async function reattemptTest() {
    let test = TS.test;
    if (!test) {
        showTcScreen('scLoading');
        try {
            test = await rebuildTestFromSource(TS.source);
        } catch (e) { /* handled below */ }
        if (!test) {
            alert('This test can no longer be loaded, so it cannot be re-attempted.');
            showResultsScreen();
            return;
        }
    }

    const nextNo = attemptsForKey(TS.testKey).length + 1;
    if (!confirm(`Start this test again? It will be saved as your ${ordinal(nextNo)} attempt — earlier attempts are kept.`)) {
        showResultsScreen();
        return;
    }

    clearInProgressTest();
    beginTestSession(test, TS.source);
    openRunner();
    startTestTimerLoop(onTimerTick, handleTimeUp);
    updateTimerDisplay(TS.remainingSec);
    saveInProgressTest();
}

// ==================== BOOKMARK REVIEW MODE ====================
/* Rebuilds a read-only session out of bookmark snapshots handed over by
   test-bookmarks.html. Snapshots are grouped into one "section" per source
   test section so the tabs stay meaningful. */
function resumeBookmarkReview() {
    let payload;
    try {
        const raw = sessionStorage.getItem(TB_REVIEW_KEY);
        if (!raw) return false;
        sessionStorage.removeItem(TB_REVIEW_KEY);
        payload = JSON.parse(raw);
    } catch (e) {
        return false;
    }
    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return false;

    const groups = new Map();
    payload.items.forEach(item => {
        const label = item.sectionName
            ? `${item.sectionName}${item.testName ? ' · ' + item.testName : ''}`
            : (item.testName || 'Bookmarks');
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(item);
    });

    const sections = [...groups.entries()].map(([name, items]) => ({
        name: name,
        icon: '🔖',
        marking: { correct: 4, incorrect: -1 },
        questions: items.map((item, i) => ({
            id: item.key,
            type: item.type || 'mcq',
            question: item.question || '',
            image_url: item.image_url || null,
            options: item.options || null,
            optionImages: item.optionImages || null,
            correct: item.correct === undefined ? null : item.correct,
            answer: item.answer === undefined ? null : item.answer,
            explanation: item.explanation || '',
            explanation_image: item.explanation_image || null,
            marking: null,
            bookmarkKey: item.key,
            srcTestId: item.testId,
            srcTestName: item.testName,
            srcSectionName: item.sectionName,
            srcQIndex: (item.number || 1) - 1
        }))
    }));

    TS.test = {
        id: 'bookmark-review',
        name: `🔖 ${payload.label || 'Bookmarked Questions'}`,
        description: '',
        duration: 0,
        marking: { correct: 4, incorrect: -1 },
        sections: sections,
        totalQuestions: payload.items.length,
        totalMarks: 0
    };
    TS.flat = flattenTest(TS.test);
    TS.answers = {};
    TS.flat.forEach(q => {
        TS.answers[q.globalIndex] = { selected: null, value: '', marked: false, visited: true, timeMs: 0 };
    });
    TS.mode = 'bookmark';
    TS.submitted = true;
    TS.result = null;
    TS.currentIndex = Math.min(payload.startIndex || 0, TS.flat.length - 1);
    TS.activeSection = TS.flat[TS.currentIndex].sectionIndex;

    openRunner();
    return true;
}

// ==================== GUARDS ====================
window.addEventListener('beforeunload', (e) => {
    if (TS.mode === 'test' && !TS.submitted && TS.flat.length) {
        e.preventDefault();
        e.returnValue = '';
    }
});

document.addEventListener('visibilitychange', () => {
    if (TS.mode !== 'test') return;
    if (document.hidden) { flushQuestionTime(); saveInProgressTest(); }
    else TS.qEnterAt = Date.now();
});

document.addEventListener('keydown', (e) => {
    const runnerOpen = document.getElementById('scRunner');
    if (!runnerOpen || !runnerOpen.classList.contains('active')) return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') nextQuestionTC();
    else if (e.key === 'ArrowLeft') prevQuestionTC();
    else if (e.key === 'Escape') closeMobileGrid();
});
