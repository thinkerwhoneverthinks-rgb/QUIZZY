/**
 * QUIZZY Image Backup Script
 * ============================================================
 * Scans selected data batches, extracts ALL image URLs from
 * every JSON file, downloads the images, copies the JSON files,
 * and lays everything out in a mirrored folder structure ready
 * to be zipped.
 *
 * Output directory: ./backup-staging/
 *
 * Image fields scanned per question:
 *   image_url, images[], optionImages[],
 *   explanation_image, explanation_images[],
 *   matchLists.listI/listII items[].image_url
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { URL } = require("url");

// ─── Config ────────────────────────────────────────────────
const CONCURRENCY = 8; // parallel downloads
const TIMEOUT_MS = 30_000;
const RETRY_COUNT = 3;
const DATA_DIR = path.resolve("data");
const STAGING_DIR = path.resolve("backup-staging");
const OUTPUT_DIR = path.resolve("backup-output");

// Which batches to include (driven by env vars from GitHub Actions)
const BATCHES = {
  "pw-test": (process.env.BATCH_PW_TEST ?? "true") === "true",
  "pw-modules": (process.env.BATCH_PW_MODULES ?? "true") === "true",
  "pw-notes": (process.env.BATCH_PW_NOTES ?? "true") === "true",
  notes: (process.env.BATCH_NOTES ?? "true") === "true",
};

// ─── Stats ─────────────────────────────────────────────────
const stats = {
  jsonFilesScanned: 0,
  uniqueUrls: 0,
  downloaded: 0,
  failed: 0,
  skipped: 0,
  startTime: Date.now(),
};

const failedUrls = [];
const manifest = []; // { url, localPath, field, questionId, sourceFile }

// ─── Helpers ───────────────────────────────────────────────

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Walk a directory recursively, returning all .json file paths */
function walkJson(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkJson(full));
    else if (entry.name.endsWith(".json")) results.push(full);
  }
  return results;
}

/** Extract all image URLs from a question object.
 *  Returns: [{ url, field }]
 */
function extractImageUrls(question) {
  const found = [];

  const push = (url, field) => {
    if (url && typeof url === "string" && url.startsWith("http")) {
      found.push({ url, field });
    }
  };

  push(question.image_url, "image_url");
  push(question.explanation_image, "explanation_image");

  (question.images ?? []).forEach((u, i) => push(u, `images_${i}`));
  (question.optionImages ?? []).forEach((u, i) =>
    push(u, `optionImages_${i}`)
  );
  (question.explanation_images ?? []).forEach((u, i) =>
    push(u, `explanation_images_${i}`)
  );

  // matchLists
  ["listI", "listII"].forEach((list) => {
    (question.matchLists?.[list]?.items ?? []).forEach((item, i) =>
      push(item.image_url, `matchLists_${list}_item_${i}_image_url`)
    );
  });

  return found;
}

/** Recursively find questions in any JSON structure.
 *  Works for both "sections[].questions[]" and "chapters[].topics[].questions[]"
 */
function collectQuestions(obj, questionList = []) {
  if (!obj || typeof obj !== "object") return questionList;
  if (Array.isArray(obj)) {
    obj.forEach((item) => collectQuestions(item, questionList));
    return questionList;
  }
  // If this object looks like a question (has image_url or type), include it
  if (obj.id && (obj.image_url !== undefined || obj.type)) {
    questionList.push(obj);
  }
  // Keep walking
  for (const key of Object.keys(obj)) {
    if (
      [
        "sections",
        "questions",
        "chapters",
        "topics",
        "blocks",
        "modules",
      ].includes(key)
    ) {
      collectQuestions(obj[key], questionList);
    }
  }
  return questionList;
}

/** Download a single URL to a local file with retry */
async function downloadFile(url, destPath, retries = RETRY_COUNT) {
  return new Promise((resolve) => {
    const attempt = (remaining) => {
      const client = url.startsWith("https") ? https : http;
      const file = fs.createWriteStream(destPath);
      let timedOut = false;

      const req = client.get(url, { timeout: TIMEOUT_MS }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlink(destPath, () => {});
          if (remaining > 0) {
            attempt(remaining - 1);
          } else {
            resolve({ ok: false, reason: `redirect loop` });
          }
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(destPath, () => {});
          if (remaining > 0) {
            setTimeout(() => attempt(remaining - 1), 1000);
          } else {
            resolve({ ok: false, reason: `HTTP ${res.statusCode}` });
          }
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve({ ok: true }));
        });
      });

      req.on("timeout", () => {
        timedOut = true;
        req.destroy();
        file.close();
        fs.unlink(destPath, () => {});
        if (remaining > 0) {
          setTimeout(() => attempt(remaining - 1), 2000);
        } else {
          resolve({ ok: false, reason: "timeout" });
        }
      });

      req.on("error", (err) => {
        if (timedOut) return;
        file.close();
        fs.unlink(destPath, () => {});
        if (remaining > 0) {
          setTimeout(() => attempt(remaining - 1), 1000);
        } else {
          resolve({ ok: false, reason: err.message });
        }
      });
    };
    attempt(retries);
  });
}

/** Simple concurrency limiter */
async function runWithConcurrency(tasks, limit) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: limit }, worker);
  await Promise.all(workers);
  return results;
}

/** Build the local image filename from question id + field */
function buildImageFilename(questionId, field, originalUrl) {
  let ext = ".png";
  try {
    const parsed = new URL(originalUrl);
    const urlPath = parsed.pathname;
    const match = urlPath.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i);
    if (match) ext = match[0].toLowerCase();
  } catch {}
  // Sanitise question id
  const safeId = (questionId || "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
  return `${safeId}__${field}${ext}`;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log("🚀 QUIZZY Backup starting...\n");
  console.log("Selected batches:");
  Object.entries(BATCHES).forEach(([k, v]) =>
    console.log(`  ${v ? "✅" : "⬜"} ${k}`)
  );
  console.log();

  mkdirp(STAGING_DIR);
  mkdirp(OUTPUT_DIR);

  // Collect all JSON files from selected batches
  const allJsonFiles = [];
  for (const [batch, enabled] of Object.entries(BATCHES)) {
    if (!enabled) continue;
    const batchDir = path.join(DATA_DIR, batch);
    const files = walkJson(batchDir);
    console.log(`📂 ${batch}: found ${files.length} JSON files`);
    allJsonFiles.push(...files);
  }

  console.log(`\n🔎 Scanning ${allJsonFiles.length} JSON files...\n`);

  // Map: url → { localPath, questionId, field, sourceFile }
  const urlMap = new Map();

  for (const jsonFile of allJsonFiles) {
    stats.jsonFilesScanned++;

    // Mirror the data/ folder structure in staging/
    const relFromData = path.relative(DATA_DIR, jsonFile);
    const stagedJsonDir = path.join(
      STAGING_DIR,
      path.dirname(relFromData)
    );
    const stagedImgDir = path.join(stagedJsonDir, "images");

    mkdirp(stagedJsonDir);
    mkdirp(stagedImgDir);

    // Copy the JSON file
    const destJson = path.join(stagedJsonDir, path.basename(jsonFile));
    fs.copyFileSync(jsonFile, destJson);

    // Parse and extract image URLs
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    } catch {
      console.warn(`  ⚠️  Could not parse: ${jsonFile}`);
      continue;
    }

    const questions = collectQuestions(parsed);
    for (const q of questions) {
      const images = extractImageUrls(q);
      for (const { url, field } of images) {
        if (!urlMap.has(url)) {
          const filename = buildImageFilename(q.id, field, url);
          const localPath = path.join(stagedImgDir, filename);
          urlMap.set(url, { localPath, questionId: q.id, field, sourceFile: relFromData });
        }
      }
    }
  }

  stats.uniqueUrls = urlMap.size;
  console.log(`\n📸 Unique image URLs found: ${stats.uniqueUrls}`);
  console.log(`⬇️  Starting downloads (concurrency: ${CONCURRENCY})...\n`);

  // Build download task list
  const entries = [...urlMap.entries()];
  const tasks = entries.map(([url, meta]) => async () => {
    const { localPath, questionId, field, sourceFile } = meta;
    mkdirp(path.dirname(localPath));

    const result = await downloadFile(url, localPath);

    if (result.ok) {
      stats.downloaded++;
      manifest.push({ url, localPath: path.relative(STAGING_DIR, localPath), field, questionId, sourceFile });
      if (stats.downloaded % 500 === 0) {
        console.log(`  ✅ ${stats.downloaded} / ${stats.uniqueUrls} downloaded...`);
      }
    } else {
      stats.failed++;
      failedUrls.push({ url, reason: result.reason, questionId, field, sourceFile });
      console.warn(`  ❌ FAILED [${result.reason}]: ${url}`);
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);

  // ── Write manifest ─────────────────────────────────────
  const manifestPath = path.join(STAGING_DIR, "backup-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // ── Write failed downloads log ─────────────────────────
  const logsDir = path.join(STAGING_DIR, "logs");
  mkdirp(logsDir);
  if (failedUrls.length > 0) {
    const failedLog = failedUrls
      .map((f) => `[${f.reason}] ${f.url}\n  → Q: ${f.questionId} | Field: ${f.field}\n  → File: ${f.sourceFile}`)
      .join("\n\n");
    fs.writeFileSync(path.join(logsDir, "failed-downloads.txt"), failedLog);
  }

  // ── Write README inside staging ────────────────────────
  const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
  const selectedBatches = Object.entries(BATCHES)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const readmeContent = generateReadme(selectedBatches, elapsed);
  fs.writeFileSync(path.join(STAGING_DIR, "README.md"), readmeContent);

  // ── Write summary for GitHub Actions Step Summary ──────
  const summaryContent = generateSummary(selectedBatches, elapsed);
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.md"), summaryContent);

  console.log("\n✅ Backup staging complete!");
  console.log(`   JSON files : ${stats.jsonFilesScanned}`);
  console.log(`   Unique URLs: ${stats.uniqueUrls}`);
  console.log(`   Downloaded : ${stats.downloaded}`);
  console.log(`   Failed     : ${stats.failed}`);
  console.log(`   Time taken : ${elapsed}s`);
}

function generateReadme(selectedBatches, elapsed) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return `# 📦 QUIZZY Image Backup
> Generated automatically by GitHub Actions

## 📅 Backup Info
| Field | Value |
|---|---|
| **Date** | ${now} |
| **Time taken** | ${elapsed}s |
| **Batches included** | ${selectedBatches.join(", ")} |

## 📊 Stats
| Metric | Count |
|---|---|
| JSON files scanned | ${stats.jsonFilesScanned} |
| Unique image URLs found | ${stats.uniqueUrls} |
| Images downloaded ✅ | ${stats.downloaded} |
| Failed downloads ❌ | ${stats.failed} |

## 📁 Folder Structure
\`\`\`
backup/
├── README.md                   ← this file
├── backup-manifest.json        ← maps every URL → local file path
├── logs/
│   └── failed-downloads.txt    ← URLs that failed (if any)
├── pw-test/                    ← NEET/JEE test papers
│   └── **/
│       ├── *.json              ← original JSON test file
│       └── images/             ← all images for that test
├── pw-modules/                 ← Digital modules (Arjuna, Lakshya, etc.)
│   └── **/
│       ├── *.json
│       └── images/
├── pw-notes/                   ← Visual Edge, Formula Handbook, etc.
│   └── **/
│       ├── Study_Notes.html
│       └── images/
└── notes/                      ← Subject-wise chapter notes
    └── **/
        ├── *.json
        └── images/
\`\`\`

## 🖼️ How Images Are Named
Each image file is named: \`{questionId}__{field}{ext}\`

Examples:
- \`698ae51f40a02cf87026bcb0__image_url.png\`
- \`698ae51f40a02cf87026bcb0__explanation_image.png\`
- \`q103__images_0.png\`
- \`q103__optionImages_2.png\`

## 🗺️ backup-manifest.json
The \`backup-manifest.json\` file maps every original CDN URL to its local file path so you can always trace an image back to its source question.

## ❌ Failed Downloads
${stats.failed === 0 ? "All images downloaded successfully! 🎉" : `${stats.failed} images failed. See \`logs/failed-downloads.txt\` for details.`}
`;
}

function generateSummary(selectedBatches, elapsed) {
  return `| Metric | Value |
|---|---|
| Batches | ${selectedBatches.join(", ")} |
| JSON files scanned | ${stats.jsonFilesScanned} |
| Unique image URLs | ${stats.uniqueUrls} |
| Downloaded ✅ | ${stats.downloaded} |
| Failed ❌ | ${stats.failed} |
| Time | ${elapsed}s |
`;
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});
