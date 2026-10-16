/* ============================================================
   Quizzy — Test Cafe UI
   Draws the four screens (browse, custom builder, runner,
   results). The runner is one layout serving three modes:
     'test'      — live, timed, answers hidden
     'analysis'  — read-only review of the attempt just finished
     'bookmark'  — read-only review of a saved bookmark folder
   ============================================================ */

const TC_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ==================== HISTORY / POPSTATE ROUTING ====================
let isTcHistoryNavigating = false;

function pushTcHistory(state, replace) {
    if (isTcHistoryNavigating) return;
    try {
        if (replace) {
            history.replaceState(state, '');
        } else {
            if (history.state && history.state.tcScreen === state.tcScreen && history.state.dirLen === state.dirLen) {
                return;
            }
            history.pushState(state, '');
        }
    } catch (e) { /* ignore */ }
}

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
    if (!el) return;
    if (typeof window.typesetMath === 'function') {
        return window.typesetMath(el);
    }
    if (window.MathJax && window.MathJax.typesetPromise) {
        if (window.MathJax.typesetClear) {
            try { window.MathJax.typesetClear([el]); } catch (e) { /* ignore */ }
        }
        return window.MathJax.typesetPromise([el]).catch(err => console.warn('MathJax error:', err));
    }
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
        if (location.hash === '#history') {
            showTestHistory();
        } else {
            showTcScreen('scHome');
            pushTcHistory({ cafe: 'test', tcScreen: 'scHome', dirLen: 0 }, true);
        }
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
        const folderName = f.displayName || f.name || 'Folder';
        const hasSyllabus = f.syllabus && f.syllabus.enabled !== false && f.syllabus.content;
        const sylBtn = hasSyllabus ? `
            <span class="syllabus-btn ${f.syllabus.type === 'pdf' ? 'pdf' : ''}" 
                  onclick="event.stopPropagation(); openSyllabus(${tcAttr(JSON.stringify(f.syllabus))}, '${tbAttr(folderName)}');"
                  title="View Syllabus">
                📄 ${tcEsc(f.syllabus.buttonLabel || f.syllabus.title || 'Syllabus')}
            </span>` : '';

        html += `
            <button class="tc-row folder" onclick="enterTestFolder(${i})">
                <span class="tc-row-icon">${tcEsc(f.icon || '📁')}</span>
                <span class="tc-row-body">
                    <span class="tc-row-name">${tcEsc(folderName)}</span>
                    <span class="tc-row-meta">${count} item${count !== 1 ? 's' : ''}</span>
                </span>
                ${sylBtn}
                <span class="tc-row-go">›</span>
            </button>`;
    });

    files.forEach((file) => {
        const filePath = typeof file === 'object' ? (file.path || file.file || '') : file;
        const fileDisplayName = typeof file === 'object' ? (file.displayName || file.name) : null;
        const fileSyllabus = typeof file === 'object' ? file.syllabus : null;
        const fallbackLabel = String(filePath).split('/').pop().replace(/\.json$/i, '').replace(/[_-]+/g, ' ');
        const label = fileDisplayName || fallbackLabel;

        const hasSyllabus = fileSyllabus && fileSyllabus.enabled !== false && fileSyllabus.content;
        const sylBtn = hasSyllabus ? `
            <span class="syllabus-btn ${fileSyllabus.type === 'pdf' ? 'pdf' : ''}" 
                  onclick="event.stopPropagation(); openSyllabus(${tcAttr(JSON.stringify(fileSyllabus))}, '${tbAttr(label)}');"
                  title="View Syllabus">
                📄 ${tcEsc(fileSyllabus.buttonLabel || fileSyllabus.title || 'Syllabus')}
            </span>` : '';

        const clickArg = typeof file === 'object' ? tcAttr(JSON.stringify(file)) : `'${tbAttr(filePath)}'`;
        const clickHandler = typeof file === 'object' ? `openTestDetail(${clickArg})` : `openTestDetail('${tbAttr(filePath)}')`;

        html += `
            <button class="tc-row file" onclick="${clickHandler}">
                <span class="tc-row-icon">📝</span>
                <span class="tc-row-body">
                    <span class="tc-row-name">${tcEsc(label)}</span>
                    <span class="tc-row-meta">Tap to see sections &amp; start</span>
                </span>
                ${sylBtn}
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
    pushTcHistory({ cafe: 'test', tcScreen: 'scHome', dirLen: testDirectory.length });
}

function goBackTestTree() {
    if (window.history.length > 1 && history.state && history.state.cafe === 'test' && history.state.dirLen > 0) {
        window.history.back();
    } else {
        testDirectory.pop();
        renderTestTree();
    }
}

function goToTestLevel(i) {
    testDirectory = testDirectory.slice(0, i + 1);
    renderTestTree();
    pushTcHistory({ cafe: 'test', tcScreen: 'scHome', dirLen: testDirectory.length });
}

function goTestHome() {
    testDirectory = [];
    renderTestTree();
    renderResumeBanner();
    showTcScreen('scHome');
    pushTcHistory({ cafe: 'test', tcScreen: 'scHome', dirLen: 0 });
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

async function openTestDetail(fileEntry) {
    showTcScreen('scLoading');
    try {
        const filePath = typeof fileEntry === 'object' ? (fileEntry.path || fileEntry.file || '') : fileEntry;
        const fileDisplayName = typeof fileEntry === 'object' ? (fileEntry.displayName || fileEntry.name) : null;
        const fileSyllabus = typeof fileEntry === 'object' ? fileEntry.syllabus : null;

        pendingTest = await loadTestFile(filePath);
        if (fileDisplayName) pendingTest.displayName = fileDisplayName;
        if (fileSyllabus) pendingTest.syllabus = fileSyllabus;

        renderTestDetail(pendingTest, { kind: 'file', file: filePath });
        showTcScreen('scInstructions');
        pushTcHistory({ cafe: 'test', tcScreen: 'scInstructions', filePath: filePath });
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
    const testTitle = test.displayName || test.name;
    const hasSyllabus = test.syllabus && test.syllabus.enabled !== false && test.syllabus.content;

    const syllabusHtml = hasSyllabus ? `
        <div style="margin: 0.6rem 0 1rem 0;">
            <button class="syllabus-btn ${test.syllabus.type === 'pdf' ? 'pdf' : ''}" 
                    onclick="openSyllabus(${tcAttr(JSON.stringify(test.syllabus))}, '${tbAttr(testTitle)}')">
                📄 ${tcEsc(test.syllabus.buttonLabel || test.syllabus.title || 'View Syllabus')}
            </button>
        </div>` : '';

    el.innerHTML = `
        <button class="tc-back-link" onclick="showTcScreen('${source.kind === 'custom' ? 'scCustom' : 'scHome'}')">← Back</button>
        <div class="tc-detail-card">
            <h1>${tcEsc(testTitle)}</h1>
            ${syllabusHtml}
            ${test.description ? `<p class="tc-detail-desc">${tcEsc(test.description)}</p>` : ''}

            <!-- No "Minutes" tile here: the editable Time Limit picker below owns
                 the duration, and showing the same number twice read as clutter. -->
            <div class="tc-detail-stats">
                <div><span class="v">${test.totalQuestions}</span><span class="l">Questions</span></div>
                <div><span class="v">${test.sections.length}</span><span class="l">Sections</span></div>
                <div><span class="v">${test.totalMarks}</span><span class="l">Max Marks</span></div>
            </div>

            <div class="tc-duration-picker">
                <label for="tcDurationInput">Time limit</label>
                <div class="tc-duration-controls">
                    <button type="button" class="tc-dur-step" onclick="stepTestDuration(-5)" aria-label="Decrease by 5 minutes">−</button>
                    <input type="number" id="tcDurationInput" min="1" max="600" step="1"
                           value="${test.duration}" oninput="onTestDurationInput()">
                    <span class="tc-dur-unit">min</span>
                    <button type="button" class="tc-dur-step" onclick="stepTestDuration(5)" aria-label="Increase by 5 minutes">+</button>
                </div>
                <button type="button" class="tc-dur-reset" onclick="resetTestDuration()">Reset to ${test.duration}</button>
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

/* The duration in the JSON is only a default — the picker on the detail screen
   lets the user set their own limit before starting. Clamped to 1..600 so a
   blank or nonsense entry can't produce a test that ends instantly. */
function chosenTestDuration(fallback) {
    const input = document.getElementById('tcDurationInput');
    if (!input) return fallback;
    const mins = Math.round(Number(input.value));
    if (!isFinite(mins) || mins < 1) return fallback;
    return Math.min(600, mins);
}

function stepTestDuration(delta) {
    const input = document.getElementById('tcDurationInput');
    if (!input || !pendingTest) return;
    input.value = Math.max(1, Math.min(600, chosenTestDuration(pendingTest.duration) + delta));
    onTestDurationInput();
}

function resetTestDuration() {
    const input = document.getElementById('tcDurationInput');
    if (!input || !pendingTest) return;
    input.value = pendingTest.duration;
    onTestDurationInput();
}

function onTestDurationInput() {
    const input = document.getElementById('tcDurationInput');
    const reset = document.querySelector('.tc-dur-reset');
    if (!input || !pendingTest || !reset) return;
    const changed = chosenTestDuration(pendingTest.duration) !== pendingTest.duration;
    reset.classList.toggle('show', changed);
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

    const mins = chosenTestDuration(pendingTest.duration);
    beginTestSession({ ...pendingTest, duration: mins }, pendingSource);
    openRunner();
    startTestTimerLoop(onTimerTick, handleTimeUp);
    updateTimerDisplay(TS.remainingSec);
    saveInProgressTest();
}

// ==================== TEST HISTORY ====================
function showTestHistory() {
    renderTestHistory();
    showTcScreen('scHistory');
    pushTcHistory({ cafe: 'test', tcScreen: 'scHistory' });
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
let ctTestDirectory = [];       // Breadcrumb stack of folder nodes for custom builder
let ctActiveTestFile = null;    // { filePath, displayName, test } when inspecting a single test
let ctTestDrawerOpen = false;   // Modal drawer state for reviewing chosen sections

async function showTestCustomBuilder() {
    showTcScreen('scLoading');
    try {
        await loadTestManifest();
        ctTestDirectory = [];
        ctActiveTestFile = null;
        ctTestDrawerOpen = false;
        renderCustomBuilder();
        showTcScreen('scCustom');
        pushTcHistory({ cafe: 'test', tcScreen: 'scCustom', ctDirLen: 0 });
    } catch (e) {
        alert('Could not open the custom test builder: ' + e.message);
        showTcScreen('scHome');
    }
}

function ctTestCurrentNode() {
    if (ctTestDirectory.length === 0) return testManifestRoot;
    return ctTestDirectory[ctTestDirectory.length - 1];
}

function ctEnterTestFolder(sub) {
    ctTestDirectory.push(sub);
    ctActiveTestFile = null;
    renderCustomBuilder();
}

function ctGoBackTestCustom() {
    if (ctActiveTestFile) {
        ctActiveTestFile = null;
        renderCustomBuilder();
        return;
    }
    if (ctTestDirectory.length > 0) {
        ctTestDirectory.pop();
        renderCustomBuilder();
    } else {
        goTestHome();
    }
}

function ctGoToTestLevel(i) {
    ctActiveTestFile = null;
    ctTestDirectory = ctTestDirectory.slice(0, i + 1);
    renderCustomBuilder();
}

function ctGoToTestRoot() {
    ctActiveTestFile = null;
    ctTestDirectory = [];
    renderCustomBuilder();
}

async function ctOpenTestFile(fileEntry) {
    const filePath = typeof fileEntry === 'object' ? (fileEntry.path || fileEntry.file || '') : fileEntry;
    const fileDisplayName = typeof fileEntry === 'object' ? (fileEntry.displayName || fileEntry.name) : null;
    const fallbackLabel = String(filePath).split('/').pop().replace(/\.json$/i, '').replace(/[_-]+/g, ' ');
    const displayName = fileDisplayName || fallbackLabel;

    if (loadedTests[filePath]) {
        ctActiveTestFile = {
            filePath: filePath,
            displayName: displayName,
            test: loadedTests[filePath]
        };
        renderCustomBuilder();
        return;
    }

    const container = document.getElementById('customTree');
    if (container) {
        container.innerHTML = `
            <div style="text-align:center;padding:3rem 1rem;">
                <div class="tc-spinner" style="margin:0 auto 1rem;"></div>
                <div style="font-weight:700;color:var(--text-primary);">Loading ${tcEsc(displayName)}…</div>
                <div style="font-size:0.85rem;color:var(--text-muted);margin-top:0.35rem;">Fetching test sections</div>
            </div>
        `;
    }

    try {
        const test = await loadTestFile(filePath);
        ctActiveTestFile = {
            filePath: filePath,
            displayName: displayName,
            test: test
        };
        renderCustomBuilder();
    } catch (e) {
        alert('Could not load that test: ' + e.message);
        renderCustomBuilder();
    }
}

function toggleCustomSection(file, fileDisplayName, sectionIndex, checked) {
    const key = customSelectionKey(file, sectionIndex);
    const test = (ctActiveTestFile && ctActiveTestFile.filePath === file) ? ctActiveTestFile.test : loadedTests[file];
    if (!test) return;
    const section = test.sections[sectionIndex];
    if (!section) return;

    if (checked) {
        customSectionSelection[key] = {
            file: file,
            fileDisplayName: fileDisplayName || test.name || file,
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
    renderCustomBuilder();
}

function removeCustomSection(key) {
    delete customSectionSelection[key];
    renderCustomBuilder();
}

function clearCustomSelection() {
    if (Object.keys(customSectionSelection).length === 0) return;
    if (!confirm('Clear all selected test sections?')) return;
    customSectionSelection = {};
    renderCustomBuilder();
}

function toggleCustomDrawer(force) {
    ctTestDrawerOpen = typeof force === 'boolean' ? force : !ctTestDrawerOpen;
    const drawerEl = document.getElementById('ctTestDrawer');
    const overlayEl = document.getElementById('ctTestDrawerOverlay');
    if (drawerEl) drawerEl.classList.toggle('open', ctTestDrawerOpen);
    if (overlayEl) overlayEl.classList.toggle('open', ctTestDrawerOpen);
}

function renderCustomBuilder() {
    const container = document.getElementById('customTree');
    if (!container) return;

    const picks = customSelectionList();
    const totalQs = picks.reduce((n, p) => n + p.count, 0);
    const selectedCount = picks.length;

    let html = '';

    // Breadcrumbs matching Test Cafe
    html += `
        <div class="tc-breadcrumbs" style="margin-bottom:1.25rem;">
            <button class="tc-back-link" onclick="ctGoBackTestCustom()" style="margin-bottom:0;padding:0.35rem 0.75rem;">← Back</button>
            <div class="tc-crumb-list" style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
                <span class="tc-crumb" onclick="ctGoToTestRoot()" style="cursor:pointer;color:var(--text-muted);font-weight:600;">🏠 Home</span>
                ${ctTestDirectory.map((dir, i) => `
                    <span style="color:var(--text-muted);">›</span>
                    <span class="tc-crumb ${(!ctActiveTestFile && i === ctTestDirectory.length - 1) ? 'active' : ''}" 
                          onclick="ctGoToTestLevel(${i})" style="cursor:pointer;font-weight:700;color:${(!ctActiveTestFile && i === ctTestDirectory.length - 1) ? 'var(--text-primary)' : 'var(--text-muted)'};">
                        ${tcEsc(dir.displayName || dir.name || 'Folder')}
                    </span>
                `).join('')}
                ${ctActiveTestFile ? `
                    <span style="color:var(--text-muted);">›</span>
                    <span class="tc-crumb active" style="font-weight:800;color:var(--accent);">📝 ${tcEsc(ctActiveTestFile.displayName)}</span>
                ` : ''}
            </div>
        </div>
    `;

    // View: File Content (Sections) OR Folder View (Subsections & Files)
    if (ctActiveTestFile) {
        const test = ctActiveTestFile.test;
        const sections = test.sections || [];

        html += `
            <div style="margin-bottom:2rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
                    <div>
                        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-primary);margin-bottom:0.25rem;">
                            📝 ${tcEsc(ctActiveTestFile.displayName)}
                        </h2>
                        <div style="font-size:0.85rem;color:var(--text-muted);">
                            ${sections.length} sections · ${test.totalQuestions} total questions. Select sections below to include.
                        </div>
                    </div>
                    <button class="btn btn-ghost btn-sm" onclick="ctGoBackTestCustom()">← Back to Folders</button>
                </div>

                <div class="ct-section-list" style="display:flex;flex-direction:column;gap:0.6rem;">
        `;

        if (sections.length === 0) {
            html += `<p style="color:var(--text-muted);padding:2rem;text-align:center;">No sections found in this test.</p>`;
        } else {
            sections.forEach((s, si) => {
                const key = customSelectionKey(ctActiveTestFile.filePath, si);
                const pick = customSectionSelection[key];
                const on = !!pick;

                html += `
                    <div class="ct-section ${on ? 'on' : ''}" style="background:var(--bg-card);border:1.5px solid ${on ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius-md);padding:0.85rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;transition:all 0.2s ease;">
                        <label class="ct-section-main" style="display:flex;align-items:center;gap:0.75rem;cursor:pointer;flex:1;">
                            <input type="checkbox" ${on ? 'checked' : ''}
                                   onchange="toggleCustomSection('${tbAttr(ctActiveTestFile.filePath)}', '${tbAttr(ctActiveTestFile.displayName)}', ${si}, this.checked)"
                                   style="width:18px;height:18px;accent-color:var(--accent);">
                            <span class="ct-section-icon" style="font-size:1.2rem;">${tcEsc(s.icon || '📗')}</span>
                            <div style="display:flex;flex-direction:column;">
                                <span class="ct-section-name" style="font-weight:700;color:var(--text-primary);font-size:0.95rem;">${tcEsc(s.name)}</span>
                                <span class="ct-section-count" style="font-size:0.8rem;color:var(--text-muted);">${s.questions.length} questions</span>
                            </div>
                        </label>
                        ${on ? `
                            <div class="ct-section-cfg" style="display:flex;align-items:center;gap:0.4rem;">
                                <label style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">Take</label>
                                <input type="number" min="1" max="${s.questions.length}" value="${pick.count}"
                                       onchange="setCustomSectionCount('${tbAttr(ctActiveTestFile.filePath)}', ${si}, this.value)"
                                       style="width:52px;text-align:center;padding:0.25rem 0.35rem;font-size:0.9rem;font-weight:700;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);">
                                <span style="font-size:0.78rem;color:var(--text-muted);">of ${s.questions.length}</span>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        `;

    } else {
        // Folder View matching Test Cafe native list
        const node = ctTestCurrentNode();
        const folders = node.subsections || [];
        const files = node.files || [];

        html += `<div class="tc-tree" style="display:flex;flex-direction:column;gap:0.6rem;margin-bottom:2rem;">`;

        if (folders.length === 0 && files.length === 0) {
            html += `<p style="color:var(--text-muted);padding:2rem;text-align:center;">No items in this section.</p>`;
        }

        folders.forEach((f) => {
            const count = (f.subsections || []).length + (f.files || []).length;
            const folderName = f.displayName || f.name || 'Folder';

            html += `
                <button class="tc-row folder" onclick="ctEnterTestFolder(${tcAttr(JSON.stringify(f))})" style="width:100%;text-align:left;">
                    <span class="tc-row-icon">${tcEsc(f.icon || '📁')}</span>
                    <span class="tc-row-body">
                        <span class="tc-row-name">${tcEsc(folderName)}</span>
                        <span class="tc-row-meta">${count} item${count !== 1 ? 's' : ''}</span>
                    </span>
                    <span class="tc-row-go">›</span>
                </button>
            `;
        });

        files.forEach((file) => {
            const filePath = typeof file === 'object' ? (file.path || file.file || '') : file;
            const fileDisplayName = typeof file === 'object' ? (file.displayName || file.name) : null;
            const fallbackLabel = String(filePath).split('/').pop().replace(/\.json$/i, '').replace(/[_-]+/g, ' ');
            const label = fileDisplayName || fallbackLabel;

            // Check if any sections in this test file are selected
            const fileSectionsSelected = Object.keys(customSectionSelection).filter(k => k.startsWith(`${filePath}::`)).length;

            html += `
                <button class="tc-row file" onclick="ctOpenTestFile(${tcAttr(JSON.stringify(file))})" style="width:100%;text-align:left;">
                    <span class="tc-row-icon">📝</span>
                    <span class="tc-row-body">
                        <span class="tc-row-name" style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                            ${tcEsc(label)}
                            ${fileSectionsSelected > 0 ? `
                                <span style="background:var(--accent);color:#000;font-size:0.75rem;font-weight:800;padding:0.15rem 0.5rem;border-radius:12px;">
                                    ✓ ${fileSectionsSelected} section${fileSectionsSelected !== 1 ? 's' : ''}
                                </span>` : ''}
                        </span>
                        <span class="tc-row-meta">Tap to choose sections</span>
                    </span>
                    <span class="tc-row-go">›</span>
                </button>
            `;
        });

        html += `</div>`;
    }

    // Floating Summary Bar & Drawer Modal HTML
    html += `
        <!-- Floating Selected Summary Bar -->
        <div class="ct-floating-bar" id="ctTestFloatingBar">
            <div class="ct-float-info">
                <div class="ct-float-count">
                    ${selectedCount > 0 ? `🎯 ${selectedCount} Section${selectedCount !== 1 ? 's' : ''} (${totalQs} Qs)` : 'No sections selected'}
                </div>
                <div class="ct-float-sub">
                    ${selectedCount > 0 ? 'Click View Selected to configure and build' : 'Browse folders & pick test sections'}
                </div>
            </div>
            <div class="ct-float-actions">
                ${selectedCount > 0 ? `
                    <button class="btn btn-ghost btn-sm" onclick="toggleCustomDrawer(true)">
                        📋 View Selected (${selectedCount})
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="buildAndPreviewCustomTest()">
                        Build Test →
                    </button>
                ` : `
                    <button class="btn btn-ghost btn-sm" disabled style="opacity:0.5;">
                        Pick Sections Above
                    </button>
                `}
            </div>
        </div>

        <!-- Selected Test Sections Drawer Overlay -->
        <div class="ct-drawer-overlay ${ctTestDrawerOpen ? 'open' : ''}" id="ctTestDrawerOverlay" onclick="toggleCustomDrawer(false)"></div>

        <!-- Selected Test Sections Drawer Modal -->
        <div class="ct-selected-drawer ${ctTestDrawerOpen ? 'open' : ''}" id="ctTestDrawer">
            <div class="ct-drawer-head">
                <div>
                    <div class="ct-drawer-title">📋 Selected Sections (${selectedCount})</div>
                    <div class="ct-drawer-sub">Total ${totalQs} questions from ${selectedCount} section${selectedCount !== 1 ? 's' : ''}</div>
                </div>
                <button class="menu-close" onclick="toggleCustomDrawer(false)" aria-label="Close">✕</button>
            </div>

            <div class="ct-drawer-body">
                ${selectedCount === 0 ? `
                    <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
                        <div style="font-size:2rem;margin-bottom:0.5rem;">📁</div>
                        <div style="font-weight:700;font-size:1rem;color:var(--text-primary);margin-bottom:0.25rem;">No sections selected</div>
                        <div style="font-size:0.85rem;">Open any test and check sections to add them here.</div>
                    </div>
                ` : `
                    <div class="ct-selected-list">
                        ${picks.map(p => {
                            const key = customSelectionKey(p.file, p.sectionIndex);
                            return `
                                <div class="ct-selected-item">
                                    <div class="ct-selected-item-info">
                                        <div class="ct-selected-item-title">${tcEsc(p.sectionName)}</div>
                                        <div class="ct-selected-item-meta">
                                            <span>${tcEsc(p.fileDisplayName || p.testName || p.file)}</span>
                                        </div>
                                    </div>
                                    <div class="ct-selected-item-ctrls">
                                        <label style="font-size:0.78rem;color:var(--text-muted);font-weight:700;">Take</label>
                                        <input type="number" min="1" max="${p.total}" value="${p.count}"
                                               onchange="setCustomSectionCount('${tbAttr(p.file)}', ${p.sectionIndex}, this.value)">
                                        <span style="font-size:0.78rem;color:var(--text-muted);">/ ${p.total}</span>
                                        <button class="ct-remove-btn" onclick="removeCustomSection('${tbAttr(key)}')" title="Remove">✕</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <!-- Custom Test Configurations inside Drawer -->
                    <div class="ct-config" style="margin-top:1.5rem;padding:1rem;background:var(--bg-secondary);border-radius:var(--radius-md);border:1px solid var(--border);">
                        <div class="ct-field">
                            <label for="ctDrawerNameInput">Test name</label>
                            <input type="text" id="ctDrawerNameInput" value="My Custom Test" placeholder="My Custom Test">
                        </div>
                        <div class="ct-field" style="flex:0 1 140px;">
                            <label for="ctDrawerDurationInput">Duration (min)</label>
                            <input type="number" id="ctDrawerDurationInput" min="1" value="60">
                        </div>
                        <label class="ct-check">
                            <input type="checkbox" id="ctDrawerShuffleInput">
                            Shuffle questions in each section
                        </label>
                    </div>
                `}
            </div>

            <div class="ct-drawer-foot">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
                    <div style="font-size:0.9rem;font-weight:700;color:var(--text-primary);">
                        ${selectedCount > 0 ? `Total: ${totalQs} Questions` : ''}
                    </div>
                    ${selectedCount > 0 ? `
                        <button class="btn btn-ghost btn-sm" onclick="clearCustomSelection()" style="color:var(--error, #ef4444);">
                            🗑️ Clear All
                        </button>
                    ` : ''}
                </div>
                <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                    <button class="btn btn-ghost" onclick="toggleCustomDrawer(false)">Keep Browsing</button>
                    <button class="btn btn-primary" onclick="buildAndPreviewCustomTest()" ${selectedCount === 0 ? 'disabled' : ''}>
                        Build Test (${totalQs} Qs) →
                    </button>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
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

function buildAndPreviewCustomTest() {
    const drawerName = document.getElementById('ctDrawerNameInput');
    const mainName = document.getElementById('ctNameInput');
    const name = (drawerName && drawerName.value.trim()) || (mainName && mainName.value.trim()) || 'My Custom Test';

    const drawerDur = document.getElementById('ctDrawerDurationInput');
    const mainDur = document.getElementById('ctDurationInput');
    let durVal = (drawerDur && drawerDur.value) || (mainDur && mainDur.value) || 60;
    let duration = parseInt(durVal, 10);
    if (isNaN(duration) || duration < 1) duration = 60;

    const drawerShuffle = document.getElementById('ctDrawerShuffleInput');
    const mainShuffle = document.getElementById('ctShuffleInput');
    const shuffle = !!((drawerShuffle && drawerShuffle.checked) || (mainShuffle && mainShuffle.checked));

    const test = buildCustomTest({
        name: name,
        duration: duration,
        shuffle: shuffle
    });

    if (!test) return;
    toggleCustomDrawer(false);
    renderTestDetail(test, test.customSource);
    showTcScreen('scInstructions');
}

// ==================== RUNNER ====================
function openRunner() {
    showTcScreen('scRunner');
    renderRunnerChrome();
    renderQuestion();
    renderSidePanel();
    pushTcHistory({ cafe: 'test', tcScreen: 'scRunner', mode: TS.mode });
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
                <div class="q-no">Q. ${q.globalNumber || (q.globalIndex + 1)}</div>
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

            ${q.question ? `<div class="q-text">${tcRenderText(q.question)}</div>` : ''}

            ${q.images && q.images.length > 1 ? `
                <div class="q-images-container">
                    ${q.images.map((img, i) => `<div class="q-image-wrap"><img class="q-image" src="${tcAttr(img)}" alt="Question diagram ${i + 1}" loading="lazy"></div>`).join('')}
                </div>
            ` : (q.image_url ? `<div class="q-image-wrap"><img class="q-image" src="${tcAttr(q.image_url)}" alt="Question diagram" loading="lazy"></div>` : '')}

            ${renderMatchLists(q)}

            ${q.type === 'integer' ? renderIntegerInput(q, rec) : renderOptions(q, rec)}

            ${TS.mode !== 'test' ? renderSolutionBlock(q) : ''}
        </div>
    `;

    updateFooterNav();
    renderGrid();
    tcTypeset(main);
}

function tcRenderText(text) {
    // Delegate to the shared safeHtml() utility from quiz-core.js
    // which handles **bold**, safe HTML tags (ul/li/table/img/sup/sub/br), and markdown.
    if (typeof safeHtml === 'function') return safeHtml(text);
    // Fallback if safeHtml not loaded yet
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function renderMatchLists(q) {
    if (!q || !q.matchLists) return '';
    const ml = q.matchLists;
    const listI = ml.listI || { title: 'Column I', items: [] };
    const listII = ml.listII || { title: 'Column II', items: [] };
    const itemsI = listI.items || [];
    const itemsII = listII.items || [];
    const maxLen = Math.max(itemsI.length, itemsII.length);
    if (maxLen === 0) return '';

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
                <td class="match-col-label">${tcEsc(labelI)}</td>
                <td class="match-col-content">
                    ${imgI ? `<div class="match-item-img-wrap"><img class="match-item-img" src="${tcAttr(imgI)}" alt="Diagram ${tcAttr(labelI)}" loading="lazy"></div>` : ''}
                    ${textI ? `<div class="match-item-text">${tcRenderText(textI)}</div>` : ''}
                </td>
                <td class="match-col-label">${tcEsc(labelII)}</td>
                <td class="match-col-content">
                    ${imgII ? `<div class="match-item-img-wrap"><img class="match-item-img" src="${tcAttr(imgII)}" alt="Diagram ${tcAttr(labelII)}" loading="lazy"></div>` : ''}
                    ${textII ? `<div class="match-item-text">${tcRenderText(textII)}</div>` : ''}
                </td>
            </tr>
        `;
    }

    return `
        <div class="match-table-wrap">
            <table class="match-table">
                <thead>
                    <tr>
                        <th colspan="2" class="match-th">${tcEsc(listI.title || 'Column I')}</th>
                        <th colspan="2" class="match-th">${tcEsc(listII.title || 'Column II')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
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
            ? tcRenderText(text)
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
                    <span class="opt-text">${given === '' ? 'Not attempted' : tcRenderText(given)}</span>
                    ${given === '' ? '' : `<span class="opt-flag">${right ? 'Correct (Marked By You)' : 'Incorrect (Marked By You)'}</span>`}
                </span>
            </div>
            <div class="opt correct">
                <span class="opt-key">Ans</span>
                <span class="opt-body">
                    <span class="opt-text">${tcRenderText(correctVal)}</span>
                    <span class="opt-flag">${right ? 'Correct (Marked By You)' : 'Correct (Not Marked By You)'}</span>
                </span>
            </div>
        </div>`;
}

/* Explanation is optional in the data, so the block only appears when there is
   something to show. Supports multiple explanation diagrams. */
function renderSolutionBlock(q) {
    const hasExp = !!(q.explanation && String(q.explanation).trim());
    const expImages = [];
    if (q.explanation_image) expImages.push(q.explanation_image);
    if (Array.isArray(q.explanation_images)) {
        q.explanation_images.forEach(img => { if (img && expImages.indexOf(img) === -1) expImages.push(img); });
    }
    const hasVideo = Boolean(q.video && (q.video.embed_url || q.video.url));
    if (!hasExp && expImages.length === 0 && !hasVideo) {
        return `<div class="q-explain empty">No explanation was provided for this question.</div>`;
    }
    return `
        <div class="q-explain">
            <h4>💡 Explanation / Solution</h4>
            ${hasExp ? `<div class="q-explain-text" style="line-height:1.7;margin-bottom:0.75rem;">${tcRenderText(q.explanation)}</div>` : ''}
            ${expImages.length > 0 ? `
                <div class="q-explain-images">
                    ${expImages.map((img, idx) => `<div class="q-explain-img-wrap"><img class="q-explain-img" src="${tcAttr(img)}" alt="Explanation diagram ${idx + 1}" loading="lazy"></div>`).join('')}
                </div>
            ` : ''}
            ${hasVideo && typeof renderVideoFacade === 'function' ? renderVideoFacade(q.video, 'tc-' + (q.id || Math.random())) : ''}
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

function handleFooterNextClick() {
    if (!TS.flat.length) return;
    const isLast = TS.currentIndex === TS.flat.length - 1;
    const q = TS.flat[TS.currentIndex];
    const rec = TS.answers[TS.currentIndex] || {};
    const answered = isAnswered(rec, q);

    if (TS.mode === 'test') {
        if (isLast) {
            confirmSubmit();
            return;
        }
    }
    nextQuestionTC();
}

function updateFooterNav() {
    const prev = document.getElementById('trPrev');
    const next = document.getElementById('trNext');
    if (prev) prev.disabled = TS.currentIndex === 0;
    if (!next || !TS.flat.length) return;

    const isLast = TS.currentIndex === TS.flat.length - 1;
    const q = TS.flat[TS.currentIndex];
    const rec = TS.answers[TS.currentIndex] || {};
    const answered = isAnswered(rec, q);

    if (TS.mode === 'test') {
        next.disabled = false;
        if (isLast) {
            if (answered) {
                next.textContent = 'Submit';
                next.className = 'tr-nav-btn next submit';
            } else {
                next.textContent = 'Skip';
                next.className = 'tr-nav-btn skip';
            }
        } else {
            if (answered) {
                next.textContent = 'Next ›';
                next.className = 'tr-nav-btn next';
            } else {
                next.textContent = 'Skip ›';
                next.className = 'tr-nav-btn skip';
            }
        }
    } else {
        next.disabled = isLast;
        next.textContent = isLast ? 'Last question' : 'Next ›';
        next.className = 'tr-nav-btn next';
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
        return `<button class="${cls}" onclick="goToQuestion(${q.globalIndex})">${q.globalNumber || (q.globalIndex + 1)}</button>`;
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
    pushTcHistory({ cafe: 'test', tcScreen: 'scResults' });
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

/* Results are kept in history, so a re-attempt adds one rather than replacing.
   This returns to the test's detail screen instead of restarting straight away,
   so the time limit can be adjusted before the clock starts again — the actual
   restart happens when the user presses the button there (startPendingTest).

   The paper is rebuilt from its source so the picker opens on the file's own
   default: TS.test still carries whatever limit the finished attempt ran with. */
async function reattemptTest() {
    showTcScreen('scLoading');

    let test = null;
    try {
        test = await rebuildTestFromSource(TS.source);
    } catch (e) { /* fall back to the finished attempt's own copy below */ }

    /* Falling back keeps re-attempt working when the file can't be re-read;
       only the pre-filled duration may differ from the file's default. */
    if (!test) test = TS.test;

    if (!test) {
        alert('This test can no longer be loaded, so it cannot be re-attempted.');
        showResultsScreen();
        return;
    }

    // renderTestDetail reads source.kind for its back link, so never hand it null.
    renderTestDetail(test, TS.source || { kind: 'file', file: test.file || null });
    showTcScreen('scInstructions');
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

// ==================== POPSTATE ROUTING (MOBILE BACK BUTTON) ====================
window.addEventListener('popstate', function (e) {
    // 1. If an overlay / modal is open, close it and stay on current screen
    if (typeof closeCurrentOverlay === 'function' && closeCurrentOverlay()) {
        const activeSc = document.querySelector('.tc-screen.active');
        const activeId = activeSc ? activeSc.id : 'scHome';
        pushTcHistory({ cafe: 'test', tcScreen: activeId, dirLen: (typeof testDirectory !== 'undefined' && testDirectory) ? testDirectory.length : 0 });
        return;
    }

    // 2. Guard active Timed Test
    const activeSc = document.querySelector('.tc-screen.active');
    if (activeSc && activeSc.id === 'scRunner' && typeof TS !== 'undefined' && TS.mode === 'test' && !TS.submitted) {
        const leave = confirm('Do you want to leave this test? Your progress will be submitted.');
        if (leave) {
            doSubmit();
        } else {
            pushTcHistory({ cafe: 'test', tcScreen: 'scRunner', mode: 'test' });
            return;
        }
        return;
    }

    // 3. State navigation
    if (e.state && e.state.cafe === 'test') {
        isTcHistoryNavigating = true;
        try {
            switch (e.state.tcScreen) {
                case 'scHome':
                    closeMobileGrid();
                    const targetLen = typeof e.state.dirLen === 'number' ? e.state.dirLen : 0;
                    if (typeof testDirectory !== 'undefined' && testDirectory.length !== targetLen) {
                        testDirectory = testDirectory.slice(0, targetLen);
                        renderTestTree();
                    }
                    showTcScreen('scHome');
                    break;
                case 'scInstructions':
                    if (e.state.filePath && typeof openTestDetail === 'function') {
                        openTestDetail(e.state.filePath);
                    } else {
                        showTcScreen('scInstructions');
                    }
                    break;
                case 'scRunner':
                    showTcScreen('scRunner');
                    break;
                case 'scResults':
                    showResultsScreen();
                    break;
                case 'scHistory':
                    showTestHistory();
                    break;
                case 'scCustom':
                    const ctTargetLen = typeof e.state.ctDirLen === 'number' ? e.state.ctDirLen : 0;
                    if (typeof ctTestDirectory !== 'undefined' && ctTestDirectory.length !== ctTargetLen) {
                        ctTestDirectory = ctTestDirectory.slice(0, ctTargetLen);
                        renderCustomTree();
                    }
                    showTcScreen('scCustom');
                    break;
                default:
                    showTcScreen('scHome');
                    break;
            }
        } finally {
            isTcHistoryNavigating = false;
        }
        return;
    }

    // 4. Popped past root:
    if (typeof testDirectory !== 'undefined' && testDirectory && testDirectory.length > 0) {
        testDirectory.pop();
        renderTestTree();
        showTcScreen('scHome');
        pushTcHistory({ cafe: 'test', tcScreen: 'scHome', dirLen: testDirectory.length });
        return;
    }
});
