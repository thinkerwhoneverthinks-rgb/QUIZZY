// ==================== CUSTOM TEST BUILDER (Cross-File, Lazy-Loaded & Folder Tree) ====================
// Matches the exact native folder & file UI of Question Cafe with instant loading and a persistent selection drawer.

let customTestSelection = {}; // Map of { topicKey: { fileName, fileDisplayName, chapterId, chapterName, topicIdx, topicName, totalQs, count, questions } }
let ctDirectory = [];        // Breadcrumb stack of folder nodes
let ctActiveFile = null;     // { filePath, displayName, data } when inspecting a file's chapters/topics
let ctDrawerOpen = false;    // Drawer modal state for reviewing selected topics

async function showCustomTestBuilder() {
    if (!manifestRoot) {
        showScreen('screenLoading');
        try {
            const resp = await fetch('data/manifest.json');
            manifestRoot = await resp.json();
        } catch (e) {
            console.error('Failed to load manifest for custom test:', e);
            alert('Failed to load manifest: ' + e.message);
            showScreen('screenSubjects');
            return;
        }
    }
    ctDirectory = [];
    ctActiveFile = null;
    ctDrawerOpen = false;
    renderCustomTestBuilder();
    showScreen('screenCustomTest');
    if (typeof pushQuizHistory === 'function') {
        pushQuizHistory({ cafe: 'question', screen: 'screenCustomTest' });
    }
}

function ctCurrentNode() {
    if (ctDirectory.length === 0) return manifestRoot;
    return ctDirectory[ctDirectory.length - 1];
}

function ctEnterFolder(subIndex) {
    const node = ctCurrentNode();
    if (node && node.subsections && node.subsections[subIndex]) {
        ctDirectory.push(node.subsections[subIndex]);
        ctActiveFile = null;
        renderCustomTestBuilder();
    }
}

function ctGoBack() {
    if (ctActiveFile) {
        ctActiveFile = null;
        renderCustomTestBuilder();
        return;
    }
    if (ctDirectory.length > 0) {
        ctDirectory.pop();
        renderCustomTestBuilder();
    } else {
        goToRoot();
    }
}

function ctGoToLevel(i) {
    ctActiveFile = null;
    ctDirectory = ctDirectory.slice(0, i + 1);
    renderCustomTestBuilder();
}

function ctGoToRoot() {
    ctActiveFile = null;
    ctDirectory = [];
    renderCustomTestBuilder();
}

// Lazy-load a single file on-demand for Custom Test
async function ctOpenFile(fileIndex) {
    const node = ctCurrentNode();
    const fileEntry = (node && node.files && node.files[fileIndex]) ? node.files[fileIndex] : null;
    if (!fileEntry) return;

    const filePath = typeof fileEntry === 'object' ? (fileEntry.path || fileEntry.file || '') : fileEntry;
    const fileDisplayName = typeof fileEntry === 'object' ? (fileEntry.displayName || fileEntry.name) : null;
    const cleanFileName = filePath.startsWith('data/') ? filePath.substring(5) : filePath;
    const fallbackName = cleanFileName.split('/').pop().replace(/\.json$/i, '').replace(/[_-]+/g, ' ');
    const displayName = fileDisplayName || fallbackName;

    // Check if already in loaded memory cache
    if (loadedFiles[cleanFileName]) {
        ctActiveFile = {
            filePath: cleanFileName,
            displayName: displayName,
            data: loadedFiles[cleanFileName]
        };
        renderCustomTestBuilder();
        return;
    }

    // Show loading state inline
    const container = document.getElementById('customTestTreeContainer');
    if (container) {
        container.innerHTML = `
            <div style="text-align:center;padding:3rem 1rem;">
                <div class="tc-spinner" style="margin:0 auto 1rem;"></div>
                <div style="font-weight:700;color:var(--text-primary);">Loading ${escapeHtml(displayName)}…</div>
                <div style="font-size:0.85rem;color:var(--text-muted);margin-top:0.35rem;">Fetching question sets</div>
            </div>
        `;
    }

    try {
        let raw = await offlineStorage.getQuizData(cleanFileName);
        if (!raw && navigator.onLine) {
            const fetchUrl = filePath.startsWith('data/') ? filePath : `data/${filePath}`;
            const resp = await fetch(fetchUrl);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            raw = await resp.json();
        }
        if (!raw) throw new Error('File data could not be retrieved.');

        const normalized = normalizeJsonData(raw, cleanFileName);
        loadedFiles[cleanFileName] = normalized;

        ctActiveFile = {
            filePath: cleanFileName,
            displayName: displayName,
            data: normalized
        };
        renderCustomTestBuilder();
    } catch (err) {
        console.error('Failed to open file for custom test:', cleanFileName, err);
        alert('Could not load that file: ' + err.message);
        renderCustomTestBuilder();
    }
}

// Toggle topic selection
function toggleCtTopic(chIdx, topIdx, isChecked) {
    if (!ctActiveFile || !ctActiveFile.data || !ctActiveFile.data.chapters) return;
    const ch = ctActiveFile.data.chapters[chIdx];
    if (!ch || !ch.topics || !ch.topics[topIdx]) return;
    const top = ch.topics[topIdx];
    const topicKey = `${ctActiveFile.filePath}__${ch.id}__${topIdx}`;

    if (isChecked) {
        const totalQs = (top.questions || []).length;
        customTestSelection[topicKey] = {
            fileName: ctActiveFile.filePath,
            fileDisplayName: ctActiveFile.displayName,
            chapterId: ch.id,
            chapterName: ch.name,
            topicIdx,
            topicName: top.topic,
            totalQs: totalQs,
            count: totalQs,
            questions: top.questions || []
        };
    } else {
        delete customTestSelection[topicKey];
    }
    renderCustomTestBuilder();
}

// Toggle all topics in a chapter
function toggleCtChapterAll(chIdx, isChecked) {
    if (!ctActiveFile || !ctActiveFile.data || !ctActiveFile.data.chapters) return;
    const ch = ctActiveFile.data.chapters[chIdx];
    if (!ch) return;
    const topics = ch.topics || [];

    topics.forEach((top, topIdx) => {
        const topicKey = `${ctActiveFile.filePath}__${ch.id}__${topIdx}`;
        const totalQs = (top.questions || []).length;
        if (isChecked) {
            customTestSelection[topicKey] = {
                fileName: ctActiveFile.filePath,
                fileDisplayName: ctActiveFile.displayName,
                chapterId: ch.id,
                chapterName: ch.name,
                topicIdx,
                topicName: top.topic,
                totalQs,
                count: totalQs,
                questions: top.questions || []
            };
        } else {
            delete customTestSelection[topicKey];
        }
    });
    renderCustomTestBuilder();
}

function updateCtTopicCount(topicKey, val, maxCount) {
    let count = parseInt(val, 10);
    if (isNaN(count) || count < 1) count = 1;
    if (count > maxCount) count = maxCount;

    if (customTestSelection[topicKey]) {
        customTestSelection[topicKey].count = count;
    }
    renderCustomTestBuilder();
}

function removeCtSelection(topicKey) {
    delete customTestSelection[topicKey];
    renderCustomTestBuilder();
}

function clearCustomTestSelection() {
    if (Object.keys(customTestSelection).length === 0) return;
    if (!confirm('Clear all selected topics?')) return;
    customTestSelection = {};
    renderCustomTestBuilder();
}

function toggleCtDrawer(force) {
    ctDrawerOpen = typeof force === 'boolean' ? force : !ctDrawerOpen;
    const drawerEl = document.getElementById('ctSelectedDrawer');
    const overlayEl = document.getElementById('ctDrawerOverlay');
    if (drawerEl) drawerEl.classList.toggle('open', ctDrawerOpen);
    if (overlayEl) overlayEl.classList.toggle('open', ctDrawerOpen);
}

// ==================== RENDER CUSTOM TEST BUILDER ====================
function renderCustomTestBuilder() {
    const container = document.getElementById('customTestTreeContainer');
    if (!container) return;

    const selectedKeys = Object.keys(customTestSelection);
    const selectedCount = selectedKeys.length;
    let totalQuestionsCount = 0;
    selectedKeys.forEach(k => {
        totalQuestionsCount += customTestSelection[k].count || 0;
    });

    let html = '';

    // Top Navigation Breadcrumbs Bar
    html += `
        <div class="breadcrumb-bar" style="margin-bottom:1.25rem;">
            <button class="breadcrumb-back" onclick="ctGoBack()">← Back</button>
            <div class="breadcrumb-path">
                <span class="breadcrumb-item" onclick="ctGoToRoot()">🏠 Home</span>
                ${ctDirectory.map((dir, i) => `
                    <span class="breadcrumb-sep">›</span>
                    <span class="breadcrumb-item ${(!ctActiveFile && i === ctDirectory.length - 1) ? 'active' : ''}" 
                          onclick="ctGoToLevel(${i})">${escapeHtml(dir.displayName || dir.name || 'Folder')}</span>
                `).join('')}
                ${ctActiveFile ? `
                    <span class="breadcrumb-sep">›</span>
                    <span class="breadcrumb-item active">📄 ${escapeHtml(ctActiveFile.displayName)}</span>
                ` : ''}
            </div>
        </div>
    `;

    // View: File Content (Chapters & Topics) OR Folder View (Subsections & Files)
    if (ctActiveFile) {
        // Render Chapters & Topics inside the selected file
        const data = ctActiveFile.data;
        const chapters = data.chapters || [];

        html += `
            <div style="margin-bottom:1.5rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
                    <div>
                        <h2 style="font-size:1.3rem;font-weight:800;color:var(--text-primary);margin-bottom:0.25rem;">
                            📄 ${escapeHtml(ctActiveFile.displayName)}
                        </h2>
                        <div style="font-size:0.85rem;color:var(--text-muted);">
                            ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''} available. Check topics to include in your custom test.
                        </div>
                    </div>
                    <button class="btn btn-ghost btn-sm" onclick="ctGoBack()">← Back to Folders</button>
                </div>
                <div class="ct-chapters-grid">
        `;

        if (chapters.length === 0) {
            html += `<p style="color:var(--text-muted);padding:2rem;text-align:center;">No chapters found in this file.</p>`;
        } else {
            chapters.forEach((ch, chIdx) => {
                const topics = ch.topics || [];
                const totalChQs = topics.reduce((sum, t) => sum + (t.questions || []).length, 0);
                const allSelected = topics.length > 0 && topics.every((_, topIdx) => !!customTestSelection[`${ctActiveFile.filePath}__${ch.id}__${topIdx}`]);
                const anySelected = topics.some((_, topIdx) => !!customTestSelection[`${ctActiveFile.filePath}__${ch.id}__${topIdx}`]);

                html += `
                    <div class="ct-chapter-card" style="border:1.5px solid ${anySelected ? 'var(--accent)' : 'var(--border)'};">
                        <div class="ct-chapter-card-head" style="background:${anySelected ? 'rgba(0,212,170,0.06)' : 'var(--bg-card)'};">
                            <div class="ct-chapter-info">
                                <input type="checkbox" ${allSelected ? 'checked' : ''} 
                                       onclick="event.stopPropagation(); toggleCtChapterAll(${chIdx}, this.checked)">
                                <div>
                                    <div class="ct-chap-title">${ch.icon || '📘'} ${escapeHtml(ch.name || 'Chapter')}</div>
                                    <div style="display:flex;gap:0.4rem;align-items:center;margin-top:0.25rem;">
                                        <span class="ct-chap-meta-badge">📑 ${topics.length} Topics · ${totalChQs} Qs</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="ct-topics-list open" style="padding:0.75rem;">
                `;

                topics.forEach((top, topIdx) => {
                    const topicKey = `${ctActiveFile.filePath}__${ch.id}__${topIdx}`;
                    const selItem = customTestSelection[topicKey];
                    const isChecked = !!selItem;
                    const totalQs = (top.questions || []).length;
                    const countVal = selItem ? selItem.count : totalQs;

                    html += `
                        <div class="ct-topic-row ${isChecked ? 'selected' : ''}">
                            <div class="ct-topic-info">
                                <input type="checkbox" ${isChecked ? 'checked' : ''}
                                       onchange="toggleCtTopic(${chIdx}, ${topIdx}, this.checked)">
                                <span>${escapeHtml(top.topic || `Topic ${topIdx + 1}`)}</span>
                                <span style="font-size:0.75rem;color:var(--text-muted);font-weight:600;margin-left:auto;">(${totalQs} Qs)</span>
                            </div>
                            ${isChecked ? `
                                <div class="ct-topic-count-wrap" style="margin-left:0.75rem;">
                                    <span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;">Take</span>
                                    <input type="number" min="1" max="${totalQs}" value="${countVal}"
                                           onchange="updateCtTopicCount('${escapeHtmlAttr(topicKey)}', this.value, ${totalQs})">
                                    <span style="font-size:0.75rem;color:var(--text-muted);">/ ${totalQs}</span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            });
        }

        html += `
                </div>
            </div>
        `;

    } else {
        // Folder View (Subsections & Files) matching Question Cafe
        const node = ctCurrentNode();
        const subsections = node.subsections || [];
        const files = node.files || [];

        html += `
            <div style="margin-bottom:1.5rem;">
                <div class="subject-grid">
        `;

        if (subsections.length === 0 && files.length === 0) {
            html += `<p style="color:var(--text-muted);padding:2rem;text-align:center;grid-column:1/-1;">No items in this section.</p>`;
        }

        // Render Folders
        subsections.forEach((sub, subIdx) => {
            const folderName = sub.displayName || sub.name || 'Folder';
            const count = countItems(sub);

            html += `
                <div class="subject-rect folder-card" onclick="ctEnterFolder(${subIdx})">
                    <div class="rect-emoji">${sub.icon || '📁'}</div>
                    <div class="rect-info" style="flex:1;">
                        <div class="rect-name">${escapeHtml(folderName)}</div>
                        <div class="rect-meta">${count} item${count !== 1 ? 's' : ''}</div>
                    </div>
                    <div style="color:var(--text-muted);font-size:1.1rem;font-weight:700;">›</div>
                </div>
            `;
        });

        // Render Files
        files.forEach((file, fileIdx) => {
            const filePath = typeof file === 'object' ? (file.path || file.file || '') : file;
            const fileDisplayName = typeof file === 'object' ? (file.displayName || file.name) : null;
            const cleanFileName = filePath.startsWith('data/') ? filePath.substring(5) : filePath;
            const fallbackName = cleanFileName.split('/').pop().replace(/\.json$/i, '').replace(/[_-]+/g, ' ');
            const displayName = fileDisplayName || fallbackName;

            // Check if any topics are selected in this file
            const fileSelectedCount = Object.keys(customTestSelection).filter(k => k.startsWith(`${cleanFileName}__`)).length;

            html += `
                <div class="chapter-row file-card" onclick="ctOpenFile(${fileIdx})" style="cursor:pointer;">
                    <div class="chapter-icon">📄</div>
                    <div class="chapter-info" style="flex:1;">
                        <div class="chapter-title" style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                            ${escapeHtml(displayName)}
                            ${fileSelectedCount > 0 ? `
                                <span style="background:var(--accent);color:#000;font-size:0.75rem;font-weight:800;padding:0.15rem 0.5rem;border-radius:12px;">
                                    ✓ ${fileSelectedCount} selected
                                </span>` : ''}
                        </div>
                        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">Tap to choose chapters &amp; topics</div>
                    </div>
                    <div style="color:var(--text-muted);font-size:1.1rem;font-weight:700;">›</div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    // Selected Drawer Modal & Floating Bar HTML
    html += `
        <!-- Floating Selected Summary Bar -->
        <div class="ct-floating-bar" id="ctFloatingBar">
            <div class="ct-float-info">
                <div class="ct-float-count">
                    ${selectedCount > 0 ? `🎯 ${selectedCount} Topic${selectedCount !== 1 ? 's' : ''} (${totalQuestionsCount} Qs)` : 'No topics selected yet'}
                </div>
                <div class="ct-float-sub">
                    ${selectedCount > 0 ? 'Click View Selected to adjust counts or start' : 'Browse folders & select topics'}
                </div>
            </div>
            <div class="ct-float-actions">
                ${selectedCount > 0 ? `
                    <button class="btn btn-ghost btn-sm" onclick="toggleCtDrawer(true)">
                        📋 View Selected (${selectedCount})
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="startCustomTest()">
                        🚀 Start Test →
                    </button>
                ` : `
                    <button class="btn btn-ghost btn-sm" disabled style="opacity:0.5;">
                        Select Topics Above
                    </button>
                `}
            </div>
        </div>

        <!-- Selected Topics Slide-up Drawer Overlay -->
        <div class="ct-drawer-overlay ${ctDrawerOpen ? 'open' : ''}" id="ctDrawerOverlay" onclick="toggleCtDrawer(false)"></div>

        <!-- Selected Topics Slide-up Drawer Modal -->
        <div class="ct-selected-drawer ${ctDrawerOpen ? 'open' : ''}" id="ctSelectedDrawer">
            <div class="ct-drawer-head">
                <div>
                    <div class="ct-drawer-title">📋 Selected Topics (${selectedCount})</div>
                    <div class="ct-drawer-sub">Total ${totalQuestionsCount} questions selected across all folders</div>
                </div>
                <button class="menu-close" onclick="toggleCtDrawer(false)" aria-label="Close">✕</button>
            </div>

            <div class="ct-drawer-body">
                ${selectedCount === 0 ? `
                    <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
                        <div style="font-size:2rem;margin-bottom:0.5rem;">📂</div>
                        <div style="font-weight:700;font-size:1rem;color:var(--text-primary);margin-bottom:0.25rem;">No topics selected</div>
                        <div style="font-size:0.85rem;">Open any quiz file and check topics to add them here.</div>
                    </div>
                ` : `
                    <div class="ct-selected-list">
                        ${selectedKeys.map(k => {
                            const item = customTestSelection[k];
                            return `
                                <div class="ct-selected-item">
                                    <div class="ct-selected-item-info">
                                        <div class="ct-selected-item-title">${escapeHtml(item.topicName)}</div>
                                        <div class="ct-selected-item-meta">
                                            <span>${escapeHtml(item.fileDisplayName)}</span> · <span>${escapeHtml(item.chapterName)}</span>
                                        </div>
                                    </div>
                                    <div class="ct-selected-item-ctrls">
                                        <label style="font-size:0.78rem;color:var(--text-muted);font-weight:700;">Take</label>
                                        <input type="number" min="1" max="${item.totalQs}" value="${item.count}"
                                               onchange="updateCtTopicCount('${escapeHtmlAttr(k)}', this.value, ${item.totalQs})">
                                        <span style="font-size:0.78rem;color:var(--text-muted);">/ ${item.totalQs}</span>
                                        <button class="ct-remove-btn" onclick="removeCtSelection('${escapeHtmlAttr(k)}')" title="Remove">✕</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>

            <div class="ct-drawer-foot">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                        <label style="font-weight:700;font-size:0.9rem;color:var(--text-primary);">⏱️ Duration:</label>
                        <input type="number" id="ctDrawerTimerInput" min="1" value="30" style="width:70px;text-align:center;padding:0.4rem;font-weight:700;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary);">
                        <span style="font-size:0.85rem;color:var(--text-muted);">min</span>
                    </div>
                    ${selectedCount > 0 ? `
                        <button class="btn btn-ghost btn-sm" onclick="clearCustomTestSelection()" style="color:var(--error, #ef4444);">
                            🗑️ Clear All
                        </button>
                    ` : ''}
                </div>
                <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                    <button class="btn btn-ghost" onclick="toggleCtDrawer(false)">Keep Browsing</button>
                    <button class="btn btn-primary" id="btnDrawerDownload" onclick="downloadCustomTestForOffline(this)" ${selectedCount === 0 ? 'disabled' : ''}>
                        ⬇️ Save Offline
                    </button>
                    <button class="btn btn-primary" id="btnDrawerStart" onclick="startCustomTest()" ${selectedCount === 0 ? 'disabled' : ''}>
                        🚀 Start Test (${totalQuestionsCount} Qs) →
                    </button>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Sync Bottom Actions on screenCustomTest if present
    const summaryTextEl = document.getElementById('ctSummaryText');
    if (summaryTextEl) {
        summaryTextEl.textContent = selectedCount > 0 
            ? `Selected ${selectedCount} topics (${totalQuestionsCount} questions)` 
            : 'Select at least one topic';
    }

    const startBtn = document.getElementById('btnStartCustomTest');
    if (startBtn) startBtn.disabled = selectedCount === 0;

    const downloadBtn = document.getElementById('btnDownloadCustomTest');
    if (downloadBtn) downloadBtn.disabled = selectedCount === 0;
}

// ==================== START & DOWNLOAD CUSTOM TEST ====================
function buildCustomTestQuestions() {
    let allQs = [];

    Object.values(customTestSelection).forEach(item => {
        const takeCount = Math.min(item.count, (item.questions || []).length);
        const shuffled = typeof shuffleArray === 'function' ? shuffleArray([...item.questions]) : [...item.questions];
        shuffled.slice(0, takeCount).forEach(q => {
            allQs.push({
                ...q,
                type: q.type || 'mcq',
                topicName: item.topicName,
                chapterName: item.chapterName,
                fileDisplayName: item.fileDisplayName
            });
        });
    });

    // Shuffle all questions together
    return typeof shuffleArray === 'function' ? shuffleArray(allQs) : allQs;
}

function startCustomTest() {
    const testQuestions = buildCustomTestQuestions();
    if (testQuestions.length === 0) {
        alert('Please select at least one topic with questions.');
        return;
    }

    // Read custom timer limit from drawer or main input
    const drawerTimer = document.getElementById('ctDrawerTimerInput');
    const mainTimer = document.getElementById('ctTimerInput');
    let minutes = 30;
    if (drawerTimer && drawerTimer.value) minutes = parseInt(drawerTimer.value, 10);
    else if (mainTimer && mainTimer.value) minutes = parseInt(mainTimer.value, 10);

    testTimeLimit = Math.max(1, isNaN(minutes) ? 30 : minutes) * 60;

    // Set up test mode state
    questions = testQuestions;
    userAnswers = {};
    currentChapter = { name: `Custom Test (${Object.keys(customTestSelection).length} topics)` };
    currentMode = 'test';
    testStartTime = Date.now();

    toggleCtDrawer(false);
    showScreen('screenTestMode');   // show first so render lands on a visible screen
    renderTestMode();
    startTestTimer();
}

async function downloadCustomTestForOffline(btnElement) {
    const selectedValues = Object.values(customTestSelection);
    if (selectedValues.length === 0) return;

    const originalText = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = '⏳ Downloading...';

    // Collect all image URLs from selected topics
    const imageToCache = [];
    selectedValues.forEach(item => {
        (item.questions || []).forEach(q => {
            if (q.image_url) imageToCache.push(q.image_url);
            if (Array.isArray(q.images)) q.images.forEach(u => imageToCache.push(u));
        });
    });

    const total = imageToCache.length;
    let done = 0;

    for (const url of imageToCache) {
        try {
            const cached = await offlineStorage.isImageCached(url);
            if (!cached && navigator.onLine) {
                const resp = await fetch(url);
                if (resp.ok) {
                    const blob = await resp.blob();
                    await offlineStorage.saveImage(url, blob);
                }
            }
        } catch (e) {
            console.warn('Failed caching image for custom test:', url, e);
        }
        done++;
        btnElement.innerHTML = `⏳ ${Math.round((done / Math.max(total, 1)) * 100)}%`;
    }

    // Save test configuration to IndexedDB
    const testConfig = {
        id: `custom_test_${Date.now()}`,
        name: `Custom Test (${selectedValues.length} topics)`,
        createdAt: Date.now(),
        topics: selectedValues.map(v => ({
            fileName: v.fileName,
            fileDisplayName: v.fileDisplayName,
            chapterId: v.chapterId,
            topicName: v.topicName,
            count: v.count
        }))
    };
    await offlineStorage.saveCustomTest(testConfig);

    btnElement.innerHTML = '✅ Saved Offline!';
    btnElement.classList.add('downloaded');
    setTimeout(() => {
        btnElement.innerHTML = originalText;
        btnElement.disabled = false;
        btnElement.classList.remove('downloaded');
    }, 3000);
}
