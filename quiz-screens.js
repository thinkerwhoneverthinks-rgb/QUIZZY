// ==================== NAVIGATION LOGIC ====================
async function initNavigation() {
    showScreen('screenSubjects'); 
    if (typeof pushQuizHistory === 'function') {
        pushQuizHistory({ cafe: 'question', screen: 'screenSubjects', dirLength: 0 }, true);
    }
    try {
        const response = await fetch('data/manifest.json');
        manifestRoot = await response.json();
        currentDirectory = [];
        renderTree(manifestRoot);
    } catch (e) {
        console.error("Failed to load manifest", e);
        document.getElementById('subjectGrid').innerHTML = 
            '<p style="color:var(--text-muted);text-align:center;padding:2rem;">Failed to load content. Check data/manifest.json</p>';
    }
    // Check offline status
    checkAndShowOfflineStatus();
    // Check if coming from a bookmark link (either flow)
    if (!checkGotoBookmarkPractice()) {
        checkGotoBookmark();
    }
}

async function checkGotoBookmark() {
    try {
        const raw = sessionStorage.getItem('studycafe-goto');
        if (!raw) return;
        sessionStorage.removeItem('studycafe-goto');
        const goto = JSON.parse(raw);
        const file = goto.file || goto.subject;
        if (file) {
            await loadFile(file);
            if (goto.chapterId) {
                await selectChapter(goto.chapterId);
                currentMode = 'onebyone';
                const startIndex = Math.min(goto.qIndex || 0, questions.length - 1);
                showQuiz(startIndex);
            }
        }
    } catch (e) {
        console.warn("Could not process goto bookmark:", e);
    }
}

/* Standalone bookmark-practice flow: renders a session built entirely from stored
   bookmark snapshots (see saveBookmark() in quiz-bookmarks.js), never touching the
   source chapter/file. Returns true if it handled a pending payload. */
function checkGotoBookmarkPractice() {
    try {
        const raw = sessionStorage.getItem('studycafe-bookmark-practice');
        if (!raw) return false;
        sessionStorage.removeItem('studycafe-bookmark-practice');
        const payload = JSON.parse(raw);
        if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return false;

        questions = payload.items;
        topics = [{ topic: payload.label || 'Bookmarks', questions: payload.items }];
        currentChapter = { id: 'bookmark', name: payload.label || 'Bookmarked Questions' };
        currentFileName = null;
        subjectData = null;
        currentMode = 'bookmark';
        selectedTopics = [];

        const startIndex = Math.min(payload.startIndex || 0, questions.length - 1);
        showQuiz(startIndex);
        return true;
    } catch (e) {
        console.warn("Could not process bookmark practice payload:", e);
        return false;
    }
}

// ==================== TREE RENDERING ====================
function renderTree(node) {
    const container = document.getElementById('subjectGrid');
    container.innerHTML = ''; 

    // Render breadcrumb if we're inside a folder
    if (currentDirectory.length > 0) {
        const breadcrumb = document.createElement('div');
        breadcrumb.className = 'breadcrumb-bar';
        breadcrumb.innerHTML = `
            <button class="breadcrumb-back" onclick="goBackInTree()">← Back</button>
            <div class="breadcrumb-path">
                <span class="breadcrumb-item" onclick="goToRoot()">🏠 Home</span>
                ${currentDirectory.map((dir, i) => `
                    <span class="breadcrumb-sep">›</span>
                    <span class="breadcrumb-item ${i === currentDirectory.length - 1 ? 'active' : ''}" 
                          onclick="goToLevel(${i})">${escapeHtml(dir.name)}</span>
                `).join('')}
            </div>
        `;
        container.appendChild(breadcrumb);
    }

    // Render Subsections (Folders)
    if (node.subsections) {
        node.subsections.forEach(sub => {
            const folderName = sub.displayName || sub.name || 'Folder';
            const hasSyllabus = sub.syllabus && sub.syllabus.enabled !== false && sub.syllabus.content;
            const sylBtn = hasSyllabus ? `
                <span class="syllabus-btn ${sub.syllabus.type === 'pdf' ? 'pdf' : ''}" 
                      onclick="event.stopPropagation(); openSyllabus(${escapeHtmlAttr(JSON.stringify(sub.syllabus))}, '${escapeHtmlAttr(folderName)}');"
                      title="View Syllabus">
                    📄 ${escapeHtml(sub.syllabus.buttonLabel || sub.syllabus.title || 'Syllabus')}
                </span>` : '';

            const el = document.createElement('div');
            el.className = 'subject-rect folder-card';
            el.onclick = () => enterFolder(sub);
            el.innerHTML = `
                <div class="rect-emoji">${sub.icon || '📁'}</div>
                <div class="rect-info" style="flex:1;">
                    <div class="rect-name">${escapeHtml(folderName)}</div>
                    <div class="rect-meta">${countItems(sub)} items</div>
                </div>
                ${sylBtn}
            `;
            container.appendChild(el);
        });
    }

    // Render Files (Quizzes/Chapters)
    if (node.files) {
        node.files.forEach(file => {
            const filePath = typeof file === 'object' ? (file.path || file.file || '') : file;
            const fileDisplayName = typeof file === 'object' ? (file.displayName || file.name) : null;
            const fileSyllabus = typeof file === 'object' ? file.syllabus : null;

            const baseName = filePath.split('/').pop().split('\\').pop();
            const fallbackName = baseName.replace('.json', '').replace(/_/g, ' ').replace(/,/g, ', ');
            const displayName = fileDisplayName || fallbackName;

            const hasSyllabus = fileSyllabus && fileSyllabus.enabled !== false && fileSyllabus.content;
            const sylBtn = hasSyllabus ? `
                <span class="syllabus-btn ${fileSyllabus.type === 'pdf' ? 'pdf' : ''}" 
                      onclick="event.stopPropagation(); openSyllabus(${escapeHtmlAttr(JSON.stringify(fileSyllabus))}, '${escapeHtmlAttr(displayName)}');"
                      title="View Syllabus">
                    📄 ${escapeHtml(fileSyllabus.buttonLabel || fileSyllabus.title || 'Syllabus')}
                </span>` : '';

            const btnId = `dlBtn-${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const dlBtn = `
                <button class="download-file-btn" id="${btnId}" 
                        onclick="event.stopPropagation(); handleFileDownload('${escapeHtmlAttr(filePath)}', this)" 
                        title="Download for offline">⬇️</button>
            `;

            const el = document.createElement('div');
            el.className = 'chapter-row file-card';
            el.innerHTML = `
                <div class="chapter-icon">📄</div>
                <div class="chapter-info" style="flex:1;">
                    <div class="chapter-title">${escapeHtml(displayName)}</div>
                </div>
                ${sylBtn}
                ${dlBtn}
            `;
            el.onclick = () => loadFile(filePath);
            container.appendChild(el);
            checkFileOfflineStatus(filePath);
        });
    }
}

function countItems(node) {
    let count = 0;
    if (node.subsections) count += node.subsections.length;
    if (node.files) count += node.files.length;
    return count;
}

async function checkFileOfflineStatus(fileName) {
    try {
        const isDownloaded = await offlineStorage.isFileDownloaded(fileName);
        const btnId = `dlBtn-${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const btn = document.getElementById(btnId);
        if (btn && isDownloaded) {
            btn.innerHTML = '✅';
            btn.classList.add('downloaded');
            btn.title = 'Available offline (click to remove)';
        }
    } catch (e) { /* ignore */ }
}

async function handleFileDownload(fileName, btn) {
    const isDownloaded = await offlineStorage.isFileDownloaded(fileName);
    
    if (isDownloaded) {
        if (confirm('This file is saved offline. Remove offline data?')) {
            await offlineStorage.deleteFileOffline(fileName);
            btn.innerHTML = '⬇️';
            btn.classList.remove('downloaded');
            btn.title = 'Download for offline';
        }
        return;
    }

    // Need to load and normalize first
    btn.disabled = true;
    btn.innerHTML = '⏳';
    
    try {
        let normalizedData = loadedFiles[fileName];
        if (!normalizedData) {
            const response = await fetch(`data/${fileName}`);
            const rawData = await response.json();
            normalizedData = normalizeJsonData(rawData, fileName);
            loadedFiles[fileName] = normalizedData;
        }
        await downloadFileUI(fileName, normalizedData, btn);
    } catch (e) {
        console.error('Download error:', e);
        btn.innerHTML = '❌';
        btn.disabled = false;
        setTimeout(() => { btn.innerHTML = '⬇️'; }, 2000);
    }
}

// ==================== FOLDER NAVIGATION ====================
function enterFolder(sub) {
    currentDirectory.push(sub);
    renderTree(sub);
    if (typeof pushQuizHistory === 'function') {
        pushQuizHistory({ cafe: 'question', screen: 'screenSubjects', dirLength: currentDirectory.length });
    }
}

function goBackInTree() {
    if (window.history.length > 1 && history.state && history.state.cafe === 'question' && history.state.dirLength > 0) {
        window.history.back();
    } else {
        currentDirectory.pop();
        if (currentDirectory.length === 0) {
            renderTree(manifestRoot);
        } else {
            renderTree(currentDirectory[currentDirectory.length - 1]);
        }
    }
}

function goToRoot() {
    currentDirectory = [];
    renderTree(manifestRoot);
    showSubjects();
}

function goToLevel(levelIndex) {
    currentDirectory = currentDirectory.slice(0, levelIndex + 1);
    renderTree(currentDirectory[currentDirectory.length - 1]);
    if (typeof pushQuizHistory === 'function') {
        pushQuizHistory({ cafe: 'question', screen: 'screenSubjects', dirLength: currentDirectory.length });
    }
}

// ==================== JSON NORMALIZATION ====================
function normalizeJsonData(rawData, fileName) {
    // Case 1: Already in the expected format { chapters: [...] }
    if (rawData && rawData.chapters && Array.isArray(rawData.chapters)) {
        return rawData;
    }

    // Case 2: Test Cafe format { sections: [...] } or { subjects: [...] }
    if (rawData && (Array.isArray(rawData.sections) || Array.isArray(rawData.subjects))) {
        const rawSections = rawData.sections || rawData.subjects;
        const chapters = rawSections.map((s, si) => {
            const sName = s.name || s.section || s.subject || s.title || `Section ${si + 1}`;
            const topicMap = {};
            (s.questions || s.qs || []).forEach(q => {
                const subCat = q.sub_category || q.subtopic || q.topic || 'General';
                if (!topicMap[subCat]) topicMap[subCat] = [];
                topicMap[subCat].push(normalizeFlatQuestion({
                    ...q,
                    category: sName,
                    sub_category: subCat
                }));
            });
            const topics = Object.entries(topicMap).map(([tName, qs]) => ({
                topic: tName,
                questions: qs
            }));
            return {
                id: slugify(sName),
                name: sName,
                icon: s.icon || getCategoryIcon(sName),
                topics: topics
            };
        });
        return { chapters };
    }

    // Case 3: Flat array of image-based questions (allen26 format)
    if (Array.isArray(rawData)) {
        return normalizeFlatArray(rawData, fileName);
    }

    // Case 4: Single chapter without wrapper
    if (rawData && rawData.topics) {
        return {
            chapters: [{
                id: slugify(rawData.name || fileName),
                name: rawData.name || fileName.replace('.json', ''),
                icon: '📘',
                topics: rawData.topics.map(t => ({
                    topic: t.topic || 'General',
                    questions: (t.questions || []).map(q => normalizeFlatQuestion(q))
                }))
            }]
        };
    }

    // Case 5: Just questions array at root
    if (rawData && rawData.questions) {
        return {
            chapters: [{
                id: slugify(fileName),
                name: fileName.replace('.json', '').replace(/_/g, ' '),
                icon: '📘',
                topics: [{ topic: 'All Questions', questions: rawData.questions.map(q => normalizeFlatQuestion(q)) }]
            }]
        };
    }

    console.warn('Unknown JSON format, wrapping as single chapter');
    return {
        chapters: [{
            id: slugify(fileName),
            name: fileName.replace('.json', '').replace(/_/g, ' '),
            icon: '📘',
            topics: [{ topic: 'All Questions', questions: [] }]
        }]
    };
}

function normalizeFlatArray(arr, fileName) {
    // Filter active questions
    const activeQuestions = arr.filter(q => q.is_active !== false);

    // Group by category
    const categoryMap = {};
    activeQuestions.forEach(q => {
        const cat = q.category || 'General';
        if (!categoryMap[cat]) categoryMap[cat] = {};

        const subCat = q.sub_category || 'General';
        if (!categoryMap[cat][subCat]) categoryMap[cat][subCat] = [];

        categoryMap[cat][subCat].push(normalizeFlatQuestion(q));
    });

    // Convert to chapters/topics structure
    const chapters = Object.entries(categoryMap).map(([catName, subCats]) => {
        const topics = Object.entries(subCats).map(([subCatName, qs]) => ({
            topic: subCatName,
            questions: qs
        }));

        return {
            id: slugify(catName),
            name: catName,
            icon: getCategoryIcon(catName),
            topics: topics
        };
    });

    return { chapters };
}

function resolveCorrectIndex(q, options) {
    if (typeof q.correct === 'number') return q.correct;
    if (typeof q.correct_index === 'number') return q.correct_index;
    if (typeof q.correct_answer === 'number') {
        return q.correct_answer > 0 ? q.correct_answer - 1 : q.correct_answer;
    }
    if (typeof q.correct_option === 'number') {
        return q.correct_option > 0 ? q.correct_option - 1 : q.correct_option;
    }
    if (Array.isArray(q.correct_answer)) {
        return q.correct_answer.map(c => typeof c === 'number' && c > 0 ? c - 1 : c);
    }
    if (Array.isArray(q.correct)) return q.correct;

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
            if (Array.isArray(options)) {
                const byText = options.findIndex(
                    o => String(o).trim().toLowerCase() === candidate.trim().toLowerCase());
                if (byText >= 0) return byText;
            }
        }
    }
    return 0;
}

function normalizeFlatQuestion(q) {
    let type = (q.type || '').toLowerCase();
    // Normalize type string
    if (type === 'fill_blanks') type = 'fill_blank';
    if (type === 'numerical' || type === 'integer_type') type = 'integer';

    const rawOptions = q.options || q.choices || q.option_texts || null;
    const hasTextOptions = Array.isArray(rawOptions) && rawOptions.length > 0 && rawOptions.some(o => o && String(o).trim() !== '' && !/^Option\s*\d+$/i.test(String(o)));
    const imgUrl = q.image_url || q.image || null;

    // Auto-detect or sanitize question type
    if (!type) {
        if (hasTextOptions) {
            type = 'mcq';
        } else if (imgUrl && (!q.question || q.question.trim() === '' || /^Refer to the image/i.test(q.question))) {
            type = 'image_mcq';
        } else if (q.answer !== undefined && !rawOptions) {
            type = 'integer';
        } else {
            type = 'mcq';
        }
    }

    // If type is 'mcq' but there are no text options and there is an image, treat as image_mcq
    if (type === 'mcq' && !hasTextOptions && imgUrl) {
        type = 'image_mcq';
    }

    const options = Array.isArray(rawOptions) && rawOptions.length > 0
        ? rawOptions.map(o => (o === null || o === undefined ? '' : String(o)))
        : (type === 'image_mcq' ? ['Option 1', 'Option 2', 'Option 3', 'Option 4'] : null);

    const optionImages = q.option_images || q.optionImages || null;
    const correct = resolveCorrectIndex(q, options);

    return {
        id: q.id || `q_${Math.random().toString(36).substr(2, 9)}`,
        type: type,
        question: q.question || q.text || q.question_text || '',
        image_url: imgUrl,
        original_file: q.original_file || null,
        options: options,
        optionImages: Array.isArray(optionImages) ? optionImages : null,
        correct: correct,
        answer: q.answer !== undefined ? String(q.answer) : (type === 'integer' && q.correct !== undefined && q.correct !== null ? String(q.correct) : (typeof q.correct_answer === 'string' ? q.correct_answer : String(q.correct_answer || ''))),
        explanation: q.explanation || q.solution || '',
        explanation_image: q.explanation_image || q.solution_image || null,
        video: q.video || null,
        marking: q.marking || (q.marks ? { correct: q.marks, incorrect: q.negative || -1 } : null),
        matchLists: q.matchLists || null,
        images: Array.isArray(q.images) ? q.images : null,
        category: q.category || 'General',
        sub_category: q.sub_category || q.subtopic || 'General',
        exam_name: q.exam_name || null,
        exam_type: q.exam_type || null,
        exam_year: q.exam_year || null,
        exam_shift: q.exam_shift || null,
        exam_reference: q.exam_reference || null,
        passage: q.passage || null,
        translations: q.translations || null
    };
}

function getCategoryIcon(catName) {
    const lower = catName.toLowerCase();
    if (lower.includes('analytical')) return '🔬';
    if (lower.includes('conceptual')) return '💡';
    if (lower.includes('pyq') || lower.includes('previous')) return '📝';
    if (lower.includes('practice')) return '🎯';
    if (lower.includes('ncert')) return '📚';
    return '📘';
}

function slugify(text) {
    return (text || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// ==================== DATA LOADING (OFFLINE-FIRST) ====================
async function loadFile(fileName) {
    showScreen('screenLoading');
    currentFileName = fileName;

    try {
        let rawData = null;

        /* Network first, so an edited question file shows up without waiting for
           a cache bust. No `?t=` buster here on purpose: the service worker
           already serves /data/*.json network-first, and a unique query string
           would make its offline cache entry unmatchable. */
        if (navigator.onLine) {
            try {
                const response = await fetch(`data/${fileName}`);
                if (response.ok) {
                    rawData = await response.json();
                }
            } catch (netErr) { /* fallback to offline */ }
        }

        // Downloaded-for-offline copy
        if (!rawData) {
            try {
                const offlineData = await offlineStorage.getQuizData(fileName);
                if (offlineData) {
                    rawData = offlineData;
                }
            } catch (e) { /* ignore */ }
        }

        // Last resort: let the service worker answer from its cache.
        if (!rawData) {
            const response = await fetch(`data/${fileName}`);
            if (!response.ok) throw new Error(`Could not load ${fileName}`);
            rawData = await response.json();
        }

        const data = normalizeJsonData(rawData, fileName);
        loadedFiles[fileName] = data;
        subjectData = data;

        if (data.chapters && data.chapters.length > 1) {
            renderChapters();
            showScreen('screenChapters');
        } else if (data.chapters && data.chapters.length === 1) {
            selectChapter(data.chapters[0].id);
        } else {
            alert('No chapters found in this file.');
            showScreen('screenSubjects');
        }
    } catch (e) {
        alert("Error loading file: " + e.message);
        showScreen('screenSubjects');
    }
}

// ==================== CHAPTER SELECTION ====================
function renderChapters() {
    document.getElementById('chapterSubjectTitle').textContent = 
        currentFileName ? currentFileName.replace('.json', '').replace(/_/g, ' ').replace(/,/g, ', ') : 'Select Chapter';
    
    const list = document.getElementById('chapterList');
    list.innerHTML = subjectData.chapters.map(ch => {
        const qCount = (ch.topics || []).reduce((sum, t) => sum + (t.questions || []).length, 0);
        const tCount = (ch.topics || []).length;
        const btnId = `chdl_${ch.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
        return `
            <div class="chapter-row" onclick="selectChapter('${ch.id}')">
                <div class="chapter-icon">${ch.icon || '📘'}</div>
                <div class="chapter-info" style="flex:1;">
                    <div class="chapter-title">${escapeHtml(ch.name)}</div>
                    <div class="chapter-meta">${tCount} topic${tCount !== 1 ? 's' : ''} · ${qCount} questions</div>
                </div>
                <button class="download-file-btn" id="${btnId}" 
                        onclick="event.stopPropagation(); downloadChapterOffline('${ch.id}', this)" 
                        title="Download chapter offline">⬇️</button>
            </div>
        `;
    }).join('');

    subjectData.chapters.forEach(ch => {
        const btnId = `chdl_${ch.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const btn = document.getElementById(btnId);
        if (btn && typeof offlineStorage !== 'undefined') {
            offlineStorage.isTopicDownloaded(currentFileName, ch.id, 'all').then(isDl => {
                if (isDl) {
                    btn.innerHTML = '✅';
                    btn.classList.add('downloaded');
                    btn.title = 'Chapter available offline';
                }
            }).catch(() => {});
        }
    });
}

async function downloadChapterOffline(chapterId, btnElement) {
    if (!subjectData || !subjectData.chapters) return;
    const ch = subjectData.chapters.find(c => c.id === chapterId);
    if (!ch) return;

    const qs = [];
    if (ch.topics && ch.topics.length > 0) {
        ch.topics.forEach(t => (t.questions || []).forEach(q => qs.push(q)));
    } else if (ch.questions && ch.questions.length > 0) {
        ch.questions.forEach(q => qs.push(q));
    }
    if (!qs.length) return;

    const originalText = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = '⏳';

    try {
        await offlineStorage.downloadTopicForOffline(
            currentFileName || 'quiz', chapterId, 'all', qs,
            (done, total) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 100;
                btnElement.innerHTML = `⏳ ${pct}%`;
            }
        );
        btnElement.innerHTML = '✅';
        btnElement.classList.add('downloaded');
        btnElement.title = 'Chapter available offline';
        btnElement.disabled = false;
    } catch (e) {
        console.error('Download chapter failed:', e);
        btnElement.innerHTML = '❌';
        setTimeout(() => { btnElement.innerHTML = originalText; btnElement.disabled = false; }, 2000);
    }
}

async function selectChapter(id) {
    const chapters = subjectData && subjectData.chapters ? subjectData.chapters : [];
    currentChapter = chapters.find(c => c.id === id);
    
    if (!currentChapter) {
        alert('Chapter not found');
        return;
    }

    // Dynamic Logic: Handles topics OR flat questions
    const isNeetprep = (currentChapter && currentChapter.id && currentChapter.id.startsWith('neetprep')) || (typeof currentFileName === 'string' && currentFileName.includes('neetprep'));
    const defaultOrder = isNeetprep ? 'serial' : 'topic';

    if (currentChapter.topics && currentChapter.topics.length > 0) {
        topics = currentChapter.topics;
        let flat = topics.flatMap(t => t.questions.map(q => ({...q, topicName: t.topic})));
        if (defaultOrder === 'serial' && flat.some(q => typeof q.originalOrder === 'number' || typeof q.originalNumber === 'number')) {
            flat.sort((a, b) => (a.originalOrder || a.originalNumber || 0) - (b.originalOrder || b.originalNumber || 0));
        }
        questions = flat;
    } else if (currentChapter.questions && currentChapter.questions.length > 0) {
        topics = [{
            topic: currentChapter.name, 
            questions: currentChapter.questions
        }];
        questions = currentChapter.questions.map(q => ({...q, topicName: currentChapter.name}));
    } else {
        alert("No questions found in this chapter.");
        return;
    }

    selectedTopics = [];
    topicQuestionCounts = {};
    currentPracticeOrder = defaultOrder;
    if (typeof practiceOrder !== 'undefined') practiceOrder = defaultOrder;
    currentMode = 'onebyone';
    userAnswers = {};
    currentQIndex = 0;
    showQuiz();
}

function backFromQuiz() {
    closeGrid();
    if (window.history.length > 1 && history.state && history.state.cafe === 'question' && history.state.screen && history.state.screen !== 'screenSubjects') {
        window.history.back();
    } else {
        if (subjectData && subjectData.chapters && subjectData.chapters.length > 1) {
            showChapters();
        } else {
            showSubjects();
        }
    }
}

// ==================== GRID & UI HELPERS ====================
let currentPracticeOrder = 'topic'; // 'topic' or 'serial'

function setGridOrder(order) {
    if (currentPracticeOrder === order) return;
    currentPracticeOrder = order;
    if (typeof practiceOrder !== 'undefined') practiceOrder = order;

    // Preserve current question identity
    const currentQ = questions && questions[currentQIndex];

    // Preserve user answers by question identity across index shifts
    const answersByQId = new Map();
    if (questions && typeof userAnswers === 'object' && userAnswers) {
        questions.forEach((q, i) => {
            if (userAnswers[i] !== undefined) {
                const key = q.id || (q.originalOrder !== undefined ? `order_${q.originalOrder}` : (q.originalNumber !== undefined ? `orig_${q.originalNumber}` : `idx_${i}`));
                answersByQId.set(key, userAnswers[i]);
            }
        });
    }

    if (order === 'serial' && questions.some(q => typeof q.originalNumber === 'number' || typeof q.originalOrder === 'number')) {
        questions.sort((a, b) => (a.originalOrder || a.originalNumber || 0) - (b.originalOrder || b.originalNumber || 0));
    } else if (order === 'topic') {
        if (typeof topics !== 'undefined' && topics && topics.length > 0) {
            questions = topics.flatMap(t => (t.questions || []).map(q => ({ ...q, topicName: t.topic })));
        }
    }

    // Remap user answers to new indices
    if (questions && answersByQId.size > 0) {
        const newUserAnswers = {};
        questions.forEach((q, newIdx) => {
            const key = q.id || (q.originalOrder !== undefined ? `order_${q.originalOrder}` : (q.originalNumber !== undefined ? `orig_${q.originalNumber}` : `idx_${newIdx}`));
            if (answersByQId.has(key)) {
                newUserAnswers[newIdx] = answersByQId.get(key);
            }
        });
        userAnswers = newUserAnswers;
    }

    // Restore current question index to same question
    if (currentQ && questions) {
        const newIdx = questions.findIndex(q => q === currentQ || (q.id && currentQ.id && q.id === currentQ.id) || (q.originalOrder && q.originalOrder === currentQ.originalOrder) || (q.originalNumber && q.originalNumber === currentQ.originalNumber));
        if (newIdx !== -1) currentQIndex = newIdx;
    }

    renderQuestionGrid();
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && activeScreen.id === 'screenFullQuiz' && typeof renderFullQuiz === 'function') {
        renderFullQuiz();
    } else if (typeof renderQuestion === 'function') {
        renderQuestion();
    }
}

function jumpToTopicFromGrid(val) {
    if (val === 'ALL') {
        jumpToQuestion(0);
        return;
    }
    const idx = parseInt(val, 10);
    if (isNaN(idx) || !topics || !topics[idx]) return;
    const targetTopicName = topics[idx].topic;
    const targetQIdx = questions.findIndex(q => (q.topic === targetTopicName || q.topicName === targetTopicName));
    if (targetQIdx !== -1) {
        jumpToQuestion(targetQIdx);
    }
}

function renderQuestionGrid() {
    const body = document.getElementById('gridPanelBody');
    if (!body) return;

    const activeScreen = document.querySelector('.screen.active');
    const isTestMode = activeScreen && activeScreen.id === 'screenTestMode';
    // Never reveal correct/wrong while a test is still in progress — only after submit.
    const showCorrectness = !isTestMode || testSubmitted;

    const isDone = (idx) => {
        const ans = userAnswers[idx];
        if (!ans) return false;
        if (isTestMode) {
            if (Array.isArray(ans.selected)) return ans.selected.length > 0;
            if (ans.selected !== undefined) return true;
            return !!(ans.userAnswer && ans.userAnswer.trim());
        }
        return !!ans.revealed;
    };

    const isBookmarked = (idx) => {
        if (typeof isQuestionBookmarked !== 'function') return false;
        const q = questions[idx];
        if (currentMode === 'bookmark') {
            return !!(q && q.origChapterId != null && isQuestionBookmarked(q.origChapterId, q.origIndex));
        }
        return !!(currentChapter && isQuestionBookmarked(currentChapter.id, idx));
    };

    // Group questions by topicName, keeping the order they appear in.
    const groups = {};
    questions.forEach((q, i) => {
        const topicName = q.topicName || 'General Questions';
        if (!groups[topicName]) groups[topicName] = [];
        groups[topicName].push({ q, index: i });
    });

    const chapterLabel = currentChapter ? currentChapter.name : 'Custom Test';
    const doneCount = questions.reduce((n, _, i) => n + (isDone(i) ? 1 : 0), 0);
    const topicCount = Object.keys(groups).length;
    const hasHi = questions && questions.some(q => q.translations && q.translations.hi);
    const langBarHtml = '';

    const isRearranged = typeof isExerciseTopicRearranged === 'function' && isExerciseTopicRearranged();
    const orderBarHtml = isRearranged ? `
        <div class="grid-order-bar">
            <span>🔀 Order:</span>
            <div class="lang-pill-group">
                <button class="lang-pill ${currentPracticeOrder === 'topic' ? 'active' : ''}" onclick="setGridOrder('topic')">🗂️ Topic-wise</button>
                <button class="lang-pill ${currentPracticeOrder === 'serial' ? 'active' : ''}" onclick="setGridOrder('serial')">🔢 Original (1..${questions.length})</button>
            </div>
        </div>
    ` : '';

    const topicFilterHtml = (currentPracticeOrder !== 'serial' && topics && topics.length > 1) ? `
        <div class="grid-filter-bar">
            <span>📂 Jump to Topic:</span>
            <select class="grid-topic-select" id="gridTopicSelect" onchange="jumpToTopicFromGrid(this.value)">
                <option value="ALL">All Topics (${questions.length} Qs)</option>
                ${topics.map((t, i) => {
                    const count = t.questions ? t.questions.length : 0;
                    return `<option value="${i}">${escapeHtml(t.topic)} (${count} Qs)</option>`;
                }).join('')}
            </select>
        </div>
    ` : '';

    const isPracticeView = (currentMode === 'onebyone' || currentMode === 'fullquiz');
    const viewModeBarHtml = isPracticeView ? `
        <div class="grid-viewmode-bar" style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.45rem 0.85rem;margin-bottom:0.75rem;">
            <span style="font-size:0.8rem;font-weight:600;color:var(--text-primary);">👁️ View Mode:</span>
            <div class="lang-pill-group">
                <button class="lang-pill ${currentMode === 'onebyone' ? 'active' : ''}" onclick="switchQuizViewMode('onebyone')">📄 One by One</button>
                <button class="lang-pill ${currentMode === 'fullquiz' ? 'active' : ''}" onclick="switchQuizViewMode('fullquiz')">📜 Scroll All</button>
            </div>
        </div>
    ` : '';

    let html = `
        <div class="grid-context">
            <div class="gc-chapter">${escapeHtml(chapterLabel)}</div>
            <div class="gc-meta">
                ${currentPracticeOrder === 'serial' ? 'Original Serial Order · ' : (topicCount + ' topic' + (topicCount !== 1 ? 's' : '') + ' · ')}
                ${questions.length} question${questions.length !== 1 ? 's' : ''} ·
                ${doneCount} ${isTestMode ? 'answered' : 'revealed'}
            </div>
        </div>
        ${viewModeBarHtml}
        ${langBarHtml}
        ${orderBarHtml}
        ${topicFilterHtml}
        <div class="grid-legend">
            ${isTestMode ? '' : '<span><i class="lg-current"></i> Current</span>'}
            <span><i class="lg-answered"></i> ${isTestMode ? 'Answered' : 'Revealed'}</span>
            ${isTestMode ? '<span><i class="lg-reviewed"></i> Marked for review</span>' : ''}
            <span><i class="lg-bookmarked"></i> Bookmarked</span>
            ${showCorrectness ? '<span><i class="lg-correct"></i> Correct</span><span><i class="lg-wrong"></i> Wrong</span>' : ''}
            <span><i></i> Not visited</span>
        </div>
    `;

    if (currentPracticeOrder === 'serial') {
        // Continuous, unified sequential grid without topic divider headers
        html += `<div class="grid-topic-section">`;
        html += `
            <div class="grid-topic-title">
                <span>🔢 All Questions in Sequential Order (1..${questions.length})</span>
                <span class="gt-count">${doneCount} / ${questions.length}</span>
            </div>`;
        html += `<div class="grid-nums">`;
        questions.forEach((q, index) => {
            const ans = userAnswers[index];
            const bookmarked = isBookmarked(index);
            const status = showCorrectness ? getAnswerStatus(index) : 'skipped';
            let cls = 'grid-num';
            if (isDone(index)) cls += ' answered';
            if (bookmarked) cls += ' bookmarked';
            if (status === 'correct') cls += ' correct';
            if (status === 'wrong') cls += ' wrong';
            if (isTestMode && ans && ans.reviewed) cls += ' reviewed';
            if (!isTestMode && index === currentQIndex) cls += ' current';
            const num = q.originalNumber || (index + 1);
            const tip = q.originalOrder && q.originalOrder !== num
                ? `Question ${num} (NEETprep #${q.originalOrder}) · ${q.topicName || q.subtopic || q.topic || ''}`
                : (q.topicName ? `Question ${num} · ${q.topicName}` : `Question ${num}`);
            html += `<div class="${cls}" onclick="jumpToQuestion(${index})" title="${escapeHtml(tip)}">${num}</div>`;
        });
        html += `</div></div>`;
    } else {
        // Topic-wise section grouping
        Object.entries(groups).forEach(([topicName, items]) => {
            const topicDone = items.reduce((n, it) => n + (isDone(it.index) ? 1 : 0), 0);
            html += `<div class="grid-topic-section">`;
            html += `
                <div class="grid-topic-title">
                    <span>📌 ${escapeHtml(topicName)}</span>
                    <span class="gt-count">${topicDone} / ${items.length}</span>
                </div>`;
            html += `<div class="grid-nums">`;
            items.forEach(({ q, index }) => {
                const ans = userAnswers[index];
                const bookmarked = isBookmarked(index);
                const status = showCorrectness ? getAnswerStatus(index) : 'skipped';
                let cls = 'grid-num';
                if (isDone(index)) cls += ' answered';
                if (bookmarked) cls += ' bookmarked';
                if (status === 'correct') cls += ' correct';
                if (status === 'wrong') cls += ' wrong';
                if (isTestMode && ans && ans.reviewed) cls += ' reviewed';
                if (!isTestMode && index === currentQIndex) cls += ' current';
                const num = q.originalNumber || (index + 1);
                const tip = q.originalOrder
                    ? `Question ${num} (NEETprep #${q.originalOrder})`
                    : `Question ${num}`;
                html += `<div class="${cls}" onclick="jumpToQuestion(${index})" title="${escapeHtml(tip)}">${num}</div>`;
            });
            html += `</div></div>`;
        });
    }

    body.innerHTML = html;
    const pcSides = document.querySelectorAll('.qc-pc-side');
    pcSides.forEach(side => {
        side.innerHTML = html;
    });
}

function toggleQuestionGrid() {
    const overlay = document.getElementById('gridOverlay');
    const panel = document.getElementById('gridPanel');
    
    if (!isGridOpen) {
        renderQuestionGrid();
        overlay.classList.add('active');
        panel.classList.add('active');
        isGridOpen = true;
    } else {
        closeGrid();
    }
}

function closeGrid() {
    document.getElementById('gridOverlay').classList.remove('active');
    document.getElementById('gridPanel').classList.remove('active');
    isGridOpen = false;
}

function jumpToQuestion(idx) {
    const activeScreen = document.querySelector('.screen.active');
    
    if (activeScreen.id === 'screenQuiz') {
        currentQIndex = idx;
        renderQuestion();
        closeGrid();
    } else if (activeScreen.id === 'screenFullQuiz') {
        const card = document.getElementById(`fullQ-${idx}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeGrid();
    } else if (activeScreen.id === 'screenTestMode') {
        const card = document.getElementById(`testQ-${idx}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeGrid();
    }
}
