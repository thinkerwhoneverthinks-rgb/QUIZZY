/**
 * QUIZZY Backup — Modular ZIP Creator & Live Release Uploader (v2)
 * ============================================================
 * Packages backup-staging/ into self-contained ZIP archives:
 *   • 1 ZIP per book (pw-modules) — all subjects inside
 *   • 1 ZIP per batch (dpp) — all subjects inside
 *   • 1 ZIP for all neetprep
 *   • pw-tests-neet split into 11th, 12th, other (< 1.5 GB each)
 *   • pw-tests-dropper-neet split into 2024, 2025, 2026, 2027-other (< 1.5 GB each)
 *   • HARD SAFETY: Any package exceeding 1850 MB is auto-split into -part1, -part2
 *     so NO ZIP ever hits GitHub Releases' 2048 MB hard limit.
 *   • Lean per-ZIP backup-manifest.json (only entries belonging to that ZIP).
 *   • Live batch upload: every 5 ZIPs created → uploads those 5 to GitHub Release
 *     immediately (via gh CLI), prints 5 LIVE download links, and deletes the
 *     uploaded local .zip files to keep runner disk space safe.
 *   • At the very end → updates Release notes and prints ALL download links.
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const STAGING_DIR = path.resolve("backup-staging");
const META_DIR = path.resolve("backup-meta");
const OUTPUT_DIR = path.resolve("backup-output");

// Strict safety cap: GitHub Releases rejects >= 2048 MB, so cap source size at 1850 MB
const MAX_ZIP_BYTES = 1850 * 1024 * 1024;

// GitHub Release config (passed via workflow env)
const GITHUB_REPO = process.env.GITHUB_REPOSITORY || "";
const RUN_ID = process.env.GITHUB_RUN_ID || "unknown";
const GITHUB_SHA = process.env.GITHUB_SHA || "";
const TAG_NAME = `backup-${RUN_ID}`;
const PUBLISH_RELEASE = (process.env.PUBLISH_RELEASE || "false") === "true";
const KEEP_LOCAL_ZIPS = (process.env.KEEP_LOCAL_ZIPS || "false") === "true";

// ─── Package Definitions ───────────────────────────────────────────────────
const PACKAGES = [
  // ════════════════════════════════════════
  //  NEET — PW Modules (1 zip per book name, all subjects inside)
  // ════════════════════════════════════════
  {
    id: "pw-neet-arjuna",
    title: "PW NEET — Arjuna (All Subjects)",
    paths: [
      "pw-modules/neet/arjuna-neet-physics-digital-module",
      "pw-modules/neet/arjuna-neet-chemistry-digital-module",
      "pw-modules/neet/arjuna-neet-botany-digital-module",
      "pw-modules/neet/arjuna-neet-zoology-digital-module",
    ],
  },
  {
    id: "pw-neet-lakshya",
    title: "PW NEET — Lakshya (All Subjects)",
    paths: [
      "pw-modules/neet/lakshya-neet-physics-digital-module",
      "pw-modules/neet/lakshya-neet-chemistry-digital-module",
      "pw-modules/neet/lakshya-neet-botany-digital-module",
      "pw-modules/neet/lakshya-neet-zoology-digital-module",
    ],
  },
  {
    id: "pw-neet-yakeen",
    title: "PW NEET — Yakeen (All Subjects + NBT + OrgChem)",
    paths: [
      "pw-modules/neet/yakeen-neet-physics-digital-module",
      "pw-modules/neet/yakeen-neet-chemistry-digital-module",
      "pw-modules/neet/yakeen-neet-botany-digital-module",
      "pw-modules/neet/yakeen-neet-zoology-digital-module",
      "pw-modules/neet/yakeen-2.0-2026-organic-chemistry",
      "pw-modules/neet/yakeen-2.0-2027-nbt",
    ],
  },
  {
    id: "pw-neet-ncert-punch",
    title: "PW NEET — NCERT Punch (Physics + Chemistry + Biology)",
    paths: [
      "pw-modules/neet/ncert-punch-physics-digital-book",
      "pw-modules/neet/ncert-punch-chemistry-digital-book",
      "pw-modules/neet/ncert-punch-biology-digital-book",
    ],
  },
  {
    id: "pw-neet-med-easy",
    title: "PW NEET — Med Easy (All Subjects + MR Physics)",
    paths: [
      "pw-modules/neet/physics-med-easy-2-0-digital-book",
      "pw-modules/neet/mr-physics-question-solving-med-easy-digital-book",
      "pw-modules/neet/chemistry-med-easy-4-0-digital-book",
      "pw-modules/neet/botany-med-easy-digital-book",
      "pw-modules/neet/zoology-med-easy-2-0-digital-book",
    ],
  },
  {
    id: "pw-neet-38yr-pyq",
    title: "PW NEET — 38 Years PYQ (Physics + Chemistry + Biology)",
    paths: [
      "pw-modules/neet/38-years-neet-previous-year-solved-question-papers-physics",
      "pw-modules/neet/38-years-neet-previous-year-solved-question-papers-chemistry",
      "pw-modules/neet/38-years-neet-previous-year-solved-question-papers-biology",
    ],
  },
  {
    id: "pw-neet-rankers-test-series",
    title: "PW NEET — Rankers Test Series",
    paths: ["pw-modules/neet/neet-rankers-test-series"],
  },

  // ════════════════════════════════════════
  //  JEE — PW Modules (1 zip per book name, all subjects inside)
  // ════════════════════════════════════════
  {
    id: "pw-jee-arjuna",
    title: "PW JEE — Arjuna (Physics + Chemistry + Maths)",
    paths: [
      "pw-modules/jee/arjuna-jee-physics-digital-module",
      "pw-modules/jee/arjuna-jee-chemistry-digital-module",
      "pw-modules/jee/arjuna-jee-mathematics-digital-module",
    ],
  },
  {
    id: "pw-jee-lakshya",
    title: "PW JEE — Lakshya (Physics + Chemistry + Maths)",
    paths: [
      "pw-modules/jee/lakshya-jee-physics-digital-module",
      "pw-modules/jee/lakshya-jee-chemistry-digital-module",
      "pw-modules/jee/lakshya-jee-mathematics-digital-module",
    ],
  },
  {
    id: "pw-jee-prayas",
    title: "PW JEE — Prayas Droppers (Physics + Chemistry + Maths)",
    paths: [
      "pw-modules/jee/prayas-jee-physics-digital-module",
      "pw-modules/jee/prayas-jee-chemistry-digital-module",
      "pw-modules/jee/prayas-jee-maths-digital-module",
    ],
  },
  {
    id: "pw-jee-48yr-pyq",
    title: "PW JEE — 48 Years PYQ (Physics + Chemistry + Maths)",
    paths: [
      "pw-modules/jee/jee-advanced-48-years-1978-2025-physics-digital-book",
      "pw-modules/jee/jee-advanced-48-years-1978-2025-chemistry-digital-book",
      "pw-modules/jee/jee-advanced-48-years-1978-2025-maths-digital-book",
    ],
  },
  {
    id: "pw-jee-reference-books",
    title: "PW JEE — Reference Books & Handbooks (EAJee, SKC, MathsMade)",
    paths: [
      "pw-modules/jee/eajee-notes-for-inorganic-chemistry-digital-book",
      "pw-modules/jee/eajee-notes-for-organic-chemistry-digital-book",
      "pw-modules/jee/eajee-notes-for-physical-chemistry-digital-book",
      "pw-modules/jee/eajee-notes-for-maths-class-11",
      "pw-modules/jee/eajee-notes-for-maths-class-12",
      "pw-modules/jee/maths-made-ejee-class-11-handwritten-notes-digital-book",
      "pw-modules/jee/maths-made-ejee-class-12-handwritten-notes-digital-book",
      "pw-modules/jee/skc-physics-crush-class-11",
      "pw-modules/jee/skc-physics-crush-class-12",
      "pw-modules/jee/jee-main-2026-paper-session-1",
      "pw-modules/jee/jee-rankers-test-series",
    ],
  },

  // ════════════════════════════════════════
  //  Boards
  // ════════════════════════════════════════
  {
    id: "pw-boards-9th",
    title: "PW Boards — Class 9th (Neev)",
    paths: ["pw-modules/boards/9th"],
  },
  {
    id: "pw-boards-10th",
    title: "PW Boards — Class 10th (Udaan)",
    paths: ["pw-modules/boards/10th"],
  },
  {
    id: "pw-boards-11th-12th",
    title: "PW Boards — Class 11th & 12th (Question & Concept Banks)",
    paths: ["pw-modules/boards/11th", "pw-modules/boards/12th"],
  },

  // ════════════════════════════════════════
  //  NCERT Digital Books
  // ════════════════════════════════════════
  {
    id: "pw-ncert-digital-books",
    title: "PW NCERT Digital Books (Class 11 & 12)",
    paths: ["pw-modules/ncert"],
  },

  // ════════════════════════════════════════
  //  DPP — 1 ZIP per batch name, all subjects inside
  // ════════════════════════════════════════
  {
    id: "dpp-jee-arjuna-2026",
    title: "DPP — JEE Arjuna 2026 (All Subjects)",
    paths: ["dpp/jee/arjuna-jee-2026"],
  },
  {
    id: "dpp-jee-lakshya-2026",
    title: "DPP — JEE Lakshya 2026 (All Subjects)",
    paths: ["dpp/jee/lakshya-jee-2026"],
  },
  {
    id: "dpp-jee-prayas-2026",
    title: "DPP — JEE Prayas 2026 (All Subjects)",
    paths: ["dpp/jee/prayas-jee-2026"],
  },
  {
    id: "dpp-neet-arjuna-2023",
    title: "DPP — NEET Arjuna 2023 (All Subjects)",
    paths: ["dpp/neet/arjuna-neet-2023"],
  },
  {
    id: "dpp-neet-lakshya-2024",
    title: "DPP — NEET Lakshya 2024 (All Subjects)",
    paths: ["dpp/neet/lakshya-neet-2024"],
  },
  {
    id: "dpp-neet-yakeen-2023",
    title: "DPP — NEET Yakeen 2023 (All Subjects)",
    paths: ["dpp/neet/yakeen-neet-2023"],
  },
  {
    id: "dpp-neet-yakeen-2024",
    title: "DPP — NEET Yakeen 2024 (All Subjects)",
    paths: ["dpp/neet/yakeen-neet-2024"],
  },
  {
    id: "dpp-neet-yakeen-2025",
    title: "DPP — NEET Yakeen 2025 (All Subjects)",
    paths: ["dpp/neet/yakeen-neet-2025"],
  },
  {
    id: "dpp-neet-yakeen-2027",
    title: "DPP — NEET Yakeen 2027 (All Subjects)",
    paths: ["dpp/neet/yakeen-neet-2027"],
  },
  {
    id: "dpp-banking-ved-prime-2026",
    title: "DPP — Banking VED Prime 2026",
    paths: ["dpp/banking/ved-prime-2026"],
  },
  {
    id: "dpp-ugc-net-mission-jrf",
    title: "DPP — UGC NET Mission JRF (All Sessions)",
    paths: [
      "dpp/ugc-net/mission-jrf-dec-2026",
      "dpp/ugc-net/mission-jrf-june-2026",
    ],
  },

  // ════════════════════════════════════════
  //  NeetPrep — all in one
  // ════════════════════════════════════════
  {
    id: "neetprep-all",
    title: "NeetPrep — Full Question Bank (All Subjects & Banks)",
    paths: ["neetprep"],
  },

  // ════════════════════════════════════════
  //  PW Tests (Test Cafe) — split cleanly so every ZIP < 1.5 GB
  // ════════════════════════════════════════
  {
    id: "pw-tests-neet-11th",
    title: "PW Tests — NEET Test Papers (11th)",
    paths: ["pw-test/neet-test/11th"],
  },
  {
    id: "pw-tests-neet-12th",
    title: "PW Tests — NEET Test Papers (12th)",
    paths: ["pw-test/neet-test/12th"],
  },
  {
    id: "pw-tests-neet-other",
    title: "PW Tests — NEET Test Papers (Other)",
    paths: ["pw-test/neet-test/other"],
  },
  {
    id: "pw-tests-jee",
    title: "PW Tests — JEE Test Papers",
    paths: ["pw-test/jee-test"],
  },

  // Dropper tests NEET split by year to stay safely under 1.85 GB each
  {
    id: "pw-tests-dropper-neet-2024",
    title: "PW Tests — Dropper NEET (2024)",
    paths: ["pw-test/dropper-test/neet/2024"],
  },
  {
    id: "pw-tests-dropper-neet-2025",
    title: "PW Tests — Dropper NEET (2025)",
    paths: ["pw-test/dropper-test/neet/2025"],
  },
  {
    id: "pw-tests-dropper-neet-2026",
    title: "PW Tests — Dropper NEET (2026)",
    paths: ["pw-test/dropper-test/neet/2026"],
  },
  {
    id: "pw-tests-dropper-neet-2027-other",
    title: "PW Tests — Dropper NEET (2027 & Others)",
    paths: [
      "pw-test/dropper-test/neet/2027",
      "pw-test/dropper-test/neet/others",
    ],
  },
  {
    id: "pw-tests-dropper-jee",
    title: "PW Tests — Dropper Tests JEE",
    paths: ["pw-test/dropper-test/jee"],
  },
  {
    id: "pw-tests-boards",
    title: "PW Tests — Board Level Tests",
    paths: ["pw-test/board-level-tests"],
  },

  // ════════════════════════════════════════
  //  Batch Tests
  // ════════════════════════════════════════
  {
    id: "batch-tests-neet",
    title: "Batch Tests — NEET",
    paths: ["batch-tests/neet"],
  },
  {
    id: "batch-tests-banking",
    title: "Batch Tests — Banking",
    paths: ["batch-tests/banking"],
  },

  // ════════════════════════════════════════
  //  PYQ Tests
  // ════════════════════════════════════════
  {
    id: "jee-5year-pyq-tests",
    title: "JEE 5 Year PYQ Tests",
    paths: ["jee-5year-pyq-tests"],
  },
  {
    id: "neet-pyq-tests",
    title: "NEET PYQ Tests",
    paths: ["neet-pyq-tests"],
  },

  // ════════════════════════════════════════
  //  PW Notes & Notes Cafe
  // ════════════════════════════════════════
  {
    id: "pw-notes-visual-edge-formula",
    title: "PW Notes — Visual Edge & Formula Handbooks",
    paths: ["pw-notes"],
  },
  {
    id: "notes-cafe",
    title: "Notes Cafe — Subject-wise Chapter Notes",
    paths: ["notes"],
  },

  // ════════════════════════════════════════
  //  NCERT JSON & Cloze
  // ════════════════════════════════════════
  {
    id: "ncert-json-cloze",
    title: "NCERT JSON & Cloze Exercises",
    paths: ["ncert-json", "ncert-cloze"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function hasBin(name) {
  try {
    execSync(process.platform === "win32" ? `where ${name}` : `which ${name}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function getArchiver() {
  let pkg;
  try {
    pkg = require("archiver");
  } catch {
    console.log("📦 Installing archiver@7...");
    execSync("npm install archiver@7 --no-save", { stdio: "inherit" });
    pkg = require("archiver");
  }
  if (typeof pkg === "function") return pkg;
  if (typeof pkg.default === "function") return pkg.default;
  return pkg;
}

function getDirSizeBytes(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return total;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += fs.statSync(full).size;
    }
  };
  walk(dir);
  return total;
}

function getItemsSizeBytes(baseDir, relPaths) {
  let total = 0;
  for (const rel of relPaths) {
    const full = path.join(baseDir, rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) total += getDirSizeBytes(full);
    else total += stat.size;
  }
  return total;
}

/**
 * Recursively expand any directory that alone exceeds maxBytes, then
 * greedily pack items into chunks each <= maxBytes.
 */
function expandOversized(baseDir, relPaths, maxBytes) {
  const expanded = [];
  for (const rel of relPaths) {
    const full = path.join(baseDir, rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (!stat.isDirectory()) {
      expanded.push(rel);
      continue;
    }
    const sz = getDirSizeBytes(full);
    if (sz <= maxBytes) {
      expanded.push(rel);
    } else {
      const children = fs
        .readdirSync(full)
        .sort()
        .map((c) => path.join(rel, c).replace(/\\/g, "/"));
      expanded.push(...expandOversized(baseDir, children, maxBytes));
    }
  }
  return expanded;
}

function partitionPaths(baseDir, relPaths, maxBytes) {
  const total = getItemsSizeBytes(baseDir, relPaths);
  if (total <= maxBytes) return [relPaths];

  console.log(
    `  ⚠️  Package size (${(total / 1024 / 1024).toFixed(1)} MB) > ${(maxBytes / 1024 / 1024).toFixed(0)} MB cap → auto-splitting...`
  );

  const items = expandOversized(baseDir, relPaths, maxBytes);
  const chunks = [[]];
  let cur = 0;

  for (const rel of items) {
    const full = path.join(baseDir, rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    const sz = stat.isDirectory() ? getDirSizeBytes(full) : stat.size;

    if (cur + sz > maxBytes && chunks[chunks.length - 1].length > 0) {
      chunks.push([]);
      cur = 0;
    }
    chunks[chunks.length - 1].push(rel);
    cur += sz;
  }
  return chunks;
}

/**
 * Index manifest.jsonl ONCE by parent directory of localPath for instant
 * per-ZIP manifest generation without re-reading or re-parsing 50 times.
 */
async function loadManifestIndex() {
  const manifestJsonl = path.join(META_DIR, "manifest.jsonl");
  const byDir = new Map(); // dirPath (forward slash) -> array of raw JSON lines
  if (!fs.existsSync(manifestJsonl)) return byDir;

  const rl = readline.createInterface({
    input: fs.createReadStream(manifestJsonl, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  const localPathRe = /"localPath":"([^"]+)"/;
  let count = 0;
  for await (const line of rl) {
    if (!line) continue;
    const m = localPathRe.exec(line);
    if (!m) continue;
    const dir = path.posix.dirname(m[1]);
    let arr = byDir.get(dir);
    if (!arr) {
      arr = [];
      byDir.set(dir, arr);
    }
    arr.push(line);
    count++;
  }
  console.log(`🗺️  Indexed ${count} manifest entries across ${byDir.size} image folders.`);
  return byDir;
}

/** Write a lean backup-manifest.json containing ONLY entries under targetRelPaths */
function writeScopedManifest(manifestByDir, targetRelPaths) {
  const outPath = path.join(STAGING_DIR, "backup-manifest.json");
  const normalized = targetRelPaths.map((p) =>
    p.replace(/\\/g, "/").replace(/\/$/, "")
  );

  const matchedLines = [];
  for (const [dir, lines] of manifestByDir.entries()) {
    const hit = normalized.some(
      (tgt) =>
        dir === tgt ||
        dir.startsWith(`${tgt}/`) ||
        tgt.startsWith(`${dir}/`) // handles file-level split inside images/
    );
    if (hit) {
      for (let i = 0; i < lines.length; i++) matchedLines.push(lines[i]);
    }
  }

  fs.writeFileSync(
    outPath,
    matchedLines.length > 0 ? `[\n${matchedLines.join(",\n")}\n]\n` : "[]\n",
    "utf8"
  );
  return matchedLines.length;
}

async function createZipArchive(outputPath, sourceDir, items) {
  if (hasBin("zip")) {
    console.log("  ⚡ Using native zip (-1 fast compression)...");
    // Write item list to a temp file so long argument lists never overflow shell limits
    const listFile = path.join(OUTPUT_DIR, ".zip-items.txt");
    fs.writeFileSync(listFile, items.join("\n") + "\n", "utf8");
    try {
      execSync(`zip -q -r -1 "${outputPath}" -@ < "${listFile}"`, {
        cwd: sourceDir,
        stdio: "inherit",
        maxBuffer: 1024 * 1024 * 100,
      });
    } finally {
      try { fs.unlinkSync(listFile); } catch {}
    }
    const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ Created: ${path.basename(outputPath)} (${sizeMB} MB)`);
    return;
  }

  if (hasBin("tar")) {
    console.log("  ⚡ Using native tar...");
    const args = items.map((i) => `"${i}"`);
    execSync(`tar -a -c -f "${outputPath}" ${args.join(" ")}`, {
      cwd: sourceDir,
      stdio: "inherit",
      maxBuffer: 1024 * 1024 * 100,
    });
    const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ Created: ${path.basename(outputPath)} (${sizeMB} MB)`);
    return;
  }

  console.log("  📦 Using Node.js archiver...");
  const archiverFn = getArchiver();
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiverFn("zip", { zlib: { level: 1 } });
    output.on("close", () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(1);
      console.log(`  ✅ Created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      resolve();
    });
    archive.on("error", reject);
    archive.pipe(output);
    for (const item of items) {
      const full = path.join(sourceDir, item);
      if (!fs.existsSync(full)) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) archive.directory(full, item);
      else archive.file(full, { name: item });
    }
    archive.finalize();
  });
}

// ─── GitHub Release Live Upload Helpers ───────────────────────────────────

function runGh(args, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = spawnSync("gh", args, { stdio: "inherit" });
    if (res.status === 0) return true;
    console.warn(`  ⚠️  gh ${args[0]} failed (attempt ${attempt}/${retries})`);
    if (attempt < retries) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000 * attempt);
    }
  }
  return false;
}

function ensureReleaseCreated() {
  if (!PUBLISH_RELEASE) return false;
  if (!hasBin("gh")) {
    console.warn("⚠️  gh CLI not found — skipping live release upload.");
    return false;
  }
  console.log(`\n👩‍🏭 Creating GitHub Release: ${TAG_NAME}...`);
  const args = [
    "release",
    "create",
    TAG_NAME,
    "--title",
    `📦 QUIZZY Backup — Run #${RUN_ID}`,
    "--notes",
    "⏳ Backup in progress — self-contained ZIP archives are being uploaded in batches of 5...",
  ];
  if (GITHUB_SHA) args.push("--target", GITHUB_SHA);
  const ok = runGh(args, 3);
  if (!ok) throw new Error(`Failed to create GitHub Release ${TAG_NAME}`);
  console.log(`✅ Release ${TAG_NAME} created!\n`);
  return true;
}

function uploadBatchAndCleanup(entries, releaseActive) {
  if (releaseActive) {
    console.log(`\n⬆️  Uploading batch of ${entries.length} ZIP(s) to Release ${TAG_NAME}...`);
    for (const entry of entries) {
      const zipPath = path.join(OUTPUT_DIR, entry.name);
      const sizeBytes = fs.statSync(zipPath).size;
      if (sizeBytes >= 2147483648) {
        console.error(
          `  ❌ SKIPPED UPLOAD: ${entry.name} is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB (>= 2048 MB GitHub limit)!`
        );
        entry.uploaded = false;
        continue;
      }
      const ok = runGh(["release", "upload", TAG_NAME, zipPath, "--clobber"], 3);
      entry.uploaded = ok;
      if (ok) {
        console.log(`  ✅ Uploaded: ${entry.name}`);
        if (!KEEP_LOCAL_ZIPS) {
          try { fs.unlinkSync(zipPath); } catch {}
        }
      } else {
        console.error(`  ❌ Failed to upload: ${entry.name}`);
      }
    }
  }

  // Print live links for this batch of up to 5 ZIPs
  console.log("\n" + "─".repeat(66));
  console.log(
    releaseActive
      ? "📥 LIVE DOWNLOAD LINKS (ready to leech now!):"
      : "📥 DOWNLOAD LINKS (local batch):"
  );
  console.log("─".repeat(66));
  for (const { name, title, sizeMB, uploaded } of entries) {
    const status = releaseActive ? (uploaded ? "✅" : "❌") : "📦";
    const url = buildDownloadUrl(name);
    console.log(`\n${status} ${title} [${sizeMB} MB]`);
    console.log(`   ${url}`);
  }
  console.log("─".repeat(66) + "\n");
}

function buildDownloadUrl(zipName) {
  if (!GITHUB_REPO) return `(local) ${zipName}`;
  return `https://github.com/${GITHUB_REPO}/releases/download/${TAG_NAME}/${zipName}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(STAGING_DIR)) {
    console.warn(`⚠️ Staging directory not found: ${STAGING_DIR}`);
    return;
  }

  const stagingSize = getDirSizeBytes(STAGING_DIR);
  console.log(
    `\n📊 Staging logical total: ${(stagingSize / 1024 / 1024).toFixed(0)} MB`
  );
  console.log(
    `📦 Building self-contained ZIPs (auto-split cap: ${(MAX_ZIP_BYTES / 1024 / 1024).toFixed(0)} MB)...`
  );

  const manifestByDir = await loadManifestIndex();
  const releaseActive = ensureReleaseCreated();

  const baseInclude = ["README.md", "logs"].filter((f) =>
    fs.existsSync(path.join(STAGING_DIR, f))
  );

  const handledPaths = new Set();
  const allCreatedZips = [];
  let batchBuffer = [];

  const flushBatch = () => {
    if (batchBuffer.length === 0) return;
    uploadBatchAndCleanup(batchBuffer, releaseActive);
    batchBuffer = [];
  };

  for (const pkg of PACKAGES) {
    const existingPaths = pkg.paths.filter((p) =>
      fs.existsSync(path.join(STAGING_DIR, p))
    );
    if (existingPaths.length === 0) {
      console.log(`⬜ Skipped (no data in staging): ${pkg.id}`);
      continue;
    }
    existingPaths.forEach((p) => handledPaths.add(p));

    const chunks = partitionPaths(STAGING_DIR, existingPaths, MAX_ZIP_BYTES);

    for (let c = 0; c < chunks.length; c++) {
      const partSuffix = chunks.length > 1 ? `-part${c + 1}` : "";
      const zipName = `${pkg.id}${partSuffix}.zip`;
      const title =
        chunks.length > 1
          ? `${pkg.title} (Part ${c + 1} of ${chunks.length})`
          : pkg.title;

      const chunkPaths = chunks[c];
      const pkgBytes = getItemsSizeBytes(STAGING_DIR, chunkPaths);
      const pkgMB = (pkgBytes / 1024 / 1024).toFixed(1);

      console.log(`\n🗂️  ${title}`);
      const manifestEntries = writeScopedManifest(manifestByDir, chunkPaths);
      console.log(`   Source: ${pkgMB} MB | Manifest entries: ${manifestEntries}`);

      const zipPath = path.join(OUTPUT_DIR, zipName);
      await createZipArchive(zipPath, STAGING_DIR, [
        ...baseInclude,
        "backup-manifest.json",
        ...chunkPaths,
      ]);

      const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
      const entry = { name: zipName, title, sizeMB, uploaded: false };
      allCreatedZips.push(entry);
      batchBuffer.push(entry);

      if (batchBuffer.length >= 5) {
        flushBatch();
      }
    }
  }

  // ── Leftover paths not covered by any PACKAGE ─────────────────────────
  const metaFiles = new Set(["README.md", "backup-manifest.json", "logs"]);
  const isCovered = (relPath) => {
    for (const h of handledPaths) {
      if (
        relPath === h ||
        relPath.startsWith(`${h}/`) ||
        h.startsWith(`${relPath}/`)
      )
        return true;
    }
    return false;
  };

  const walkDiscover = (dir, basePath = dir) => {
    const unhandled = [];
    if (!fs.existsSync(dir)) return unhandled;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === basePath && metaFiles.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(basePath, full).replace(/\\/g, "/");
      if (isCovered(rel)) continue;
      if (entry.isDirectory()) {
        const anyChildCovered = [...handledPaths].some((h) =>
          h.startsWith(`${rel}/`)
        );
        if (anyChildCovered) unhandled.push(...walkDiscover(full, basePath));
        else unhandled.push(rel);
      } else {
        unhandled.push(rel);
      }
    }
    return unhandled;
  };

  const leftoverPaths = walkDiscover(STAGING_DIR);
  if (leftoverPaths.length > 0) {
    const leftoverChunks = partitionPaths(STAGING_DIR, leftoverPaths, MAX_ZIP_BYTES);
    for (let c = 0; c < leftoverChunks.length; c++) {
      const partSuffix = leftoverChunks.length > 1 ? `-part${c + 1}` : "";
      const zipName = `quizzy-backup-extra${partSuffix}.zip`;
      const title =
        leftoverChunks.length > 1
          ? `Extra / Unmapped Data (Part ${c + 1})`
          : "Extra / Unmapped Data";
      console.log(`\n🗂️  ${title}`);
      writeScopedManifest(manifestByDir, leftoverChunks[c]);
      const zipPath = path.join(OUTPUT_DIR, zipName);
      await createZipArchive(zipPath, STAGING_DIR, [
        ...baseInclude,
        "backup-manifest.json",
        ...leftoverChunks[c],
      ]);
      const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
      const entry = { name: zipName, title, sizeMB, uploaded: false };
      allCreatedZips.push(entry);
      batchBuffer.push(entry);
      if (batchBuffer.length >= 5) flushBatch();
    }
  }

  // Upload & print any final batch (< 5)
  flushBatch();

  // ── FINAL: ALL LINKS ──────────────────────────────────────────────────
  console.log("\n" + "═".repeat(66));
  console.log("🎉 ALL ZIPS DONE — COMPLETE DOWNLOAD LINK LIST");
  console.log("═".repeat(66));
  console.log(`\nRelease tag : ${TAG_NAME}`);
  console.log(`Total ZIPs  : ${allCreatedZips.length}\n`);

  let summaryTable =
    "\n### 📦 Generated Self-Contained Archives\n" +
    "| Package | Archive | Size | Download |\n" +
    "|---|---|---|---|\n";

  for (const z of allCreatedZips) {
    const url = buildDownloadUrl(z.name);
    const mark = releaseActive ? (z.uploaded ? "✅" : "❌") : "📦";
    console.log(`${mark} [${z.sizeMB} MB] ${z.title}`);
    console.log(`   🔗 ${url}\n`);
    summaryTable += `| **${z.title}** | \`${z.name}\` | ${z.sizeMB} MB | [⬇️ Download](${url}) |\n`;
  }
  console.log("═".repeat(66));

  const summaryFile = path.join(OUTPUT_DIR, "summary.md");
  if (fs.existsSync(summaryFile)) {
    fs.appendFileSync(summaryFile, summaryTable);
  } else {
    fs.writeFileSync(summaryFile, summaryTable);
  }

  // Update the GitHub Release body with the final complete summary table
  if (releaseActive) {
    console.log(`\n📝 Updating Release ${TAG_NAME} notes with complete links table...`);
    runGh(["release", "edit", TAG_NAME, "--notes-file", summaryFile], 3);

    const failedUploads = allCreatedZips.filter((z) => !z.uploaded);
    if (failedUploads.length > 0) {
      console.error(`\n❌ ${failedUploads.length} ZIP(s) failed to upload:`);
      failedUploads.forEach((z) => console.error(`   - ${z.name} (${z.sizeMB} MB)`));
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("💥 ZIP creation failed:", err);
  process.exit(1);
});
