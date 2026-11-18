/**
 * QUIZZY Backup — Modular ZIP Creator
 * ============================================================
 * ZIP structure: 1 ZIP per book/batch name, all subjects inside.
 *   e.g. pw-neet-arjuna.zip contains physics + chemistry + botany + zoology
 *   e.g. dpp-neet-arjuna-2023.zip contains all subjects for that DPP batch
 *
 * Size estimates (images ~15 KB avg):
 *   arjuna-neet   ~538 MB   lakshya-neet  ~498 MB   yakeen-neet   ~1.07 GB
 *   ncert-punch   ~1.16 GB  med-easy-neet ~533 MB   38yr-neet-pyq ~519 MB
 *   arjuna-jee    ~844 MB   lakshya-jee   ~720 MB   prayas-jee    ~1.57 GB
 *   48yr-jee-pyq  ~411 MB
 *   dropper-test  ~2.5 GB → split into neet-tests + jee-tests + dropper-tests
 *
 * After every 5 ZIPs → prints download links of those 5.
 * At the end → prints ALL links together.
 *
 * Output: backup-output/<package-name>.zip
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STAGING_DIR = path.resolve("backup-staging");
const OUTPUT_DIR = path.resolve("backup-output");

// GitHub Release info — passed from workflow env
const GITHUB_REPO = process.env.GITHUB_REPOSITORY || "";
const RUN_ID = process.env.GITHUB_RUN_ID || "unknown";
const TAG_NAME = `backup-${RUN_ID}`;

// ─── Package Definitions ───────────────────────────────────────────────────
// 1 entry = 1 ZIP.
// "paths" are relative to backup-staging/.
// All listed paths are packed together inside the same zip.

const PACKAGES = [
  // ════════════════════════════════════════
  //  NEET — PW Modules  (1 zip per book name, all subjects inside)
  // ════════════════════════════════════════
  {
    id: "pw-neet-arjuna",
    title: "PW NEET — Arjuna (All Subjects, ~538 MB)",
    paths: [
      "pw-modules/neet/arjuna-neet-physics-digital-module",
      "pw-modules/neet/arjuna-neet-chemistry-digital-module",
      "pw-modules/neet/arjuna-neet-botany-digital-module",
      "pw-modules/neet/arjuna-neet-zoology-digital-module",
    ],
  },
  {
    id: "pw-neet-lakshya",
    title: "PW NEET — Lakshya (All Subjects, ~498 MB)",
    paths: [
      "pw-modules/neet/lakshya-neet-physics-digital-module",
      "pw-modules/neet/lakshya-neet-chemistry-digital-module",
      "pw-modules/neet/lakshya-neet-botany-digital-module",
      "pw-modules/neet/lakshya-neet-zoology-digital-module",
    ],
  },
  {
    id: "pw-neet-yakeen",
    title: "PW NEET — Yakeen (All Subjects + NBT + OrgChem, ~1.07 GB)",
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
    title: "PW NEET — NCERT Punch (Physics + Chemistry + Biology, ~1.16 GB)",
    paths: [
      "pw-modules/neet/ncert-punch-physics-digital-book",
      "pw-modules/neet/ncert-punch-chemistry-digital-book",
      "pw-modules/neet/ncert-punch-biology-digital-book",
    ],
  },
  {
    id: "pw-neet-med-easy",
    title: "PW NEET — Med Easy (All Subjects, ~533 MB)",
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
    title: "PW NEET — 38 Years PYQ (All Subjects, ~519 MB)",
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
  //  JEE — PW Modules  (1 zip per book name, all subjects inside)
  // ════════════════════════════════════════
  {
    id: "pw-jee-arjuna",
    title: "PW JEE — Arjuna (Physics + Chemistry + Maths, ~844 MB)",
    paths: [
      "pw-modules/jee/arjuna-jee-physics-digital-module",
      "pw-modules/jee/arjuna-jee-chemistry-digital-module",
      "pw-modules/jee/arjuna-jee-mathematics-digital-module",
    ],
  },
  {
    id: "pw-jee-lakshya",
    title: "PW JEE — Lakshya (Physics + Chemistry + Maths, ~720 MB)",
    paths: [
      "pw-modules/jee/lakshya-jee-physics-digital-module",
      "pw-modules/jee/lakshya-jee-chemistry-digital-module",
      "pw-modules/jee/lakshya-jee-mathematics-digital-module",
    ],
  },
  {
    id: "pw-jee-prayas",
    title: "PW JEE — Prayas Droppers (Physics + Chemistry + Maths, ~1.57 GB)",
    paths: [
      "pw-modules/jee/prayas-jee-physics-digital-module",
      "pw-modules/jee/prayas-jee-chemistry-digital-module",
      "pw-modules/jee/prayas-jee-maths-digital-module",
    ],
  },
  {
    id: "pw-jee-48yr-pyq",
    title: "PW JEE — 48 Years PYQ (Physics + Chemistry + Maths, ~411 MB)",
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
  //  NeetPrep — all in one (mostly text, ~25K URLs → ~386 MB)
  // ════════════════════════════════════════
  {
    id: "neetprep-all",
    title: "NeetPrep — Full Question Bank (All Subjects & Banks)",
    paths: ["neetprep"],
  },

  // ════════════════════════════════════════
  //  PW Tests (Test Cafe) — split to avoid dropper's 2.5 GB
  //  dropper-test has 165K image URLs → ~2.5 GB, so kept separate
  // ════════════════════════════════════════
  {
    id: "pw-tests-neet",
    title: "PW Tests — NEET Test Papers",
    paths: ["pw-test/neet-test"],
  },
  {
    id: "pw-tests-jee",
    title: "PW Tests — JEE Test Papers",
    paths: ["pw-test/jee-test"],
  },
  {
    id: "pw-tests-dropper-neet",
    title: "PW Tests — Dropper Tests NEET (~large, check size after run)",
    paths: ["pw-test/dropper-test/neet"],
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

function hasNativeZip() {
  try {
    execSync("which zip", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasNativeTar() {
  try {
    execSync("which tar", { stdio: "ignore" });
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

async function createZipArchive(outputPath, sourceDir, items) {
  if (hasNativeZip()) {
    console.log("  ⚡ Using native zip...");
    const args = items.map((i) => `"${i}"`);
    execSync(`zip -q -r -1 "${outputPath}" ${args.join(" ")}`, {
      cwd: sourceDir,
      stdio: "inherit",
      maxBuffer: 1024 * 1024 * 100,
    });
    const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ Created: ${path.basename(outputPath)} (${sizeMB} MB)`);
    return;
  }

  if (hasNativeTar()) {
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

function buildDownloadUrl(zipName) {
  if (!GITHUB_REPO) return `(local) ${zipName}`;
  return `https://github.com/${GITHUB_REPO}/releases/download/${TAG_NAME}/${zipName}`;
}

function printLinks(entries) {
  console.log("\n" + "─".repeat(66));
  console.log("📥 DOWNLOAD LINKS (batch):");
  console.log("─".repeat(66));
  for (const { name, title, sizeMB } of entries) {
    const url = buildDownloadUrl(name);
    console.log(`\n📦 ${title} [${sizeMB} MB]`);
    console.log(`   ${url}`);
  }
  console.log("─".repeat(66) + "\n");
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
    `\n📊 Staging folder total: ${(stagingSize / 1024 / 1024).toFixed(0)} MB`
  );
  console.log(
    `📦 Building ZIPs (1 per book/batch — all subjects inside)...\n`
  );

  const alwaysInclude = ["README.md", "backup-manifest.json", "logs"].filter(
    (f) => fs.existsSync(path.join(STAGING_DIR, f))
  );

  const handledPaths = new Set();
  const allCreatedZips = [];
  let batchBuffer = [];

  for (const pkg of PACKAGES) {
    const existingPaths = pkg.paths.filter((p) =>
      fs.existsSync(path.join(STAGING_DIR, p))
    );
    if (existingPaths.length === 0) {
      console.log(`⬜ Skipped (no data): ${pkg.id}`);
      continue;
    }
    existingPaths.forEach((p) => handledPaths.add(p));

    const pkgBytes = getItemsSizeBytes(STAGING_DIR, existingPaths);
    const pkgMB = (pkgBytes / 1024 / 1024).toFixed(1);
    console.log(`\n🗂️  ${pkg.title}`);
    console.log(`   Packed size on disk: ${pkgMB} MB`);

    const zipName = `${pkg.id}.zip`;
    const zipPath = path.join(OUTPUT_DIR, zipName);
    await createZipArchive(zipPath, STAGING_DIR, [
      ...alwaysInclude,
      ...existingPaths,
    ]);

    const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
    const entry = { name: zipName, title: pkg.title, sizeMB };
    allCreatedZips.push(entry);
    batchBuffer.push(entry);

    // Print links every 5 ZIPs
    if (batchBuffer.length >= 5) {
      printLinks(batchBuffer);
      batchBuffer = [];
    }
  }

  // ── Leftover paths not covered by any PACKAGE ─────────────────────────
  const metaFiles = new Set(["README.md", "backup-manifest.json", "logs"]);
  const isCovered = (relPath) => {
    for (const h of handledPaths) {
      if (
        relPath === h ||
        relPath.startsWith(h + "/") ||
        h.startsWith(relPath + "/")
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
          h.startsWith(rel + "/")
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
    console.log(
      `\n🗂️  Packaging ${leftoverPaths.length} unmapped item(s) → quizzy-backup-extra.zip`
    );
    const zipName = "quizzy-backup-extra.zip";
    const zipPath = path.join(OUTPUT_DIR, zipName);
    await createZipArchive(zipPath, STAGING_DIR, [
      ...alwaysInclude,
      ...leftoverPaths,
    ]);
    const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
    const entry = { name: zipName, title: "Extra / Unmapped Data", sizeMB };
    allCreatedZips.push(entry);
    batchBuffer.push(entry);
  }

  // Print any remaining links that didn't fill a batch of 5
  if (batchBuffer.length > 0) {
    printLinks(batchBuffer);
  }

  // ── FINAL: ALL LINKS ──────────────────────────────────────────────────
  console.log("\n" + "═".repeat(66));
  console.log("🎉 ALL ZIPS DONE — COMPLETE DOWNLOAD LINK LIST");
  console.log("═".repeat(66));
  console.log(`\nRelease tag : ${TAG_NAME}`);
  console.log(`Total ZIPs  : ${allCreatedZips.length}\n`);

  let summaryTable =
    "\n### 📦 Generated Archives\n" +
    "| Package | Archive | Size | Download |\n" +
    "|---|---|---|---|\n";

  for (const z of allCreatedZips) {
    const url = buildDownloadUrl(z.name);
    console.log(`📦 [${z.sizeMB} MB] ${z.title}`);
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
}

main().catch((err) => {
  console.error("💥 ZIP creation failed:", err);
  process.exit(1);
});
