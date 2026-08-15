/* ============================================================
   Quizzy — Test history
   Every finished attempt is kept on the device, and an unfinished
   one survives a refresh.

   An attempt stores the user's ANSWERS plus the computed summary —
   never a copy of the questions. The questions are rebuilt from the
   source test file when an analysis is opened, which keeps an
   attempt at a few KB and lets the whole history travel inside a
   backup file. If a source file is gone, the score and the
   section table still render from the stored summary.
   ============================================================ */

const TEST_ATTEMPTS_KEY = 'quizzy-test-attempts';
const TEST_INPROGRESS_KEY = 'quizzy-test-inprogress';
const MAX_STORED_ATTEMPTS = 400;

// ==================== ATTEMPT STORE ====================
function getTestAttempts() {
    try {
        const list = JSON.parse(localStorage.getItem(TEST_ATTEMPTS_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function saveTestAttempts(list) {
    const trimmed = list
        .slice()
        .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
        .slice(0, MAX_STORED_ATTEMPTS);
    try {
        localStorage.setItem(TEST_ATTEMPTS_KEY, JSON.stringify(trimmed));
    } catch (e) {
        console.warn('Could not save test history (storage full?)', e);
        alert('Your device storage is full, so this attempt could not be saved to history.');
    }
    return trimmed;
}

/* Oldest first — that is the order attempt numbers are handed out in. */
function attemptsForKey(testKey) {
    return getTestAttempts()
        .filter(a => a.testKey === testKey)
        .sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0));
}

function getAttemptById(id) {
    return getTestAttempts().find(a => a.id === id) || null;
}

function deleteAttempt(id) {
    saveTestAttempts(getTestAttempts().filter(a => a.id !== id));
}

function clearAllAttempts() {
    localStorage.removeItem(TEST_ATTEMPTS_KEY);
}

/* Groups the history by paper, newest activity first. */
function groupedAttemptHistory() {
    const groups = new Map();
    getTestAttempts().forEach(a => {
        if (!groups.has(a.testKey)) {
            groups.set(a.testKey, { testKey: a.testKey, testName: a.testName, kind: (a.source && a.source.kind) || 'file', attempts: [] });
        }
        const g = groups.get(a.testKey);
        g.attempts.push(a);
        if ((a.endedAt || 0) > (g.lastAt || 0)) { g.lastAt = a.endedAt; g.testName = a.testName; }
    });

    const list = [...groups.values()];
    list.forEach(g => {
        g.attempts.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
        g.best = g.attempts.reduce((m, a) => Math.max(m, (a.summary && a.summary.score) || 0), -Infinity);
        g.maxScore = (g.attempts[0].summary && g.attempts[0].summary.maxScore) || 0;
    });
    list.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    return list;
}

/* Compact per-question record: id + selection + integer value + marked + time. */
function packAnswers() {
    return TS.flat.map(q => {
        const r = TS.answers[q.globalIndex] || {};
        return {
            id: q.id,
            s: (r.selected === null || r.selected === undefined) ? null : r.selected,
            v: r.value || '',
            m: r.marked ? 1 : 0,
            t: Math.round(r.timeMs || 0)
        };
    });
}

function recordCurrentAttempt() {
    if (!TS.test || !TS.result) return null;

    const attemptNo = attemptsForKey(TS.testKey).length + 1;
    const attempt = {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        testKey: TS.testKey,
        testId: TS.test.id,
        testName: TS.test.name,
        attemptNo: attemptNo,
        source: TS.source,
        startedAt: TS.startedAt,
        endedAt: TS.endedAt || Date.now(),
        durationMin: TS.test.duration,
        summary: TS.result,
        answers: packAnswers()
    };

    const list = getTestAttempts();
    list.push(attempt);
    saveTestAttempts(list);

    TS.attemptNo = attemptNo;
    TS.viewingAttemptId = attempt.id;
    return attempt;
}

// ==================== REBUILDING A STORED ATTEMPT ====================
/* Custom papers are rebuilt by pulling the exact question ids back out of
   their source files, so the paper is identical to the one that was sat. */
async function rebuildTestFromSource(source) {
    if (!source) return null;

    if (source.kind === 'file') {
        return await loadTestFile(source.file);
    }

    if (source.kind === 'custom' && Array.isArray(source.sections)) {
        const sections = [];
        for (const blueprint of source.sections) {
            const sourceTest = await loadTestFile(blueprint.file);
            const original = sourceTest.sections[blueprint.sectionIndex];
            if (!original) continue;
            const byId = new Map(original.questions.map(q => [q.id, q]));
            const questions = blueprint.questionIds.map(id => byId.get(id)).filter(Boolean);
            if (questions.length === 0) continue;
            sections.push({
                name: blueprint.name,
                icon: blueprint.icon || '',
                marking: original.marking,
                questions: questions
            });
        }
        if (sections.length === 0) return null;

        return {
            id: 'custom-replay',
            name: source.name || 'My Custom Test',
            description: '',
            duration: source.duration || 60,
            marking: { correct: 4, incorrect: -1 },
            sections: sections,
            totalQuestions: sections.reduce((n, s) => n + s.questions.length, 0),
            totalMarks: sections.reduce((n, s) => n + s.questions.reduce((m, q) => m + q.marking.correct, 0), 0),
            file: null,
            isCustom: true
        };
    }

    return null;
}

/* Loads a stored attempt back into TS for review. Returns:
     'full'    — questions rebuilt, detailed analysis available
     'summary' — score/section table only (source file changed or missing) */
async function loadAttemptIntoSession(attempt) {
    TS.result = attempt.summary;
    TS.resultTestName = attempt.testName;
    TS.testKey = attempt.testKey;
    TS.source = attempt.source;
    TS.attemptNo = attempt.attemptNo;
    TS.viewingAttemptId = attempt.id;
    TS.submitted = true;
    TS.mode = 'analysis';
    TS.analysisFilter = 'all';
    TS.currentIndex = 0;
    TS.activeSection = 0;
    TS.startedAt = attempt.startedAt;
    TS.endedAt = attempt.endedAt;
    stopTestTimerLoop();

    let test = null;
    try {
        test = await rebuildTestFromSource(attempt.source);
    } catch (e) {
        console.warn('Could not rebuild the questions for this attempt:', e);
    }

    if (!test) {
        TS.test = null;
        TS.flat = [];
        TS.answers = {};
        return 'summary';
    }

    TS.test = test;
    TS.flat = flattenTest(test);
    TS.answers = {};

    const stored = new Map((attempt.answers || []).map(a => [a.id, a]));
    let matched = 0;
    TS.flat.forEach(q => {
        const a = stored.get(q.id);
        if (a) matched++;
        TS.answers[q.globalIndex] = {
            selected: a && a.s !== null && a.s !== undefined ? a.s : null,
            value: (a && a.v) || '',
            marked: !!(a && a.m),
            visited: true,
            timeMs: (a && a.t) || 0
        };
    });

    // The paper was edited after this attempt — the numbers still stand, the
    // question-by-question view would be misleading.
    if (matched === 0) {
        TS.test = null;
        TS.flat = [];
        TS.answers = {};
        return 'summary';
    }

    return 'full';
}

// ==================== UNFINISHED ATTEMPT ====================
function saveInProgressTest() {
    if (TS.mode !== 'test' || TS.submitted || !TS.test) return;
    try {
        localStorage.setItem(TEST_INPROGRESS_KEY, JSON.stringify({
            testKey: TS.testKey,
            testName: TS.test.name,
            source: TS.source,
            startedAt: TS.startedAt,
            remainingSec: TS.remainingSec,
            currentIndex: TS.currentIndex,
            answers: packAnswers(),
            savedAt: Date.now()
        }));
    } catch (e) {
        console.warn('Could not save test progress:', e);
    }
}

function getInProgressTest() {
    try {
        const raw = localStorage.getItem(TEST_INPROGRESS_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && data.testKey && Array.isArray(data.answers) ? data : null;
    } catch (e) {
        return null;
    }
}

function clearInProgressTest() {
    localStorage.removeItem(TEST_INPROGRESS_KEY);
}

/* Puts a saved unfinished attempt back on screen with its clock where it was. */
async function restoreInProgressSession(saved) {
    const test = await rebuildTestFromSource(saved.source);
    if (!test) throw new Error('The questions for this test could not be loaded again.');

    beginTestSession(test, saved.source);
    TS.startedAt = saved.startedAt || Date.now();
    TS.remainingSec = Math.max(1, saved.remainingSec || TS.remainingSec);

    const stored = new Map(saved.answers.map(a => [a.id, a]));
    TS.flat.forEach(q => {
        const a = stored.get(q.id);
        if (!a) return;
        TS.answers[q.globalIndex] = {
            selected: a.s !== null && a.s !== undefined ? a.s : null,
            value: a.v || '',
            marked: !!a.m,
            visited: true,
            timeMs: a.t || 0
        };
    });

    TS.currentIndex = Math.min(Math.max(0, saved.currentIndex || 0), TS.flat.length - 1);
    TS.qEnterAt = Date.now();
    return test;
}

// ==================== FORMATTING HELPERS ====================
function formatAttemptDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
