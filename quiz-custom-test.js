// ==================== CUSTOM TEST BUILDER (Cross-File & Offline) ====================
let customTestSelection = {}; // Map of { file_chapter_topicId: { file, chapter, topic, totalQs, count } }
let allManifestNodes = []; // Flattened or cached manifest files

async function showCustomTestBuilder() {
    showScreen('screenLoading');
    try {
        await loadAllManifestFiles();
        renderCustomTestBuilder();
        showScreen('screenCustomTest');
    } catch (e) {
        console.error('Failed to load custom test builder:', e);
        alert('Failed to load manifest or question files: ' + e.message);
        showScreen('screenSubjects');
    }
}

// Traverse manifest to find all JSON files
async function loadAllManifestFiles() {
    if (!manifestRoot) {
        const response = await fetch('data/manifest.json');
        manifestRoot = await response.json();
    }
    
    // Extract all file paths recursively
    const fileList = [];
    function collectFiles(node, currentPath = []) {
        if (node.files) {
            node.files.forEach(f => fileList.push({ file: f, path: [...currentPath, node.name || ''] }));
        }
        if (node.subsections) {
            node.subsections.forEach(sub => collectFiles(sub, [...currentPath, node.name || sub.name]));
        }
    }
    collectFiles(manifestRoot);

    // Pre-load / load from cache all file data
    for (const item of fileList) {
        const fileName = item.file;
        if (!loadedFiles[fileName]) {
            try {
                // Try IndexedDB first
                let data = await offlineStorage.getQuizData(fileName);
                if (!data && navigator.onLine) {
                    const resp = await fetch(`data/${fileName}`);
                    const raw = await resp.json();
                    data = normalizeJsonData(raw, fileName);
                }
                if (data) {
                    loadedFiles[fileName] = data;
                }
            } catch (err) {
                console.warn('Failed loading file for custom test:', fileName, err);
            }
        }
    }
}

function renderCustomTestBuilder() {
    const container = document.getElementById('customTestTreeContainer');
    if (!container) return;

    if (Object.keys(loadedFiles).length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:1rem;">No question files found in manifest.</p>';
        return;
    }

    let html = '';

    Object.entries(loadedFiles).forEach(([fileName, data]) => {
        const fileDisplayName = fileName.replace('.json', '').replace(/_/g, ' ').replace(/,/g, ', ');
        
        html += `
            <div class="ct-file-group">
                <div class="ct-file-header" onclick="toggleCtExpand('file-${slugify(fileName)}')">
                    <span class="ct-expand-icon" id="icon-file-${slugify(fileName)}">▼</span>
                    <input type="checkbox" id="chk-file-${slugify(fileName)}" 
                           onclick="event.stopPropagation(); toggleCtFileAll('${fileName}', this.checked)">
                    <span class="ct-file-title">📄 ${escapeHtml(fileDisplayName)}</span>
                </div>
                <div class="ct-file-body" id="file-${slugify(fileName)}">
        `;

        (data.chapters || []).forEach((ch, chIdx) => {
            const chId = `${fileName}__${ch.id}`;
            html += `
                <div class="ct-chapter-group">
                    <div class="ct-chapter-header" onclick="toggleCtExpand('ch-${slugify(chId)}')">
                        <span class="ct-expand-icon" id="icon-ch-${slugify(chId)}">▶</span>
                        <input type="checkbox" id="chk-ch-${slugify(chId)}" 
                               onclick="event.stopPropagation(); toggleCtChapterAll('${fileName}', '${ch.id}', this.checked)">
                        <span class="ct-chapter-title">${ch.icon || '📘'} ${escapeHtml(ch.name)}</span>
                    </div>
                    <div class="ct-chapter-body collapsed" id="ch-${slugify(chId)}">
            `;

            (ch.topics || []).forEach((top, topIdx) => {
                const topicKey = `${fileName}__${ch.id}__${topIdx}`;
                const qCount = (top.questions || []).length;
                const isSelected = !!customTestSelection[topicKey];
                const selectedCount = isSelected ? customTestSelection[topicKey].count : qCount;

                html += `
                    <div class="ct-topic-row ${isSelected ? 'selected' : ''}">
                        <div class="ct-topic-info">
                            <input type="checkbox" id="chk-${slugify(topicKey)}" ${isSelected ? 'checked' : ''} 
                                   onchange="toggleCtTopic('${fileName}', '${ch.id}', ${topIdx}, this.checked)">
                            <label for="chk-${slugify(topicKey)}">${escapeHtml(top.topic)}</label>
                            <span class="topic-meta-count">${qCount} Qs</span>
                        </div>
                        ${isSelected ? `
                            <div class="ct-topic-count-wrap">
                                <span style="font-size:0.8rem;color:var(--text-muted);">Questions:</span>
                                <input type="number" class="int-input" value="${selectedCount}" min="1" max="${qCount}"
                                       onchange="updateCtTopicCount('${topicKey}', this.value, ${qCount})">
                                <span style="font-size:0.8rem;color:var(--text-muted);">/ ${qCount}</span>
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

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateCustomTestSummary();
}

function toggleCtExpand(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if (!el) return;

    if (el.classList.contains('collapsed')) {
        el.classList.remove('collapsed');
        if (icon) icon.textContent = '▼';
    } else {
        el.classList.add('collapsed');
        if (icon) icon.textContent = '▶';
    }
}

function toggleCtTopic(fileName, chId, topIdx, isChecked) {
    const topicKey = `${fileName}__${chId}__${topIdx}`;
    const fileData = loadedFiles[fileName];
    if (!fileData) return;

    const ch = (fileData.chapters || []).find(c => c.id === chId);
    if (!ch || !ch.topics || !ch.topics[topIdx]) return;

    const top = ch.topics[topIdx];
    const totalQs = (top.questions || []).length;

    if (isChecked) {
        customTestSelection[topicKey] = {
            fileName,
            chapterId: chId,
            chapterName: ch.name,
            topicIdx,
            topicName: top.topic,
            totalQs,
            count: totalQs,
            questions: top.questions
        };
    } else {
        delete customTestSelection[topicKey];
    }

    renderCustomTestBuilder();
}

function toggleCtChapterAll(fileName, chId, isChecked) {
    const fileData = loadedFiles[fileName];
    if (!fileData) return;

    const ch = (fileData.chapters || []).find(c => c.id === chId);
    if (!ch || !ch.topics) return;

    ch.topics.forEach((top, topIdx) => {
        const topicKey = `${fileName}__${chId}__${topIdx}`;
        const totalQs = (top.questions || []).length;
        if (isChecked) {
            customTestSelection[topicKey] = {
                fileName,
                chapterId: chId,
                chapterName: ch.name,
                topicIdx,
                topicName: top.topic,
                totalQs,
                count: totalQs,
                questions: top.questions
            };
        } else {
            delete customTestSelection[topicKey];
        }
    });

    renderCustomTestBuilder();
}

function toggleCtFileAll(fileName, isChecked) {
    const fileData = loadedFiles[fileName];
    if (!fileData) return;

    (fileData.chapters || []).forEach(ch => {
        (ch.topics || []).forEach((top, topIdx) => {
            const topicKey = `${fileName}__${ch.id}__${topIdx}`;
            const totalQs = (top.questions || []).length;
            if (isChecked) {
                customTestSelection[topicKey] = {
                    fileName,
                    chapterId: ch.id,
                    chapterName: ch.name,
                    topicIdx,
                    topicName: top.topic,
                    totalQs,
                    count: totalQs,
                    questions: top.questions
                };
            } else {
                delete customTestSelection[topicKey];
            }
        });
    });

    renderCustomTestBuilder();
}

function updateCtTopicCount(topicKey, val, maxCount) {
    let count = parseInt(val);
    if (isNaN(count) || count < 1) count = 1;
    if (count > maxCount) count = maxCount;

    if (customTestSelection[topicKey]) {
        customTestSelection[topicKey].count = count;
    }
    updateCustomTestSummary();
}

function updateCustomTestSummary() {
    const selectedKeys = Object.keys(customTestSelection);
    let totalQuestions = 0;

    selectedKeys.forEach(key => {
        totalQuestions += customTestSelection[key].count || 0;
    });

    const summaryEl = document.getElementById('ctSummaryText');
    const startBtn = document.getElementById('btnStartCustomTest');
    const downloadBtn = document.getElementById('btnDownloadCustomTest');

    if (summaryEl) {
        if (selectedKeys.length === 0) {
            summaryEl.innerHTML = 'Select at least one topic to create a custom test.';
        } else {
            summaryEl.innerHTML = `Selected <strong>${totalQuestions}</strong> questions across <strong>${selectedKeys.length}</strong> topic(s).`;
        }
    }

    if (startBtn) startBtn.disabled = selectedKeys.length === 0;
    if (downloadBtn) downloadBtn.disabled = selectedKeys.length === 0;
}

// ==================== START & DOWNLOAD CUSTOM TEST ====================
function buildCustomTestQuestions() {
    let allQs = [];

    Object.values(customTestSelection).forEach(item => {
        const takeCount = Math.min(item.count, item.questions.length);
        const shuffled = shuffleArray([...item.questions]);
        shuffled.slice(0, takeCount).forEach(q => {
            allQs.push({
                ...q,
                topicName: item.topicName,
                chapterName: item.chapterName
            });
        });
    });

    // Filter out fill_blank
    allQs = allQs.filter(q => q.type !== 'fill_blank' && q.type);

    // Shuffle all questions together
    return shuffleArray(allQs);
}

function startCustomTest() {
    const testQuestions = buildCustomTestQuestions();
    if (testQuestions.length === 0) {
        alert('No valid test questions in selection (test mode excludes fill in the blanks).');
        return;
    }

    // Set up test mode state
    questions = testQuestions;
    userAnswers = {};
    currentChapter = { name: 'Custom Multitopic Test' };
    currentMode = 'test';
    testStartTime = Date.now();

    updateTestTimeLimit();
    renderTestMode();
    startTestTimer();
    showScreen('screenTestMode');
}

async function downloadCustomTestForOffline(btnElement) {
    const selectedValues = Object.values(customTestSelection);
    if (selectedValues.length === 0) return;

    const originalText = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = '⏳ Preparing download...';

    // Collect all image URLs from selected topics
    const imageToCache = [];
    selectedValues.forEach(item => {
        (item.questions || []).forEach(q => {
            if (q.image_url) imageToCache.push(q.image_url);
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
        btnElement.innerHTML = `⏳ Caching images (${done}/${total})`;
    }

    // Save test configuration to IndexedDB
    const testConfig = {
        id: `custom_test_${Date.now()}`,
        name: `Custom Test (${selectedValues.length} topics)`,
        createdAt: Date.now(),
        topics: selectedValues.map(v => ({
            fileName: v.fileName,
            chapterId: v.chapterId,
            topicName: v.topicName,
            count: v.count
        }))
    };
    await offlineStorage.saveCustomTest(testConfig);

    btnElement.innerHTML = '✅ Downloaded Offline!';
    btnElement.classList.add('downloaded');
    setTimeout(() => {
        btnElement.innerHTML = originalText;
        btnElement.disabled = false;
        btnElement.classList.remove('downloaded');
    }, 3000);
}
