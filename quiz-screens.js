// ==================== NAVIGATION LOGIC ====================
async function initNavigation() {
    showScreen('screenSubjects'); 
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
    // Check if coming from a bookmark link
    checkGotoBookmark();
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
                currentQIndex = Math.min(goto.qIndex || 0, questions.length - 1);
                showQuiz();
            }
        }
    } catch (e) {
        console.warn("Could not process goto bookmark:", e);
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
            const el = document.createElement('div');
            el.className = 'subject-rect folder-card';
            el.onclick = () => enterFolder(sub);
            el.innerHTML = `
                <div class="rect-emoji">${sub.icon || '📁'}</div>
                <div class="rect-info">
                    <div class="rect-name">${escapeHtml(sub.name)}</div>
                    <div class="rect-meta">${countItems(sub)} items</div>
                </div>
            `;
            container.appendChild(el);
        });
    }

    // Render Files (Quizzes/Chapters)
    if (node.files) {
        node.files.forEach(file => {
            const baseName = file.split('/').pop().split('\\').pop();
            const displayName = baseName.replace('.json', '').replace(/_/g, ' ').replace(/,/g, ', ');
            const el = document.createElement('div');
            el.className = 'chapter-row file-card';
            el.innerHTML = `
                <div class="chapter-icon">📄</div>
                <div class="chapter-info">
                    <div class="chapter-title">${escapeHtml(displayName)}</div>
                </div>
            `;
            el.onclick = () => loadFile(file);
            container.appendChild(el);
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
}

function goBackInTree() {
    currentDirectory.pop();
    if (currentDirectory.length === 0) {
        renderTree(manifestRoot);
    } else {
        renderTree(currentDirectory[currentDirectory.length - 1]);
    }
}

function goToRoot() {
    currentDirectory = [];
    renderTree(manifestRoot);
    showScreen('screenSubjects');
}

function goToLevel(levelIndex) {
    currentDirectory = currentDirectory.slice(0, levelIndex + 1);
    renderTree(currentDirectory[currentDirectory.length - 1]);
}

// ==================== JSON NORMALIZATION ====================
function normalizeJsonData(rawData, fileName) {
    // Case 1: Already in the expected format { chapters: [...] }
    if (rawData && rawData.chapters && Array.isArray(rawData.chapters)) {
        return rawData;
    }

    // Case 2: Flat array of image-based questions (allen26 format)
    if (Array.isArray(rawData)) {
        return normalizeFlatArray(rawData, fileName);
    }

    // Case 3: Single chapter without wrapper
    if (rawData && rawData.topics) {
        return {
            chapters: [{
                id: slugify(rawData.name || fileName),
                name: rawData.name || fileName.replace('.json', ''),
                icon: '📘',
                topics: rawData.topics
            }]
        };
    }

    // Case 4: Just questions array at root
    if (rawData && rawData.questions) {
        return {
            chapters: [{
                id: slugify(fileName),
                name: fileName.replace('.json', '').replace(/_/g, ' '),
                icon: '📘',
                topics: [{ topic: 'All Questions', questions: rawData.questions }]
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

function normalizeFlatQuestion(q) {
    let type = q.type;
    // Normalize type string
    if (type === 'fill_blanks') type = 'fill_blank';

    // Auto-detect or sanitize question type
    if (!type) {
        if (q.options && Array.isArray(q.options) && q.options.length > 0) {
            type = 'mcq';
        } else if (q.image_url && (!q.question || q.question.trim() === '')) {
            type = 'image_mcq';
        } else if (q.answer !== undefined) {
            type = 'fill_blank';
        } else {
            type = 'mcq';
        }
    }

    // If type is 'mcq' but question text and options are missing, treat as 'image_mcq'
    if (type === 'mcq' && (!q.question || q.question.trim() === '') && q.image_url && (!q.options || !Array.isArray(q.options) || q.options.length === 0)) {
        type = 'image_mcq';
    }

    // Normalize correct answer
    let correct = q.correct;
    if (correct === undefined && q.correct_answer !== undefined) {
        if (typeof q.correct_answer === 'number') {
            correct = q.correct_answer > 0 ? q.correct_answer - 1 : q.correct_answer;
        } else if (Array.isArray(q.correct_answer)) {
            correct = q.correct_answer.map(c => typeof c === 'number' && c > 0 ? c - 1 : c);
        } else {
            correct = q.correct_answer;
        }
    }

    // Options for image MCQ fallback
    let options = q.options;
    if (type === 'image_mcq' && (!options || !Array.isArray(options) || options.length === 0)) {
        options = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
    }

    return {
        id: q.id || `q_${Math.random().toString(36).substr(2, 9)}`,
        type: type,
        question: q.question || '',
        image_url: q.image_url || null,
        original_file: q.original_file || null,
        options: options || null,
        correct: correct !== undefined ? correct : 0,
        answer: q.answer || (typeof q.correct_answer === 'string' ? q.correct_answer : String(q.correct_answer || '')),
        explanation: q.explanation || '',
        category: q.category || 'General',
        sub_category: q.sub_category || 'General'
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
        let data = null;

        // Try cache first
        if (loadedFiles[fileName]) {
            data = loadedFiles[fileName];
        } else {
            // Try IndexedDB (offline storage)
            try {
                const offlineData = await offlineStorage.getQuizData(fileName);
                if (offlineData) {
                    data = offlineData;
                }
            } catch (e) { /* ignore */ }

            // Fall back to network
            if (!data) {
                try {
                    const response = await fetch(`data/${fileName}`);
                    const rawData = await response.json();
                    data = normalizeJsonData(rawData, fileName);
                } catch (fetchErr) {
                    // If network fails and we have no offline data
                    throw new Error('Cannot load file. You appear to be offline and this file has not been downloaded.');
                }
            }

            loadedFiles[fileName] = data;
        }

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
        return `
            <div class="chapter-row" onclick="selectChapter('${ch.id}')">
                <div class="chapter-icon">${ch.icon || '📘'}</div>
                <div class="chapter-info">
                    <div class="chapter-title">${escapeHtml(ch.name)}</div>
                    <div class="chapter-meta">${tCount} topic${tCount !== 1 ? 's' : ''} · ${qCount} questions</div>
                </div>
            </div>
        `;
    }).join('');
}

async function selectChapter(id) {
    const chapters = subjectData && subjectData.chapters ? subjectData.chapters : [];
    currentChapter = chapters.find(c => c.id === id);
    
    if (!currentChapter) {
        alert('Chapter not found');
        return;
    }

    // Dynamic Logic: Handles topics OR flat questions
    if (currentChapter.topics && currentChapter.topics.length > 0) {
        topics = currentChapter.topics;
        questions = topics.flatMap(t => t.questions.map(q => ({...q, topicName: t.topic})));
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
    showModeSelect();
}

// ==================== GRID & UI HELPERS ====================
function renderQuestionGrid() {
    const body = document.getElementById('gridPanelBody');
    if (!body) return;

    const activeScreen = document.querySelector('.screen.active');
    const isTestMode = activeScreen && activeScreen.id === 'screenTestMode';

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

    // Group questions by topicName, keeping the order they appear in.
    const groups = {};
    questions.forEach((q, i) => {
        const topicName = q.topicName || 'General Questions';
        if (!groups[topicName]) groups[topicName] = [];
        groups[topicName].push({ q, index: i });
    });

    // Header: where these questions came from (file → chapter → topics)
    const fileLabel = currentFileName
        ? currentFileName.replace('.json', '').replace(/_/g, ' ').replace(/,/g, ', ')
        : 'Custom Test';
    const chapterLabel = currentChapter ? currentChapter.name : 'Custom Test';
    const doneCount = questions.reduce((n, _, i) => n + (isDone(i) ? 1 : 0), 0);
    const topicCount = Object.keys(groups).length;

    let html = `
        <div class="grid-context">
            <div class="gc-crumb">📚 ${escapeHtml(fileLabel)}</div>
            <div class="gc-chapter">${escapeHtml(chapterLabel)}</div>
            <div class="gc-meta">
                ${topicCount} topic${topicCount !== 1 ? 's' : ''} ·
                ${questions.length} question${questions.length !== 1 ? 's' : ''} ·
                ${doneCount} ${isTestMode ? 'answered' : 'revealed'}
            </div>
        </div>
        <div class="grid-legend">
            ${isTestMode ? '' : '<span><i class="lg-current"></i> Current</span>'}
            <span><i class="lg-answered"></i> ${isTestMode ? 'Answered' : 'Revealed'}</span>
            ${isTestMode ? '<span><i class="lg-reviewed"></i> Marked for review</span>' : ''}
            <span><i></i> Not visited</span>
        </div>
    `;

    Object.entries(groups).forEach(([topicName, items]) => {
        const topicDone = items.reduce((n, it) => n + (isDone(it.index) ? 1 : 0), 0);
        html += `<div class="grid-topic-section">`;
        html += `
            <div class="grid-topic-title">
                <span>📌 ${escapeHtml(topicName)}</span>
                <span class="gt-count">${topicDone} / ${items.length}</span>
            </div>`;
        html += `<div class="grid-nums">`;
        items.forEach(({ index }) => {
            const ans = userAnswers[index];
            let cls = 'grid-num';
            if (isDone(index)) cls += ' answered';
            if (isTestMode && ans && ans.reviewed) cls += ' reviewed';
            if (!isTestMode && index === currentQIndex) cls += ' current';
            html += `<div class="${cls}" onclick="jumpToQuestion(${index})" title="Question ${index + 1}">${index + 1}</div>`;
        });
        html += `</div></div>`;
    });

    body.innerHTML = html;
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
