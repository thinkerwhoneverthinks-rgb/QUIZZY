/**
 * QUIZZY Image Backup Script (v2 — Self-Contained + Full Extractor)
 * ============================================================
 * Scans selected data batches, extracts ALL image URLs from:
 *   • JSON image fields (image_url, imageUrl, image, images[],
 *     optionImages[], explanation_image, explanationImage,
 *     explanation_images[], matchLists.listI/listII)
 *   • NCERT block format ({ type: "image", url: "https://..." })
 *   • Inline HTML <img src="https://..."> inside any string
 *   • Inline Markdown ![](https://...) inside any string
 *
 * Downloads every unique image ONCE into ./backup-cache/, then
 * hardlinks it into EVERY folder in ./backup-staging/ that uses it
 * so every ZIP package is 100% self-contained with ZERO extra
 * download time and ZERO extra disk usage on Linux.
 *
 * Writes per-entry metadata to ./backup-meta/manifest.jsonl so
 * create-zip.js can emit a lean per-ZIP backup-manifest.json.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

// ─── Config ────────────────────────────────────────────────
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "64", 10);
const TIMEOUT_MS = 30_000;
const RETRY_COUNT = 3;
const DATA_DIR = path.resolve("data");
const CACHE_DIR = path.resolve("backup-cache");
const STAGING_DIR = path.resolve("backup-staging");
const META_DIR = path.resolve("backup-meta");
const OUTPUT_DIR = path.resolve("backup-output");

// Keep-alive agents sized ABOVE CONCURRENCY so sockets never bottleneck
const MAX_SOCKETS = Math.max(80, CONCURRENCY + 16);
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: MAX_SOCKETS });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: MAX_SOCKETS });

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Permanently dead/private upstream domains to ignore cleanly
const IGNORED_HOSTS = new Set([
  "lmm-bucket-private.allen-live.in", // expired Allen CloudFront signed URLs
  "cdn.mathpix.com",                  // 403 private Mathpix snips
]);

// Which batches to include (driven by env vars from GitHub Actions)
const BATCHES = {
  "pw-test": (process.env.BATCH_PW_TEST ?? "true") === "true",
  "pw-modules": (process.env.BATCH_PW_MODULES ?? "true") === "true",
  "pw-notes": (process.env.BATCH_PW_NOTES ?? "true") === "true",
  notes: (process.env.BATCH_NOTES ?? "true") === "true",
  neetprep: (process.env.BATCH_NEETPREP ?? "true") === "true",
  "batch-tests": (process.env.BATCH_BATCH_TESTS ?? "true") === "true",
  dpp: (process.env.BATCH_DPP ?? "true") === "true",
  "jee-5year-pyq-tests": (process.env.BATCH_JEE_PYQ ?? "true") === "true",
  "neet-pyq-tests": (process.env.BATCH_NEET_PYQ ?? "true") === "true",
  "ncert-json": (process.env.BATCH_NCERT_JSON ?? "true") === "true",
  "ncert-cloze": (process.env.BATCH_NCERT_CLOZE ?? "true") === "true",
};

// ─── Stats ─────────────────────────────────────────────────
const stats = {
  jsonFilesScanned: 0,
  uniqueUrls: 0,
  downloaded: 0,
  cachedHits: 0,
  failed: 0,
  ignored: 0,
  hardlinkedFiles: 0,
  startTime: Date.now(),
};

const ignoredByHost = {};
const failedUrls = [];

// ─── Helpers ───────────────────────────────────────────────

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

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

/** Decode common HTML entities and normalize dead Heroku PW proxy URLs */
function normalizeUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  let u = raw.trim().replace(/&amp;/g, "&");
  if (!u.startsWith("http://") && !u.startsWith("https://")) return null;
  // Auto-fix dead Heroku proxy wrapper around static.pw.live
  u = u.replace(
    /^https?:\/\/rwa-stream-server-eu-app-1d79bf793523\.herokuapp\.com\/static\.pw\.live\//i,
    "https://static.pw.live/"
  );
  return u;
}

function isIgnoredHost(urlStr) {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (IGNORED_HOSTS.has(host)) return host;
  } catch {}
  return null;
}

function getUrlExt(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const match = parsed.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|bmp|avif)$/i);
    if (match) return match[0].toLowerCase();
  } catch {}
  return ".png";
}

function buildImageFilename(questionId, field, urlStr) {
  const ext = getUrlExt(urlStr);
  const safeId = String(questionId || "img")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);
  const hash = crypto.createHash("md5").update(urlStr).digest("hex").slice(0, 8);
  return `${safeId}__${field}__${hash}${ext}`;
}

function getCachePath(urlStr) {
  const hash = crypto.createHash("md5").update(urlStr).digest("hex");
  const ext = getUrlExt(urlStr);
  return path.join(CACHE_DIR, hash.slice(0, 2), `${hash}${ext}`);
}

/**
 * Recursively extract EVERY image URL from any JSON value:
 *   - Known image fields (image_url, imageUrl, image, explanation_image,
 *     explanationImage, images[], optionImages[], explanation_images[],
 *     matchLists.listI/listII items)
 *   - NCERT blocks ({ type: "image", url: "https://..." })
 *   - HTML <img ... src="https://..."> inside any string
 *   - Markdown ![alt](https://...) inside any string
 */
const IMG_TAG_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
const MD_IMG_RE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;

function extractAllImagesFromJson(root) {
  const found = []; // { originalUrl, downloadUrl, field, questionId }

  const add = (rawUrl, field, questionId) => {
    const downloadUrl = normalizeUrl(rawUrl);
    if (!downloadUrl) return;
    found.push({
      originalUrl: rawUrl.trim(),
      downloadUrl,
      field,
      questionId: questionId || "img",
    });
  };

  const scanString = (str, field, questionId) => {
    if (!str || typeof str !== "string") return;
    if (str.includes("<img") || str.includes("<IMG")) {
      IMG_TAG_RE.lastIndex = 0;
      let m;
      let idx = 0;
      while ((m = IMG_TAG_RE.exec(str)) !== null) {
        const src = m[1] || m[2];
        if (src && !src.startsWith("data:")) {
          add(src, `${field}_html_${idx++}`, questionId);
        }
      }
    }
    if (str.includes("](") && str.includes("http")) {
      MD_IMG_RE.lastIndex = 0;
      let m;
      let idx = 0;
      while ((m = MD_IMG_RE.exec(str)) !== null) {
        add(m[1], `${field}_md_${idx++}`, questionId);
      }
    }
  };

  const walk = (node, currentQid) => {
    if (!node) return;
    if (typeof node === "string") {
      scanString(node, "inline", currentQid);
      return;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], currentQid);
      }
      return;
    }
    if (typeof node !== "object") return;

    const qid =
      node.id !== undefined && (typeof node.id === "string" || typeof node.id === "number")
        ? String(node.id)
        : currentQid;

    // 1. Direct known image fields
    if (typeof node.image_url === "string") add(node.image_url, "image_url", qid);
    if (typeof node.imageUrl === "string") add(node.imageUrl, "imageUrl", qid);
    if (typeof node.image === "string") add(node.image, "image", qid);
    if (typeof node.explanation_image === "string") add(node.explanation_image, "explanation_image", qid);
    if (typeof node.explanationImage === "string") add(node.explanationImage, "explanationImage", qid);

    // 2. NCERT block format: { type: "image", url: "https://..." }
    if (node.type === "image" && typeof node.url === "string") {
      add(node.url, "ncert_image", qid);
    }

    // 3. Array image fields
    if (Array.isArray(node.images)) {
      node.images.forEach((u, i) => {
        if (typeof u === "string") add(u, `images_${i}`, qid);
      });
    }
    if (Array.isArray(node.optionImages)) {
      node.optionImages.forEach((u, i) => {
        if (typeof u === "string") add(u, `optionImages_${i}`, qid);
      });
    }
    if (Array.isArray(node.explanation_images)) {
      node.explanation_images.forEach((u, i) => {
        if (typeof u === "string") add(u, `explanation_images_${i}`, qid);
      });
    }

    // 4. matchLists
    if (node.matchLists && typeof node.matchLists === "object") {
      for (const listName of ["listI", "listII"]) {
        const items = node.matchLists[listName]?.items;
        if (Array.isArray(items)) {
          items.forEach((item, i) => {
            if (item && typeof item === "object") {
              if (typeof item.image_url === "string") {
                add(item.image_url, `matchLists_${listName}_${i}`, qid);
              } else if (typeof item.imageUrl === "string") {
                add(item.imageUrl, `matchLists_${listName}_${i}`, qid);
              }
            }
          });
        }
      }
    }

    // 5. Traverse child properties (strings scanned for HTML/MD images, objects/arrays walked)
    const skipDirectKeys = new Set([
      "image_url",
      "imageUrl",
      "image",
      "explanation_image",
      "explanationImage",
      "images",
      "optionImages",
      "explanation_images",
    ]);

    for (const key of Object.keys(node)) {
      const val = node[key];
      if (val === null || val === undefined) continue;
      if (typeof val === "string") {
        if (!skipDirectKeys.has(key)) {
          scanString(val, key, qid);
        }
      } else if (typeof val === "object") {
        walk(val, qid);
      }
    }
  };

  walk(root, "img");
  return found;
}

/** Download a single URL to destPath with redirect handling, fast-fail on 403/404/410, and retry on transient errors */
async function downloadFile(url, destPath, retries = RETRY_COUNT) {
  // Reuse cache if already present and non-empty
  try {
    const st = fs.statSync(destPath);
    if (st.size > 0) return { ok: true, cached: true };
  } catch {}

  const tmpPath = `${destPath}.part`;

  return new Promise((resolve) => {
    const attempt = (currentUrl, remaining, redirectDepth = 0) => {
      let client;
      let agent;
      try {
        const parsed = new URL(currentUrl);
        client = parsed.protocol === "https:" ? https : http;
        agent = parsed.protocol === "https:" ? httpsAgent : httpAgent;
      } catch (err) {
        return resolve({ ok: false, reason: `invalid URL: ${err.message}` });
      }

      const file = fs.createWriteStream(tmpPath);
      let settled = false;

      const cleanupTmp = () => {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {}
      };

      const fail = (reason, canRetry) => {
        if (settled) return;
        settled = true;
        try { file.close(); } catch {}
        cleanupTmp();
        if (canRetry && remaining > 0) {
          const delay = (RETRY_COUNT - remaining + 1) * 1000;
          setTimeout(() => attempt(currentUrl, remaining - 1, redirectDepth), delay);
        } else {
          resolve({ ok: false, reason });
        }
      };

      file.on("error", (err) => fail(`file write error: ${err.message}`, false));

      const req = client.get(
        currentUrl,
        {
          agent,
          timeout: TIMEOUT_MS,
          headers: { "User-Agent": USER_AGENT },
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            res.resume();
            settled = true;
            try { file.close(); } catch {}
            cleanupTmp();
            if (redirectDepth >= 5) {
              return resolve({ ok: false, reason: "too many redirects" });
            }
            try {
              const redirectUrl = new URL(res.headers.location, currentUrl).href;
              return attempt(redirectUrl, remaining, redirectDepth + 1);
            } catch (e) {
              return resolve({ ok: false, reason: `bad redirect: ${e.message}` });
            }
          }

          if (res.statusCode !== 200) {
            res.resume();
            // Fail fast on permanent client errors (403/404/410); retry 429/5xx
            const retryable = res.statusCode === 429 || res.statusCode >= 500;
            return fail(`HTTP ${res.statusCode}`, retryable);
          }

          res.pipe(file);
          file.on("finish", () => {
            file.close(() => {
              if (settled) return;
              settled = true;
              try {
                fs.renameSync(tmpPath, destPath);
                resolve({ ok: true, cached: false });
              } catch (e) {
                cleanupTmp();
                resolve({ ok: false, reason: `rename error: ${e.message}` });
              }
            });
          });
        }
      );

      req.on("timeout", () => {
        req.destroy();
        fail("timeout", true);
      });

      req.on("error", (err) => {
        fail(err.message, true);
      });
    };

    attempt(url, retries, 0);
  });
}

async function runWithConcurrency(tasks, limit) {
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length || 1) }, worker);
  await Promise.all(workers);
}

/** Link cacheFile into destPath with zero extra disk bytes (fallback to copy) */
function linkOrCopy(src, dest) {
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.linkSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
  }
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log("🚀 QUIZZY Backup (v2 — Self-Contained) starting...\n");
  console.log("Selected batches:");
  Object.entries(BATCHES).forEach(([k, v]) =>
    console.log(`  ${v ? "✅" : "⬜"} ${k}`)
  );
  console.log(`\n⚙️  Concurrency: ${CONCURRENCY} (maxSockets: ${MAX_SOCKETS})`);
  console.log(`🚫 Ignored dead hosts: ${[...IGNORED_HOSTS].join(", ")}\n`);

  mkdirp(CACHE_DIR);
  mkdirp(STAGING_DIR);
  mkdirp(META_DIR);
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

  // Copy pw-notes static HTML & local img/ folders
  if (BATCHES["pw-notes"]) {
    const pwNotesDir = path.join(DATA_DIR, "pw-notes");
    if (fs.existsSync(pwNotesDir)) {
      console.log(`📂 Copying pw-notes static files...`);
      const copyStaticRec = (src, dest) => {
        if (!fs.existsSync(src)) return;
        mkdirp(dest);
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
          const s = path.join(src, entry.name);
          const d = path.join(dest, entry.name);
          if (entry.isDirectory()) copyStaticRec(s, d);
          else linkOrCopy(s, d);
        }
      };
      copyStaticRec(pwNotesDir, path.join(STAGING_DIR, "pw-notes"));
    }
  }

  console.log(`\n🔎 Scanning ${allJsonFiles.length} JSON files...\n`);

  // Unique download map: downloadUrl -> { cachePath, sampleMeta }
  const uniqueDownloadMap = new Map();
  // Self-contained per-folder targets: stagedImgDir -> Map<downloadUrl, meta>
  const folderTargets = new Map();

  for (const jsonFile of allJsonFiles) {
    stats.jsonFilesScanned++;

    const relFromData = path.relative(DATA_DIR, jsonFile);
    const stagedJsonDir = path.join(STAGING_DIR, path.dirname(relFromData));
    const stagedImgDir = path.join(stagedJsonDir, "images");

    mkdirp(stagedJsonDir);

    // Copy JSON file into staging
    const destJson = path.join(stagedJsonDir, path.basename(jsonFile));
    fs.copyFileSync(jsonFile, destJson);

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
    } catch {
      console.warn(`  ⚠️  Could not parse: ${jsonFile}`);
      continue;
    }

    const extracted = extractAllImagesFromJson(parsed);
    if (extracted.length === 0) continue;

    let imgMap = folderTargets.get(stagedImgDir);
    if (!imgMap) {
      imgMap = new Map();
      folderTargets.set(stagedImgDir, imgMap);
    }

    for (const { originalUrl, downloadUrl, field, questionId } of extracted) {
      const ignoredHost = isIgnoredHost(downloadUrl);
      if (ignoredHost) {
        if (!uniqueDownloadMap.has(`__ignored__${downloadUrl}`)) {
          uniqueDownloadMap.set(`__ignored__${downloadUrl}`, null);
          stats.ignored++;
          ignoredByHost[ignoredHost] = (ignoredByHost[ignoredHost] || 0) + 1;
        }
        continue;
      }

      if (!uniqueDownloadMap.has(downloadUrl)) {
        uniqueDownloadMap.set(downloadUrl, {
          cachePath: getCachePath(downloadUrl),
          questionId,
          field,
          sourceFile: relFromData,
        });
      }

      // Deduplicate within the SAME folder, while keeping EVERY folder self-contained
      if (!imgMap.has(downloadUrl)) {
        const filename = buildImageFilename(questionId, field, downloadUrl);
        imgMap.set(downloadUrl, {
          localPath: path.join(stagedImgDir, filename),
          originalUrl,
          field,
          questionId,
          sourceFile: relFromData.replace(/\\/g, "/"),
        });
      }
    }
  }

  // Filter out sentinel ignored keys
  const downloadEntries = [...uniqueDownloadMap.entries()].filter(([, v]) => v !== null);
  stats.uniqueUrls = downloadEntries.length;

  console.log(`📸 Unique downloadable URLs : ${stats.uniqueUrls}`);
  console.log(`🚫 Ignored dead upstream    : ${stats.ignored}`, ignoredByHost);
  console.log(`⬇️  Downloading once to cache (concurrency: ${CONCURRENCY})...\n`);

  const succeededUrls = new Set();

  const tasks = downloadEntries.map(([url, meta]) => async () => {
    mkdirp(path.dirname(meta.cachePath));
    const result = await downloadFile(url, meta.cachePath);

    if (result.ok) {
      succeededUrls.add(url);
      if (result.cached) stats.cachedHits++;
      stats.downloaded++;
      if (stats.downloaded % 1000 === 0 || stats.downloaded === stats.uniqueUrls) {
        const pct = ((stats.downloaded / stats.uniqueUrls) * 100).toFixed(1);
        console.log(`  ✅ ${stats.downloaded} / ${stats.uniqueUrls} (${pct}%)...`);
      }
    } else {
      stats.failed++;
      failedUrls.push({
        url,
        reason: result.reason,
        questionId: meta.questionId,
        field: meta.field,
        sourceFile: meta.sourceFile,
      });
      console.warn(`  ❌ FAILED [${result.reason}]: ${url}`);
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);

  // ── Materialize self-contained staging via hardlinks + stream manifest.jsonl ──
  console.log(`\n🔗 Linking cached images into every folder (self-contained staging)...`);
  const manifestJsonlPath = path.join(META_DIR, "manifest.jsonl");
  const manifestStream = fs.createWriteStream(manifestJsonlPath, { encoding: "utf8" });

  for (const [stagedImgDir, imgMap] of folderTargets.entries()) {
    let dirCreated = false;
    for (const [downloadUrl, meta] of imgMap.entries()) {
      if (!succeededUrls.has(downloadUrl)) continue;
      if (!dirCreated) {
        mkdirp(stagedImgDir);
        dirCreated = true;
      }
      const cachePath = uniqueDownloadMap.get(downloadUrl).cachePath;
      linkOrCopy(cachePath, meta.localPath);
      stats.hardlinkedFiles++;

      const relLocal = path.relative(STAGING_DIR, meta.localPath).replace(/\\/g, "/");
      manifestStream.write(
        JSON.stringify({
          url: meta.originalUrl,
          localPath: relLocal,
          field: meta.field,
          questionId: meta.questionId,
          sourceFile: meta.sourceFile,
        }) + "\n"
      );
    }
  }

  await new Promise((resolve, reject) => {
    manifestStream.on("finish", resolve);
    manifestStream.on("error", reject);
    manifestStream.end();
  });

  console.log(`✅ Hardlinked ${stats.hardlinkedFiles} image files across ${folderTargets.size} folders.`);

  // ── Write failed downloads log ─────────────────────────
  const logsDir = path.join(STAGING_DIR, "logs");
  mkdirp(logsDir);
  if (failedUrls.length > 0) {
    const failedLog = failedUrls
      .map(
        (f) =>
          `[${f.reason}] ${f.url}\n  → Q: ${f.questionId} | Field: ${f.field}\n  → File: ${f.sourceFile}`
      )
      .join("\n\n");
    fs.writeFileSync(path.join(logsDir, "failed-downloads.txt"), failedLog);
  }

  // ── Write README inside staging ────────────────────────
  const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
  const selectedBatches = Object.entries(BATCHES)
    .filter(([, v]) => v)
    .map(([k]) => k);

  fs.writeFileSync(
    path.join(STAGING_DIR, "README.md"),
    generateReadme(selectedBatches, elapsed)
  );

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "summary.md"),
    generateSummary(selectedBatches, elapsed)
  );

  console.log("\n✅ Backup staging complete!");
  console.log(`   JSON files      : ${stats.jsonFilesScanned}`);
  console.log(`   Unique URLs     : ${stats.uniqueUrls}`);
  console.log(`   Downloaded      : ${stats.downloaded}`);
  console.log(`   Ignored (dead)  : ${stats.ignored}`);
  console.log(`   Failed          : ${stats.failed}`);
  console.log(`   Linked in ZIPs  : ${stats.hardlinkedFiles}`);
  console.log(`   Time taken      : ${elapsed}s`);
}

function generateReadme(selectedBatches, elapsed) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return `# 📦 QUIZZY Self-Contained Backup
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
| Unique image URLs | ${stats.uniqueUrls} |
| Images downloaded ✅ | ${stats.downloaded} |
| Ignored dead upstream (Allen/Mathpix) 🚫 | ${stats.ignored} |
| Failed downloads ❌ | ${stats.failed} |
| Self-contained image links across folders | ${stats.hardlinkedFiles} |

## 📁 Self-Contained Structure
Each ZIP archive contains its own JSON files, all images referenced by those JSON files (under \`images/\`), and its own scoped \`backup-manifest.json\` mapping every original URL → local path inside this ZIP.

## ❌ Failed Downloads
${stats.failed === 0 ? "Zero unexpected failures! 🎉" : `${stats.failed} images failed. See \`logs/failed-downloads.txt\`.`}
`;
}

function generateSummary(selectedBatches, elapsed) {
  return `| Metric | Value |
|---|---|
| Batches | ${selectedBatches.join(", ")} |
| JSON files scanned | ${stats.jsonFilesScanned} |
| Unique image URLs | ${stats.uniqueUrls} |
| Downloaded ✅ | ${stats.downloaded} |
| Ignored (Allen/Mathpix dead upstream) 🚫 | ${stats.ignored} |
| Failed ❌ | ${stats.failed} |
| Self-contained image copies linked | ${stats.hardlinkedFiles} |
| Time | ${elapsed}s |
`;
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});
