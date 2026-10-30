/**
 * QUIZZY Backup — Modular ZIP Creator
 * ============================================================
 * Packages backup-staging/ into course & batch modular ZIP files
 * matching the site structure, ensuring every ZIP is strictly < 2 GB.
 *
 * Output: backup-output/<package-name>.zip
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STAGING_DIR = path.resolve("backup-staging");
const OUTPUT_DIR = path.resolve("backup-output");

// Strict maximum limit: 2 GB per ZIP file
const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

// ─── Modular Package Definitions (Matching Site Courses & Batches) ───
const PACKAGES = [
  // ── NEET (UG) ──
  {
    id: "pw-neet-arjuna-11th",
    title: "PW NEET - Arjuna (Class 11th)",
    paths: [
      "pw-modules/neet/arjuna-neet-physics-digital-module",
      "pw-modules/neet/arjuna-neet-chemistry-digital-module",
      "pw-modules/neet/arjuna-neet-botany-digital-module",
      "pw-modules/neet/arjuna-neet-zoology-digital-module",
    ],
  },
  {
    id: "pw-neet-lakshya-12th",
    title: "PW NEET - Lakshya (Class 12th)",
    paths: [
      "pw-modules/neet/lakshya-neet-physics-digital-module",
      "pw-modules/neet/lakshya-neet-chemistry-digital-module",
      "pw-modules/neet/lakshya-neet-botany-digital-module",
      "pw-modules/neet/lakshya-neet-zoology-digital-module",
    ],
  },
  {
    id: "pw-neet-yakeen-physics-chemistry",
    title: "PW NEET - Yakeen Droppers (Physics & Chemistry)",
    paths: [
      "pw-modules/neet/yakeen-neet-physics-digital-module",
      "pw-modules/neet/yakeen-neet-chemistry-digital-module",
      "pw-modules/neet/yakeen-2.0-2026-organic-chemistry",
    ],
  },
  {
    id: "pw-neet-yakeen-biology",
    title: "PW NEET - Yakeen Droppers (Biology & NBT)",
    paths: [
      "pw-modules/neet/yakeen-neet-botany-digital-module",
      "pw-modules/neet/yakeen-neet-zoology-digital-module",
      "pw-modules/neet/yakeen-2.0-2027-nbt",
    ],
  },
  {
    id: "pw-neet-ncert-punch-physics",
    title: "PW NEET - NCERT Punch (Physics)",
    paths: ["pw-modules/neet/ncert-punch-physics-digital-book"],
  },
  {
    id: "pw-neet-ncert-punch-chemistry",
    title: "PW NEET - NCERT Punch (Chemistry)",
    paths: ["pw-modules/neet/ncert-punch-chemistry-digital-book"],
  },
  {
    id: "pw-neet-ncert-punch-biology",
    title: "PW NEET - NCERT Punch (Biology)",
    paths: ["pw-modules/neet/ncert-punch-biology-digital-book"],
  },
  {
    id: "pw-neet-med-easy",
    title: "PW NEET - Med Easy Revision Series",
    paths: [
      "pw-modules/neet/physics-med-easy-2-0-digital-book",
      "pw-modules/neet/chemistry-med-easy-4-0-digital-book",
      "pw-modules/neet/botany-med-easy-digital-book",
      "pw-modules/neet/zoology-med-easy-2-0-digital-book",
      "pw-modules/neet/mr-physics-question-solving-med-easy-digital-book",
    ],
  },
  {
    id: "pw-neet-38-years-pyqs",
    title: "PW NEET - 38 Years Solved Papers",
    paths: [
      "pw-modules/neet/38-years-neet-previous-year-solved-question-papers-physics",
      "pw-modules/neet/38-years-neet-previous-year-solved-question-papers-chemistry",
      "pw-modules/neet/38-years-neet-previous-year-solved-question-papers-biology",
    ],
  },
  {
    id: "pw-neet-rankers-tests",
    title: "PW NEET - Rankers Test Series",
    paths: ["pw-modules/neet/neet-rankers-test-series"],
  },

  // ── JEE (Main & Advanced) ──
  {
    id: "pw-jee-arjuna-11th",
    title: "PW JEE - Arjuna (Class 11th)",
    paths: [
      "pw-modules/jee/arjuna-jee-physics-digital-module",
      "pw-modules/jee/arjuna-jee-chemistry-digital-module",
      "pw-modules/jee/arjuna-jee-mathematics-digital-module",
    ],
  },
  {
    id: "pw-jee-lakshya-12th",
    title: "PW JEE - Lakshya (Class 12th)",
    paths: [
      "pw-modules/jee/lakshya-jee-physics-digital-module",
      "pw-modules/jee/lakshya-jee-chemistry-digital-module",
      "pw-modules/jee/lakshya-jee-mathematics-digital-module",
    ],
  },
  {
    id: "pw-jee-prayas-dropper",
    title: "PW JEE - Prayas Droppers",
    paths: [
      "pw-modules/jee/prayas-jee-physics-digital-module",
      "pw-modules/jee/prayas-jee-chemistry-digital-module",
      "pw-modules/jee/prayas-jee-maths-digital-module",
    ],
  },
  {
    id: "pw-jee-48-years-pyqs",
    title: "PW JEE - 48 Years Solved Papers",
    paths: [
      "pw-modules/jee/jee-advanced-48-years-1978-2025-physics-digital-book",
      "pw-modules/jee/jee-advanced-48-years-1978-2025-chemistry-digital-book",
      "pw-modules/jee/jee-advanced-48-years-1978-2025-maths-digital-book",
    ],
  },
  {
    id: "pw-jee-reference-books",
    title: "PW JEE - Handbooks & Reference Books",
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
    ],
  },
  {
    id: "pw-jee-rankers-tests",
    title: "PW JEE - Rankers Tests & 2026 Papers",
    paths: [
      "pw-modules/jee/jee-main-2026-paper-session-1",
      "pw-modules/jee/jee-rankers-test-series",
    ],
  },

  // ── Boards & Foundation ──
  {
    id: "pw-boards-9th-10th",
    title: "PW Boards - Class 9th & 10th (Neev & Udaan)",
    paths: [
      "pw-modules/boards/9th",
      "pw-modules/boards/10th",
    ],
  },
  {
    id: "pw-boards-11th-12th",
    title: "PW Boards - Class 11th & 12th",
    paths: [
      "pw-modules/boards/11th",
      "pw-modules/boards/12th",
    ],
  },

  // ── NCERT Digital Books ──
  {
    id: "pw-ncert-digital-books",
    title: "PW NCERT Digital Books (Class 11 & 12)",
    paths: ["pw-modules/ncert"],
  },

  // ── Test Cafe (pw-test) ──
  {
    id: "pw-tests-neet",
    title: "PW Tests - NEET Test Papers",
    paths: ["pw-test/neet-test"],
  },
  {
    id: "pw-tests-jee",
    title: "PW Tests - JEE Test Papers",
    paths: ["pw-test/jee-test"],
  },
  {
    id: "pw-tests-dropper",
    title: "PW Tests - Dropper Test Papers",
    paths: ["pw-test/dropper-test"],
  },
  {
    id: "pw-tests-boards",
    title: "PW Tests - Board Level Tests",
    paths: ["pw-test/board-level-tests"],
  },

  // ── PW Notes & Notes Cafe ──
  {
    id: "pw-notes-visual-edge",
    title: "PW Notes - Visual Edge & Formula Handbooks",
    paths: ["pw-notes"],
  },
  {
    id: "notes-cafe",
    title: "Notes Cafe - Subject-wise Chapter Notes",
    paths: ["notes"],
  },
];

function hasNativeZip() {
  try {
    const cmd = process.platform === "win32" ? "where zip" : "which zip";
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasNativeTar() {
  try {
    const cmd = process.platform === "win32" ? "where tar" : "which tar";
    execSync(cmd, { stdio: "ignore" });
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
    console.log("📦 Installing archiver@7 (CommonJS)...");
    execSync("npm install archiver@7 --no-save", { stdio: "inherit" });
    pkg = require("archiver");
  }
  if (typeof pkg === "function") return pkg;
  if (typeof pkg.default === "function") return pkg.default;
  if (typeof pkg.create === "function") return pkg.create;
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
 * Package a list of items inside sourceDir into outputPath.
 */
async function createZipArchive(outputPath, sourceDir, items) {
  if (hasNativeZip()) {
    console.log("⚡ Compressing with native zip binary...");
    try {
      const args = items.map((i) => `"${i}"`);
      execSync(`zip -q -r -1 "${outputPath}" ${args.join(" ")}`, {
        cwd: sourceDir,
        stdio: "inherit",
        maxBuffer: 1024 * 1024 * 100,
      });
      const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`✅ Created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      return;
    } catch (e) {
      console.warn("⚠️ Native zip failed, trying alternative:", e.message);
    }
  }

  if (hasNativeTar()) {
    console.log("⚡ Compressing with native tar binary...");
    try {
      const args = items.map((i) => `"${i}"`);
      execSync(`tar -a -c -f "${outputPath}" ${args.join(" ")}`, {
        cwd: sourceDir,
        stdio: "inherit",
        maxBuffer: 1024 * 1024 * 100,
      });
      const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`✅ Created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      return;
    } catch (e) {
      console.warn("⚠️ Native tar failed, falling back to node archiver:", e.message);
    }
  }

  console.log("📦 Compressing with Node.js archiver...");
  const archiverFn = getArchiver();
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiverFn("zip", { zlib: { level: 1 } });

    output.on("close", () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(1);
      console.log(`✅ Created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      resolve();
    });

    archive.on("error", reject);
    archive.pipe(output);

    for (const item of items) {
      const full = path.join(sourceDir, item);
      if (!fs.existsSync(full)) continue;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        archive.directory(full, item);
      } else {
        archive.file(full, { name: item });
      }
    }

    archive.finalize();
  });
}

/**
 * Break down large list of paths into parts under MAX_ZIP_BYTES
 */
function partitionPaths(baseDir, relPaths, maxBytes) {
  const total = getItemsSizeBytes(baseDir, relPaths);
  if (total <= maxBytes) return [relPaths];

  const chunks = [[]];
  let currentChunkSize = 0;

  for (const rel of relPaths) {
    const full = path.join(baseDir, rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    const itemSize = stat.isDirectory() ? getDirSizeBytes(full) : stat.size;

    if (currentChunkSize + itemSize > maxBytes && chunks[chunks.length - 1].length > 0) {
      chunks.push([]);
      currentChunkSize = 0;
    }
    chunks[chunks.length - 1].push(rel);
    currentChunkSize += itemSize;
  }

  return chunks;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!fs.existsSync(STAGING_DIR)) {
    console.warn(`⚠️ Staging directory does not exist: ${STAGING_DIR}`);
    return;
  }

  const stagingSize = getDirSizeBytes(STAGING_DIR);
  const sizeMB = (stagingSize / 1024 / 1024).toFixed(0);
  console.log(`\n📊 Staging folder size: ${sizeMB} MB`);
  console.log(`📦 Max ZIP part limit: 2 GB (2048 MB)\n`);

  // Always include these metadata files in every ZIP
  const alwaysInclude = ["README.md", "backup-manifest.json", "logs"].filter((f) =>
    fs.existsSync(path.join(STAGING_DIR, f))
  );

  const handledPaths = new Set();
  const createdZips = [];

  // 1. Process predefined modular packages
  for (const pkg of PACKAGES) {
    const existingPaths = pkg.paths.filter((p) => fs.existsSync(path.join(STAGING_DIR, p)));
    if (existingPaths.length === 0) continue;

    existingPaths.forEach((p) => handledPaths.add(p));

    const pkgBytes = getItemsSizeBytes(STAGING_DIR, existingPaths);
    const pkgMB = (pkgBytes / 1024 / 1024).toFixed(1);
    console.log(`\n🗂️  Package: ${pkg.title} (${pkgMB} MB)`);

    const chunks = partitionPaths(STAGING_DIR, existingPaths, MAX_ZIP_BYTES);

    for (let i = 0; i < chunks.length; i++) {
      const partSuffix = chunks.length > 1 ? `-part${i + 1}` : "";
      const zipName = `${pkg.id}${partSuffix}.zip`;
      const zipPath = path.join(OUTPUT_DIR, zipName);
      const itemsToZip = [...alwaysInclude, ...chunks[i]];

      console.log(`   🗜️  Building: ${zipName} (${chunks[i].length} path(s))`);
      await createZipArchive(zipPath, STAGING_DIR, itemsToZip);
      createdZips.push({ name: zipName, title: pkg.title, sizeMB: (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1) });
    }
  }

  // 2. Discover and package any unhandled directories in backup-staging
  const isCovered = (relPath) => {
    for (const h of handledPaths) {
      if (relPath === h || relPath.startsWith(h + "/") || h.startsWith(relPath + "/")) {
        return true;
      }
    }
    return false;
  };

  const walkDiscover = (dir, basePath = dir) => {
    const unhandled = [];
    if (!fs.existsSync(dir)) return unhandled;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(basePath, full).replace(/\\/g, "/");
      if (["README.md", "backup-manifest.json", "logs"].includes(entry.name) && dir === basePath) {
        continue;
      }
      if (isCovered(rel)) continue;

      if (entry.isDirectory()) {
        const anyChildCovered = [...handledPaths].some((h) => h.startsWith(rel + "/"));
        if (anyChildCovered) {
          unhandled.push(...walkDiscover(full, basePath));
        } else {
          unhandled.push(rel);
        }
      } else {
        unhandled.push(rel);
      }
    }
    return unhandled;
  };

  const leftoverPaths = walkDiscover(STAGING_DIR);
  if (leftoverPaths.length > 0) {
    console.log(`\n🗂️  Packaging ${leftoverPaths.length} unmapped item(s)...`);
    const leftoverChunks = partitionPaths(STAGING_DIR, leftoverPaths, MAX_ZIP_BYTES);
    for (let i = 0; i < leftoverChunks.length; i++) {
      const partSuffix = leftoverChunks.length > 1 ? `-part${i + 1}` : "";
      const zipName = `quizzy-backup-extra${partSuffix}.zip`;
      const zipPath = path.join(OUTPUT_DIR, zipName);
      const itemsToZip = [...alwaysInclude, ...leftoverChunks[i]];

      console.log(`   🗜️  Building: ${zipName}`);
      await createZipArchive(zipPath, STAGING_DIR, itemsToZip);
      createdZips.push({ name: zipName, title: "Extra / Unmapped Data", sizeMB: (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1) });
    }
  }

  // 3. Print final report & write summary.md
  console.log("\n============================================================");
  console.log("🎉 All Modular ZIP archives created successfully!");
  console.log("============================================================");

  let summaryTable = "\n### 📦 Generated Modular Archives (< 2 GB each)\n";
  summaryTable += "| Package / Course | Archive Filename | Size |\n";
  summaryTable += "|---|---|---|\n";

  for (const z of createdZips) {
    console.log(`  📦 ${z.name.padEnd(42)} (${z.sizeMB} MB)`);
    summaryTable += `| **${z.title}** | \`${z.name}\` | **${z.sizeMB} MB** |\n`;
  }
  console.log("============================================================\n");

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
