/* ============================================================
   Quizzy — Test Cafe engine
   Data loading, normalisation, timing and scoring for full
   sectional tests. Kept free of DOM work: test-ui.js draws,
   this file decides what is true.
   ============================================================ */

const TEST_MANIFEST_PATH = 'data/test-manifest.json';
const TEST_DATA_DIR = 'data/tests/';

/* Browsing state for the Test Cafe home screen. */
let testManifestRoot = null;
let testDirectory = [];   // breadcrumb stack of folder nodes
let loadedTests = {};     // fileName -> normalised test object

/* The one live test. Everything the runner, the results dashboard and the
   analysis view need lives here, so a re-attempt is just a rebuild of TS. */
const TS = {
    test: null,          // normalised test
    flat: [],            // every question, flattened, with section info attached
    answers: {},         // globalIndex -> { selected, value, marked, visited, timeMs }
    currentIndex: 0,
    activeSection: 0,
    submitted: false,
    startedAt: 0,
    endedAt: 0,
    remainingSec: 0,
    timerId: null,
    qEnterAt: 0,
    mode: 'idle',        // 'test' | 'analysis' | 'bookmark'
    analysisFilter: 'all',
    result: null,
    source: null,        // { kind: 'file', file } | { kind: 'custom', … }
    testKey: null,       // groups every attempt of the same paper together
    attemptNo: 0,        // 1-based, assigned when the attempt is recorded
    resultTestName: '',  // survives even when the questions cannot be rebuilt
    viewingAttemptId: null
};

function tcEsc(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/* For values placed inside a double-quoted HTML attribute (src=, value=).
   tbAttr() in test-bookmarks.js is the different job: escaping for inline JS. */
function tcAttr(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function tcSlug(text) {
    return String(text || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ==================== NORMALISATION ====================
/* Marking can be written a few ways depending on who authored the file.
   Negatives are stored as negative numbers whichever sign the author used,
   so "negative_marks": 1 and "incorrect": -1 both mean "lose one mark". */
function normalizeMarking(src, fallback) {
    const base = fallback || { correct: 4, incorrect: -1 };
    if (!src) return { ...base };
    const m = src.marking || src;
    const correct = firstNumber(m.correct, m.positive, m.positive_marks, m.marks, base.correct);
    const rawNeg = firstNumber(m.incorrect, m.negative, m.negative_marks, m.penalty, base.incorrect);
    return {
        correct: correct,
        incorrect: rawNeg === 0 ? 0 : -Math.abs(rawNeg)
    };
}

function firstNumber(...vals) {
    for (const v of vals) {
        if (typeof v === 'number' && !isNaN(v)) return v;
        if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
    }
    return 0;
}

/* Accepts the documented shape ({ sections: [...] }) plus the looser shapes a
   hand-written file tends to arrive in: a bare question array, a single
   { questions: [...] } object, or "subjects" instead of "sections". */
function normalizeTest(raw, fileName) {
    const fallbackName = String(fileName || 'Test').replace(/\.json$/i, '').replace(/[_-]+/g, ' ');
    let sectionsRaw = [];
    let meta = {};

    if (Array.isArray(raw)) {
        const active = raw.filter(q => q && q.is_active !== false);
        const hasCategories = active.some(q => q && q.category);
        if (hasCategories) {
            const catMap = {};
            active.forEach(q => {
                const c = q.category || 'General';
                if (!catMap[c]) catMap[c] = [];
                catMap[c].push(q);
            });
            sectionsRaw = Object.entries(catMap).map(([name, qs]) => ({ name, questions: qs }));
        } else {
            sectionsRaw = [{ name: 'All Questions', questions: active }];
        }
    } else if (raw && Array.isArray(raw.sections)) {
        sectionsRaw = raw.sections;
        meta = raw;
    } else if (raw && Array.isArray(raw.subjects)) {
        sectionsRaw = raw.subjects;
        meta = raw;
    } else if (raw && Array.isArray(raw.chapters)) {
        sectionsRaw = raw.chapters.map(ch => ({
            name: ch.name,
            icon: ch.icon || '',
            questions: (ch.topics || []).flatMap(t => (t.questions || []).map(q => ({ ...q, sub_category: t.topic })))
        }));
        meta = raw;
    } else if (raw && Array.isArray(raw.questions)) {
        sectionsRaw = [{ name: raw.name || 'All Questions', questions: raw.questions }];
        meta = raw;
    } else {
        sectionsRaw = [];
        meta = raw || {};
    }

    const testMarking = normalizeMarking(meta, { correct: 4, incorrect: -1 });
    const duration = firstNumber(meta.duration, meta.duration_minutes, meta.time, meta.timeLimit, 60) || 60;
    const testId = meta.id || tcSlug(fallbackName);
    const testName = meta.name || meta.title || fallbackName;

    const sections = sectionsRaw.map((s, si) => {
        const secMarking = normalizeMarking(s, testMarking);
        const sectionName = s.name || s.section || s.subject || s.title || `Section ${si + 1}`;
        /* Every question carries where it came from. A custom test reuses these
           objects, so a bookmark saved from one still points at its real origin
           rather than at the throwaway custom test id. */
        const qs = (s.questions || s.qs || []).map((q, qi) => ({
            ...normalizeTestQuestion(q, qi, secMarking),
            srcTestId: testId,
            srcTestName: testName,
            srcTestFile: fileName || null,
            srcSectionIndex: si,
            srcSectionName: sectionName,
            srcQIndex: qi
        }));
        return {
            name: sectionName,
            icon: s.icon || '',
            marking: secMarking,
            questions: qs
        };
    }).filter(s => s.questions.length > 0);

    const totalQuestions = sections.reduce((n, s) => n + s.questions.length, 0);
    const totalMarks = sections.reduce(
        (n, s) => n + s.questions.reduce((m, q) => m + q.marking.correct, 0), 0);

    return {
        id: testId,
        name: testName,
        description: meta.description || '',
        duration: duration,
        marking: testMarking,
        sections: sections,
        totalQuestions: totalQuestions,
        totalMarks: totalMarks,
        file: fileName || null
    };
}

/* `correct` is 0-based and `correct_answer` is 1-based — the same convention
   the Question Cafe files already use. Letters ("B") and the literal option
   text are accepted too, since those show up in hand-written tests. */
function resolveCorrectIndex(q, options) {
    if (typeof q.correct === 'number') return q.correct;
    if (typeof q.correct_index === 'number') return q.correct_index;
    if (typeof q.correct_answer === 'number') {
        return q.correct_answer > 0 ? q.correct_answer - 1 : q.correct_answer;
    }
    if (typeof q.correct_option === 'number') {
        return q.correct_option > 0 ? q.correct_option - 1 : q.correct_option;
    }

    const letterOf = (val) => {
        const s = String(val).trim();
        if (/^[A-Za-z]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
        if (/^[1-9]$/.test(s)) return Number(s) - 1;
        return -1;
    };

    for (const candidate of [q.correct, q.correct_answer, q.answer, q.correct_option]) {
        if (typeof candidate === 'string') {
            const byLetter = letterOf(candidate);
            if (byLetter >= 0) return byLetter;
            const byText = (options || []).findIndex(
                o => String(o).trim().toLowerCase() === candidate.trim().toLowerCase());
            if (byText >= 0) return byText;
        }
    }
    return null;
}

function normalizeTestQuestion(q, index, sectionMarking) {
    const rawOptions = q.options || q.option_texts || q.choices || null;
    const options = Array.isArray(rawOptions) && rawOptions.length > 0
        ? rawOptions.map(o => (o === null || o === undefined ? '' : String(o)))
        : null;
    const optionImages = q.option_images || q.optionImages || null;

    let type = (q.type || '').toLowerCase();
    if (type === 'numerical' || type === 'integer_type') type = 'integer';
    if (!type) {
        if (options || (Array.isArray(optionImages) && optionImages.length > 0)) type = 'mcq';
        else if (q.image_url || q.image) type = 'mcq';           // image-only MCQ: 4 numbered boxes
        else if (q.answer !== undefined) type = 'integer';
        else type = 'mcq';
    }

    const marking = {
        correct: firstNumber(q.marks, q.positive_marks, sectionMarking.correct),
        incorrect: (function () {
            const v = firstNumber(q.negative, q.negative_marks, q.incorrect, sectionMarking.incorrect);
            return v === 0 ? 0 : -Math.abs(v);
        })()
    };

    const base = {
        id: q.id || `q_${index}_${Math.random().toString(36).slice(2, 8)}`,
        type: type,
        question: q.question || q.text || q.question_text || '',
        image_url: q.image_url || q.image || null,
        explanation: q.explanation || q.solution || '',
        explanation_image: q.explanation_image || q.solution_image || null,
        marking: marking
    };

    if (type === 'integer') {
        const ans = q.answer !== undefined ? q.answer
            : (q.correct_answer !== undefined ? q.correct_answer : q.correct);
        return { ...base, options: null, optionImages: null, correct: null, answer: ans };
    }

    /* An image-only question still needs four clickable boxes, so fall back to
       numbered placeholders the UI renders as "1 2 3 4". */
    const finalOptions = options || (Array.isArray(optionImages) && optionImages.length
        ? optionImages.map(() => '')
        : ['', '', '', '']);

    return {
        ...base,
        options: finalOptions,
        optionImages: Array.isArray(optionImages) ? optionImages : null,
        correct: resolveCorrectIndex(q, options),
        answer: null
    };
}

// ==================== MANIFEST & FILE LOADING ====================
async function loadTestManifest(force) {
    if (testManifestRoot && !force) return testManifestRoot;
    const resp = await fetch(TEST_MANIFEST_PATH);
    if (!resp.ok) throw new Error(`Could not load ${TEST_MANIFEST_PATH} (${resp.status})`);
    testManifestRoot = await resp.json();
    return testManifestRoot;
}

async function loadTestFile(fileName) {
    if (loadedTests[fileName]) return loadedTests[fileName];
    const resp = await fetch(TEST_DATA_DIR + fileName);
    if (!resp.ok) throw new Error(`Could not load ${fileName} (${resp.status})`);
    const raw = await resp.json();
    const test = normalizeTest(raw, fileName);
    if (test.totalQuestions === 0) throw new Error(`${fileName} has no questions.`);
    loadedTests[fileName] = test;
    return test;
}

/* Walks the manifest tree and returns every file path it mentions. */
function collectTestFiles(node, out) {
    out = out || [];
    if (!node) return out;
    (node.files || []).forEach(f => { if (out.indexOf(f) === -1) out.push(f); });
    (node.subsections || []).forEach(sub => collectTestFiles(sub, out));
    return out;
}

async function loadAllTestFiles() {
    await loadTestManifest();
    const files = collectTestFiles(testManifestRoot);
    const failed = [];
    for (const f of files) {
        try {
            await loadTestFile(f);
        } catch (e) {
            console.warn('Test file skipped:', f, e);
            failed.push(f);
        }
    }
    return { files: files.filter(f => loadedTests[f]), failed };
}

// ==================== SESSION SETUP ====================
function flattenTest(test) {
    const flat = [];
    test.sections.forEach((section, si) => {
        section.questions.forEach((q, qi) => {
            flat.push({
                ...q,
                sectionIndex: si,
                sectionName: section.name,
                numberInSection: qi + 1,
                globalIndex: flat.length
            });
        });
    });
    return flat;
}

/* Identifies "the same paper" across attempts. A custom test keys off its
   composition, so rebuilding the same mix twice groups those attempts. */
function testKeyFor(source, test) {
    if (source && source.kind === 'file' && source.file) return 'file:' + source.file;
    if (source && source.kind === 'custom' && source.composition) return 'custom:' + source.composition;
    return 'test:' + (test && test.id ? test.id : 'unknown');
}

function beginTestSession(test, source) {
    TS.test = test;
    TS.flat = flattenTest(test);
    TS.answers = {};
    TS.flat.forEach(q => {
        TS.answers[q.globalIndex] = { selected: null, value: '', marked: false, visited: false, timeMs: 0 };
    });
    TS.currentIndex = 0;
    TS.activeSection = 0;
    TS.submitted = false;
    TS.result = null;
    TS.analysisFilter = 'all';
    TS.startedAt = Date.now();
    TS.endedAt = 0;
    TS.remainingSec = Math.max(1, Math.round(test.duration * 60));
    TS.mode = 'test';
    TS.source = source || null;
    TS.testKey = testKeyFor(source, test);
    TS.attemptNo = 0;
    TS.resultTestName = test.name;
    TS.viewingAttemptId = null;
    TS.qEnterAt = Date.now();
    if (TS.answers[0]) TS.answers[0].visited = true;
}

// ==================== TIME TRACKING ====================
/* Called before every move away from a question (navigation, section switch,
   submit, tab hidden) so per-question time stays accurate without a ticker. */
function flushQuestionTime() {
    if (TS.mode !== 'test' || !TS.qEnterAt) return;
    const rec = TS.answers[TS.currentIndex];
    if (rec) rec.timeMs += Date.now() - TS.qEnterAt;
    TS.qEnterAt = Date.now();
}

function startTestTimerLoop(onTick, onExpire) {
    stopTestTimerLoop();
    TS.timerId = setInterval(() => {
        TS.remainingSec--;
        if (TS.remainingSec <= 0) {
            TS.remainingSec = 0;
            stopTestTimerLoop();
            if (onExpire) onExpire();
            return;
        }
        if (onTick) onTick(TS.remainingSec);
    }, 1000);
}

function stopTestTimerLoop() {
    if (TS.timerId) {
        clearInterval(TS.timerId);
        TS.timerId = null;
    }
}

function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function formatShortDuration(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

// ==================== ANSWER STATE ====================
function isAnswered(rec, q) {
    if (!rec) return false;
    if (q.type === 'integer') return String(rec.value || '').trim() !== '';
    return rec.selected !== null && rec.selected !== undefined;
}

function isQuestionCorrect(q, rec) {
    if (!isAnswered(rec, q)) return false;
    if (q.type === 'integer') {
        const given = String(rec.value).trim();
        const expected = q.answer === null || q.answer === undefined ? '' : String(q.answer).trim();
        if (expected === '') return false;
        const a = Number(given);
        const b = Number(expected);
        if (!isNaN(a) && !isNaN(b)) return Math.abs(a - b) < 1e-6;
        return given.toLowerCase() === expected.toLowerCase();
    }
    if (q.correct === null || q.correct === undefined) return false;
    return rec.selected === q.correct;
}

/* 'correct' | 'incorrect' | 'skipped' — the vocabulary the analysis filters,
   the grid colours and the section table all share. */
function questionOutcome(globalIndex) {
    const q = TS.flat[globalIndex];
    const rec = TS.answers[globalIndex];
    if (!isAnswered(rec, q)) return 'skipped';
    return isQuestionCorrect(q, rec) ? 'correct' : 'incorrect';
}

/* Live status used by the question grid while the test is running. */
function questionStatus(globalIndex) {
    const q = TS.flat[globalIndex];
    const rec = TS.answers[globalIndex];
    const answered = isAnswered(rec, q);
    if (rec && rec.marked) return answered ? 'marked-answered' : 'marked';
    if (answered) return 'answered';
    if (rec && rec.visited) return 'visited';
    return 'unvisited';
}

// ==================== SCORING ====================
function computeResult() {
    const sections = TS.test.sections.map(s => ({
        name: s.name,
        icon: s.icon,
        total: s.questions.length,
        correct: 0,
        incorrect: 0,
        skipped: 0,
        score: 0,
        maxScore: s.questions.reduce((n, q) => n + q.marking.correct, 0),
        timeMs: 0
    }));

    let correct = 0, incorrect = 0, skipped = 0, score = 0, timeMs = 0;

    TS.flat.forEach(q => {
        const rec = TS.answers[q.globalIndex];
        const sec = sections[q.sectionIndex];
        const outcome = questionOutcome(q.globalIndex);
        const t = rec ? rec.timeMs : 0;

        timeMs += t;
        sec.timeMs += t;

        if (outcome === 'correct') {
            correct++; sec.correct++;
            score += q.marking.correct; sec.score += q.marking.correct;
        } else if (outcome === 'incorrect') {
            incorrect++; sec.incorrect++;
            score += q.marking.incorrect; sec.score += q.marking.incorrect;
        } else {
            skipped++; sec.skipped++;
        }
    });

    const attempted = correct + incorrect;
    const elapsedMs = (TS.endedAt || Date.now()) - TS.startedAt;

    return {
        score: score,
        maxScore: TS.test.totalMarks,
        total: TS.flat.length,
        correct: correct,
        incorrect: incorrect,
        skipped: skipped,
        attempted: attempted,
        accuracy: attempted > 0 ? (correct / attempted) * 100 : 0,
        totalTimeMs: elapsedMs > 0 ? elapsedMs : timeMs,
        questionTimeMs: timeMs,
        sections: sections
    };
}

// ==================== CUSTOM TEST BUILDING ====================
/* Selection map for the builder: "file__sectionIndex" -> pick descriptor. */
let customSectionSelection = {};

function customSelectionKey(file, sectionIndex) {
    return `${file}__${sectionIndex}`;
}

function customSelectionList() {
    return Object.values(customSectionSelection);
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/* Sections picked from different tests can share a name ("Physics" from two
   papers), so any name used more than once gets its source test appended. */
function buildCustomTest(opts) {
    const picks = customSelectionList();
    if (picks.length === 0) return null;

    const nameCount = {};
    picks.forEach(p => { nameCount[p.sectionName] = (nameCount[p.sectionName] || 0) + 1; });

    /* `blueprint` records exactly which questions were taken, so a stored
       attempt can rebuild this paper later from the source files alone. */
    const blueprint = [];
    const sections = picks.map(p => {
        const source = loadedTests[p.file];
        const original = source.sections[p.sectionIndex];
        let questions = original.questions.slice();
        if (opts && opts.shuffle) shuffleInPlace(questions);
        questions = questions.slice(0, Math.max(1, Math.min(p.count, questions.length)));

        const name = nameCount[p.sectionName] > 1 ? `${p.sectionName} · ${source.name}` : p.sectionName;
        blueprint.push({
            name: name,
            icon: original.icon || '',
            file: p.file,
            sectionIndex: p.sectionIndex,
            questionIds: questions.map(q => q.id)
        });

        return { name: name, icon: original.icon || '', marking: original.marking, questions: questions };
    });

    const totalQuestions = sections.reduce((n, s) => n + s.questions.length, 0);
    const totalMarks = sections.reduce(
        (n, s) => n + s.questions.reduce((m, q) => m + q.marking.correct, 0), 0);
    const fileCount = new Set(picks.map(p => p.file)).size;
    const name = (opts && opts.name) || 'My Custom Test';
    const duration = (opts && opts.duration) || 60;

    return {
        id: `custom_${Date.now()}`,
        name: name,
        description: `${sections.length} section${sections.length !== 1 ? 's' : ''} combined from ${fileCount} test${fileCount !== 1 ? 's' : ''}.`,
        duration: duration,
        marking: { correct: 4, incorrect: -1 },
        sections: sections,
        totalQuestions: totalQuestions,
        totalMarks: totalMarks,
        file: null,
        isCustom: true,
        customSource: {
            kind: 'custom',
            name: name,
            duration: duration,
            // Same mix picked again = same key, so those attempts group together.
            composition: picks.map(p => `${p.file}#${p.sectionIndex}#${p.count}`).sort().join('|'),
            sections: blueprint
        }
    };
}
