// ==================== DATA CONFIG ====================
// subjects are now handled via manifest.json
let currentDirectory = []; // Breadcrumb navigation stack
let manifestRoot = null; // Root manifest node

// ==================== STATE ====================
let currentSubject = null;
let currentChapter = null;
let currentMode = null; 
let questions = [];
let topics = [];
let currentQIndex = 0;
let userAnswers = {};
let isGridOpen = false;
let selectedTopics = [];
let subjectData = null; 
let topicQuestionCounts = {}; 
let currentFileName = null; // Currently loaded file name
let loadedFiles = {}; // Cache of loaded & normalized file data

let testStartTime = null;
let testTimerInterval = null;
let testTimeLimit = 30 * 60; 
let testQuestionCount = 10; 
let reviewFilter = 'all';

// ==================== UTILS ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}