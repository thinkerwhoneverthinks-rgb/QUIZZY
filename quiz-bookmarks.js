// ==================== BOOKMARK SYSTEM (INFINITE FOLDER TREE) ====================
const DIRECT_BOOKMARK_KEY = '__direct__';
const BOOKMARK_STORAGE_KEY = 'studycafe-bookmarks';

function createEmptyBookmarkNode() {
    return { folders: {}, bookmarks: [] };
}

/* Normalizes any bookmark store (legacy 2-level section/subsection OR v2 recursive tree)
   into the canonical recursive tree:
   { __tree__: 1, folders: { [name]: { folders: {}, bookmarks: [...] } }, bookmarks: [] } */
function normalizeBookmarkNode(node) {
    const out = createEmptyBookmarkNode();
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node.bookmarks)) {
        out.bookmarks = node.bookmarks.filter(Boolean);
    }
    if (node.folders && typeof node.folders === 'object') {
        Object.keys(node.folders).forEach(name => {
            if (!name) return;
            out.folders[name] = normalizeBookmarkNode(node.folders[name]);
        });
    }
    return out;
}

function normalizeBookmarkStore(raw) {
    const root = { __tree__: 1, folders: {}, bookmarks: [] };
    if (!raw || typeof raw !== 'object') return root;

    // Already v2 tree
    if (raw.__tree__ === 1 && raw.folders && typeof raw.folders === 'object') {
        const norm = normalizeBookmarkNode(raw);
        root.folders = norm.folders;
        root.bookmarks = norm.bookmarks;
        return root;
    }

    // Legacy 2-level { section: { subsection: [...], __direct__: [...] } } or { section: [...] }
    Object.keys(raw).forEach(sec => {
        if (sec === '__tree__') return;
        const val = raw[sec];
        if (!val) return;
        const secNode = createEmptyBookmarkNode();
        if (Array.isArray(val)) {
            secNode.bookmarks = val.filter(Boolean);
        } else if (typeof val === 'object') {
            Object.keys(val).forEach(sub => {
                const subVal = val[sub];
                if (sub === DIRECT_BOOKMARK_KEY) {
                    if (Array.isArray(subVal)) {
                        secNode.bookmarks = secNode.bookmarks.concat(subVal.filter(Boolean));
                    } else if (subVal && typeof subVal === 'object') {
                        secNode.bookmarks.push(subVal);
                    }
                } else {
                    const subNode = createEmptyBookmarkNode();
                    if (Array.isArray(subVal)) {
                        subNode.bookmarks = subVal.filter(Boolean);
                    } else if (subVal && typeof subVal === 'object') {
                        subNode.bookmarks = [subVal];
                    }
                    secNode.folders[sub] = subNode;
                }
            });
        }
        root.folders[sec] = secNode;
    });

    return root;
}

function getBookmarks() {
    try {
        const parsed = JSON.parse(localStorage.getItem(BOOKMARK_STORAGE_KEY) || '{}');
        return normalizeBookmarkStore(parsed);
    } catch (e) {
        return { __tree__: 1, folders: {}, bookmarks: [] };
    }
}

function saveBookmarks(tree) {
    const norm = normalizeBookmarkStore(tree);
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(norm));
}

function getBookmarkNodeAtPath(tree, pathArr) {
    let curr = tree;
    if (!Array.isArray(pathArr)) return curr;
    for (let i = 0; i < pathArr.length; i++) {
        const seg = pathArr[i];
        if (!curr || !curr.folders || !curr.folders[seg]) return null;
        curr = curr.folders[seg];
    }
    return curr;
}

function ensureBookmarkNodeAtPath(tree, pathArr) {
    let curr = tree;
    if (!Array.isArray(pathArr)) return curr;
    for (let i = 0; i < pathArr.length; i++) {
        const seg = pathArr[i];
        if (!curr.folders) curr.folders = {};
        if (!curr.folders[seg]) curr.folders[seg] = createEmptyBookmarkNode();
        curr = curr.folders[seg];
    }
    return curr;
}

function countNodeBookmarks(node) {
    if (!node || typeof node !== 'object') return 0;
    let total = Array.isArray(node.bookmarks) ? node.bookmarks.length : 0;
    if (node.folders && typeof node.folders === 'object') {
        Object.keys(node.folders).forEach(k => {
            total += countNodeBookmarks(node.folders[k]);
        });
    }
    return total;
}

/* Entries are objects ({key, chapter, ...}); older data may hold bare strings,
   so accept both rather than comparing an object against a string. */
function bookmarkKeyOf(entry) {
    if (typeof entry === 'string') return entry;
    return entry && entry.key ? entry.key : null;
}

function nodeContainsBookmarkKey(node, key) {
    if (!node || !key) return false;
    if (Array.isArray(node.bookmarks) && node.bookmarks.some(b => bookmarkKeyOf(b) === key)) {
        return true;
    }
    if (node.folders && typeof node.folders === 'object') {
        for (const name in node.folders) {
            if (nodeContainsBookmarkKey(node.folders[name], key)) return true;
        }
    }
    return false;
}

function isQuestionBookmarked(chapterId, qIndex) {
    const tree = getBookmarks();
    const key = `${chapterId}_q${qIndex}`;
    return nodeContainsBookmarkKey(tree, key);
}

function removeBookmarkKeyFromSubtree(node, key) {
    if (!node || typeof node !== 'object') return false;
    let removed = false;
    if (Array.isArray(node.bookmarks)) {
        const before = node.bookmarks.length;
        node.bookmarks = node.bookmarks.filter(b => bookmarkKeyOf(b) !== key);
        if (node.bookmarks.length !== before) removed = true;
    }
    if (node.folders && typeof node.folders === 'object') {
        Object.keys(node.folders).forEach(name => {
            if (removeBookmarkKeyFromSubtree(node.folders[name], key)) removed = true;
        });
    }
    return removed;
}

/* Used by the bookmark-practice card's bookmark button (buildQuestionCardInner)
   to remove a question from the folder it's currently being practiced from,
   rather than reopening the folder-picker panel. */
function removeFromBookmarkFolder(idx) {
    const q = questions[idx];
    if (!q || !q.bookmarkKey) return;
    if (!confirm('Remove this question from your bookmarks?')) return;

    const tree = getBookmarks();
    if (Array.isArray(q.bookmarkPath) && q.bookmarkPath.length > 0) {
        const node = getBookmarkNodeAtPath(tree, q.bookmarkPath);
        if (node && Array.isArray(node.bookmarks)) {
            node.bookmarks = node.bookmarks.filter(b => bookmarkKeyOf(b) !== q.bookmarkKey);
        }
    } else if (q.bookmarkSection) {
        const path = q.bookmarkSubsection && q.bookmarkSubsection !== DIRECT_BOOKMARK_KEY
            ? [q.bookmarkSection, q.bookmarkSubsection]
            : [q.bookmarkSection];
        const node = getBookmarkNodeAtPath(tree, path);
        if (node && Array.isArray(node.bookmarks)) {
            node.bookmarks = node.bookmarks.filter(b => bookmarkKeyOf(b) !== q.bookmarkKey);
        }
    } else {
        removeBookmarkKeyFromSubtree(tree, q.bookmarkKey);
    }
    saveBookmarks(tree);

    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
        if (activeScreen.id === 'screenQuiz') renderQuestion();
        else if (activeScreen.id === 'screenFullQuiz') renderFullQuiz();
    }
    if (typeof renderQuestionGrid === 'function') renderQuestionGrid();
}

/* `questions` can be a shuffled/filtered array (Test Mode, Custom Test), so a raw
   index into it isn't a stable position. `topics` is only ever rebuilt from the
   source JSON and never shuffled, so match against it to find the question's real
   position within the chapter — that's what stays valid regardless of which mode
   the bookmark was saved from. Prefer matching by `id` (normalizeFlatQuestion gives
   every question a unique one): many datasets are image-only MCQs whose `question`
   text is blank for every entry, so text+topic matching alone would collapse every
   question in a topic onto the first one. Fall back to text+topic for older/raw
   data shapes that don't carry an id. */
function getCanonicalPosition(qIndexInQuestions) {
    const q = questions[qIndexInQuestions];
    if (!q || typeof topics === 'undefined' || !Array.isArray(topics)) return qIndexInQuestions;
    let pos = 0;
    for (const t of topics) {
        const list = t.questions || [];
        for (let i = 0; i < list.length; i++) {
            const candidate = list[i];
            const isMatch = q.id
                ? candidate.id === q.id
                : (candidate.question === q.question && t.topic === q.topicName);
            if (isMatch) {
                return pos;
            }
            pos++;
        }
    }
    return qIndexInQuestions;
}

function findManifestFileMeta(node, targetPath, trail) {
    if (!node || !targetPath) return null;
    const nodeName = node.displayName || node.name || '';
    const curTrail = (trail || []).concat(nodeName && nodeName !== 'Quizzy' ? [nodeName] : []);
    if (Array.isArray(node.files)) {
        for (const f of node.files) {
            const p = typeof f === 'object' ? (f.path || f.file || '') : f;
            if (p === targetPath) {
                const baseName = p.split('/').pop().split('\\').pop().replace(/\.json$/i, '').replace(/[_-]+/g, ' ').trim();
                const title = (typeof f === 'object' && (f.displayName || f.name)) || baseName;
                return { title, trail: curTrail };
            }
        }
    }
    if (Array.isArray(node.subsections)) {
        for (const sub of node.subsections) {
            const found = findManifestFileMeta(sub, targetPath, curTrail);
            if (found) return found;
        }
    }
    return null;
}

function resolveCurrentSourceLabel() {
    const chapName = (typeof currentChapter !== 'undefined' && currentChapter && currentChapter.name)
        ? currentChapter.name.trim().toLowerCase()
        : '';

    if (typeof manifestRoot !== 'undefined' && manifestRoot && currentFileName) {
        const meta = findManifestFileMeta(manifestRoot, currentFileName, []);
        if (meta) {
            if (meta.title && meta.title.trim().toLowerCase() !== chapName) {
                return meta.title;
            }
            if (Array.isArray(meta.trail) && meta.trail.length > 0) {
                const cleanTrail = meta.trail
                    .map(t => String(t).replace(/^[^\w\d(]+/, '').trim())
                    .filter(Boolean);
                if (cleanTrail.length > 0) {
                    return cleanTrail.slice(-2).join(' · ');
                }
            }
        }
    }
    if (typeof subjectData !== 'undefined' && subjectData && (subjectData.displayName || subjectData.name)) {
        const sName = subjectData.displayName || subjectData.name;
        if (sName.trim().toLowerCase() !== chapName) return sName;
    }
    if (typeof currentDirectory !== 'undefined' && Array.isArray(currentDirectory) && currentDirectory.length > 0) {
        const cleanDir = currentDirectory
            .map(d => String(d.displayName || d.name || '').replace(/^[^\w\d(]+/, '').trim())
            .filter(Boolean);
        if (cleanDir.length > 0) return cleanDir.slice(-2).join(' · ');
    }
    if (currentFileName) {
        return currentFileName.split('/').pop().split('\\').pop().replace(/\.json$/i, '').replace(/[_-]+/g, ' ').trim();
    }
    return '';
}

function toggleBookmark(qIndex) {
    currentBookmarkQuestion = qIndex;
    openBookmarkPanel();
}

let currentBookmarkQuestion = null;
let bookmarkPanelPath = [];

function openBookmarkPanel() {
    const panel = document.getElementById('bookmarkPanel');
    const overlay = document.getElementById('bookmarkOverlay');
    // Keep current path valid if folders were deleted elsewhere
    const tree = getBookmarks();
    if (!getBookmarkNodeAtPath(tree, bookmarkPanelPath)) {
        bookmarkPanelPath = [];
    }
    renderBookmarkPanel();
    panel.classList.add('active');
    overlay.classList.add('active');
}

function closeBookmarkPanel() {
    document.getElementById('bookmarkPanel').classList.remove('active');
    document.getElementById('bookmarkOverlay').classList.remove('active');
}

function renderBookmarkPanel() {
    const body = document.getElementById('bookmarkPanelBody');
    const panel = document.getElementById('bookmarkPanel');
    if (!body) return;

    const tree = getBookmarks();
    let currentNode = getBookmarkNodeAtPath(tree, bookmarkPanelPath);
    if (!currentNode) {
        bookmarkPanelPath = [];
        currentNode = tree;
    }

    const folderNames = Object.keys(currentNode.folders || {});
    const directCount = Array.isArray(currentNode.bookmarks) ? currentNode.bookmarks.length : 0;

    // Update Save button state & label in footer
    if (panel) {
        const saveBtn = panel.querySelector('.bookmark-actions .btn-primary');
        if (saveBtn) {
            if (bookmarkPanelPath.length > 0) {
                const targetName = bookmarkPanelPath[bookmarkPanelPath.length - 1];
                saveBtn.disabled = false;
                saveBtn.textContent = `Save in "${targetName.length > 18 ? targetName.slice(0, 17) + '…' : targetName}"`;
            } else {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Select or Create Folder';
            }
        }
    }

    const breadcrumbHtml = `
        <div class="bm-panel-crumb">
            <span class="bm-crumb-item ${bookmarkPanelPath.length === 0 ? 'active' : ''}" onclick="bmPanelGoTo(-1)">🏠 Folders</span>
            ${bookmarkPanelPath.map((seg, i) => `
                <span class="bm-crumb-sep">›</span>
                <span class="bm-crumb-item ${i === bookmarkPanelPath.length - 1 ? 'active' : ''}" onclick="bmPanelGoTo(${i})">${escapeHtml(seg)}</span>
            `).join('')}
        </div>
    `;

    const destinationHtml = bookmarkPanelPath.length > 0 ? `
        <div class="bm-panel-dest">
            <span>📌 Saving to: <strong>${escapeHtml(bookmarkPanelPath.join(' › '))}</strong></span>
            ${directCount > 0 ? `<span class="bm-dest-count">${directCount} saved</span>` : ''}
        </div>
    ` : `
        <div class="bm-panel-hint">
            Choose a folder or create a new one below. You can nest folders as deep as you like.
        </div>
    `;

    const listHtml = folderNames.length > 0 ? `
        <div class="bm-panel-list">
            ${folderNames.map((name, idx) => {
                const child = currentNode.folders[name];
                const subCount = Object.keys(child.folders || {}).length;
                const qCount = countNodeBookmarks(child);
                const metaParts = [];
                if (subCount > 0) metaParts.push(`${subCount} folder${subCount !== 1 ? 's' : ''}`);
                if (qCount > 0) metaParts.push(`${qCount} Q${qCount !== 1 ? 's' : ''}`);
                const metaText = metaParts.length > 0 ? metaParts.join(' · ') : 'Empty';
                return `
                    <div class="bm-panel-folder-row" onclick="bmPanelEnterFolder(${idx})">
                        <span class="bm-panel-folder-ico">📁</span>
                        <div class="bm-panel-folder-info">
                            <div class="bm-panel-folder-name">${escapeHtml(name)}</div>
                            <div class="bm-panel-folder-meta">${metaText}</div>
                        </div>
                        <span class="bm-panel-folder-arrow">›</span>
                    </div>
                `;
            }).join('')}
        </div>
    ` : `
        <div class="bookmark-empty" style="padding:1rem 0.5rem;">
            <p>${bookmarkPanelPath.length === 0 ? 'No folders yet. Create one below to get started.' : 'No subfolders inside this folder yet.'}</p>
        </div>
    `;

    const createLabel = bookmarkPanelPath.length === 0 ? 'New folder name...' : `New subfolder in "${bookmarkPanelPath[bookmarkPanelPath.length - 1]}"...`;

    body.innerHTML = `
        ${breadcrumbHtml}
        ${destinationHtml}
        ${listHtml}
        <div style="border-top:1px solid var(--border);padding-top:0.85rem;margin-top:0.75rem;">
            <input type="text" class="bookmark-input" id="newBmFolderInput" placeholder="${escapeHtml(createLabel)}"
                   onkeydown="if(event.key==='Enter'){event.preventDefault();createBookmarkFolderInPanel();}">
            <button type="button" class="btn btn-ghost" style="width:100%;" onclick="createBookmarkFolderInPanel()">+ Create Folder</button>
        </div>
    `;
}

function bmPanelGoTo(levelIndex) {
    if (levelIndex < 0) {
        bookmarkPanelPath = [];
    } else {
        bookmarkPanelPath = bookmarkPanelPath.slice(0, levelIndex + 1);
    }
    renderBookmarkPanel();
}

function bmPanelEnterFolder(idx) {
    const tree = getBookmarks();
    const currentNode = getBookmarkNodeAtPath(tree, bookmarkPanelPath);
    if (!currentNode || !currentNode.folders) return;
    const names = Object.keys(currentNode.folders);
    const name = names[idx];
    if (!name) return;
    bookmarkPanelPath.push(name);
    renderBookmarkPanel();
}

function createBookmarkFolderInPanel() {
    const input = document.getElementById('newBmFolderInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    const tree = getBookmarks();
    const currentNode = ensureBookmarkNodeAtPath(tree, bookmarkPanelPath);
    if (!currentNode.folders[name]) {
        currentNode.folders[name] = createEmptyBookmarkNode();
        saveBookmarks(tree);
    }
    // Automatically step into the created folder so saving or nesting deeper is 1 click
    bookmarkPanelPath.push(name);
    renderBookmarkPanel();
}

function saveBookmark() {
    if (bookmarkPanelPath.length === 0 || currentBookmarkQuestion === null) {
        alert('Please select or create a folder first.');
        return;
    }

    const tree = getBookmarks();
    const targetNode = ensureBookmarkNodeAtPath(tree, bookmarkPanelPath);

    // Resolve to the question's stable position in the chapter, not its (possibly
    // shuffled) index in the live `questions` array — see getCanonicalPosition().
    const canonicalIndex = getCanonicalPosition(currentBookmarkQuestion);
    const key = `${currentChapter.id}_q${canonicalIndex}`;
    const q = questions[currentBookmarkQuestion];
    const sourceLabel = resolveCurrentSourceLabel();

    // Store a full snapshot of the question (not just its text) so a bookmark can be
    // re-rendered standalone, without depending on the source chapter being loaded.
    const bookmarkData = {
        key: key,
        file: currentFileName || '',
        source: sourceLabel,
        chapter: currentChapter.name,
        chapterId: currentChapter.id,
        question: q.question || '',
        topic: q.topicName || '',
        type: q.type || 'fill_blank',
        index: canonicalIndex,
        originalNumber: canonicalIndex + 1,
        options: q.options,
        optionImages: q.optionImages,
        images: q.images,
        correct: q.correct,
        answer: q.answer,
        explanation: q.explanation,
        explanation_image: q.explanation_image,
        explanation_images: q.explanation_images,
        image_url: q.image_url,
        matchLists: q.matchLists,
        passage: q.passage,
        video: q.video,
        exam_name: q.exam_name,
        exam_type: q.exam_type,
        exam_reference: q.exam_reference,
        translations: q.translations,
        date: new Date().toISOString()
    };

    if (!Array.isArray(targetNode.bookmarks)) targetNode.bookmarks = [];
    if (!targetNode.bookmarks.some(b => bookmarkKeyOf(b) === key)) {
        targetNode.bookmarks.push(bookmarkData);
        saveBookmarks(tree);
    }

    closeBookmarkPanel();

    // Re-render current question to show bookmark state
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
        if (activeScreen.id === 'screenQuiz') renderQuestion();
        else if (activeScreen.id === 'screenFullQuiz') renderFullQuiz();
    }
    if (typeof renderQuestionGrid === 'function') renderQuestionGrid();
}

function toggleReview(idx) {
    if (!userAnswers[idx]) userAnswers[idx] = {};
    userAnswers[idx].reviewed = !userAnswers[idx].reviewed;

    // Update the review button appearance
    const btn = document.querySelector(`#testQ-${idx} .review-btn`);
    if (btn) {
        const isReviewed = userAnswers[idx].reviewed;
        btn.classList.toggle('active', isReviewed);
        btn.innerHTML = `🚩 ${isReviewed ? 'Reviewed' : 'Review'}`;
    }
}
