/**
 * QUIZZY Backup — ZIP Creator
 * ============================================================
 * Packages backup-staging/ into one or more standalone ZIP files.
 * Uses native zip / tar if available for maximum speed and zero-memory
 * overhead, falling back to archiver@7 if needed.
 *
 * Output: backup-output/quizzy-backup-YYYY-MM-DD[-partN].zip
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STAGING_DIR = path.resolve("backup-staging");
const OUTPUT_DIR = path.resolve("backup-output");

// Maximum size per ZIP part (5 GB keeps files manageable for downloads & limits)
const MAX_ZIP_BYTES = 5 * 1024 * 1024 * 1024;

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

function getDate() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

/**
 * Break down staging directory into zip units (files/folders)
 * that each fit under maxBytes so multi-part grouping actually works
 * even when a single top-level folder (like pw-modules) is 10GB.
 */
function collectZipUnits(dir, maxBytes, basePath = dir) {
  const units = [];
  if (!fs.existsSync(dir)) return units;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(basePath, fullPath).replace(/\\/g, "/");

    // Metadata files are always included in every part separately
    if (["README.md", "backup-manifest.json", "logs"].includes(entry.name) && dir === basePath) {
      continue;
    }

    const size = entry.isDirectory() ? getDirSizeBytes(fullPath) : fs.statSync(fullPath).size;

    // If a folder exceeds maxBytes, drill down into its subfolders
    if (entry.isDirectory() && size > maxBytes) {
      const childUnits = collectZipUnits(fullPath, maxBytes, basePath);
      units.push(...childUnits);
    } else {
      units.push({ relPath, size });
    }
  }

  return units;
}

/**
 * Package a list of items inside sourceDir into outputPath.
 * If items is empty, packages the entire sourceDir.
 */
async function createZipArchive(outputPath, sourceDir, items = []) {
  // 1. Try native zip (Linux / macOS / Git Bash)
  if (hasNativeZip()) {
    console.log("⚡ Compressing with native zip binary...");
    try {
      const args = items.length === 0 ? ["."] : items.map((i) => `"${i}"`);
      execSync(`zip -q -r -1 "${outputPath}" ${args.join(" ")}`, {
        cwd: sourceDir,
        stdio: "inherit",
        maxBuffer: 1024 * 1024 * 100,
      });
      const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`✅ ZIP created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      return;
    } catch (e) {
      console.warn("⚠️ Native zip failed, trying alternative:", e.message);
    }
  }

  // 2. Try native tar with zip auto-deduction (Windows 10+, Linux, macOS)
  if (hasNativeTar()) {
    console.log("⚡ Compressing with native tar binary...");
    try {
      const args = items.length === 0 ? ["*"] : items.map((i) => `"${i}"`);
      execSync(`tar -a -c -f "${outputPath}" ${args.join(" ")}`, {
        cwd: sourceDir,
        stdio: "inherit",
        maxBuffer: 1024 * 1024 * 100,
      });
      const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`✅ ZIP created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      return;
    } catch (e) {
      console.warn("⚠️ Native tar failed, falling back to node archiver:", e.message);
    }
  }

  // 3. Fallback: node archiver library
  console.log("📦 Compressing with Node.js archiver...");
  const archiverFn = getArchiver();
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiverFn("zip", { zlib: { level: 1 } });

    output.on("close", () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(1);
      console.log(`✅ ZIP created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      resolve();
    });

    archive.on("error", reject);
    archive.pipe(output);

    if (items.length === 0) {
      archive.directory(sourceDir, false);
    } else {
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
    }

    archive.finalize();
  });
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

  const date = getDate();

  if (stagingSize <= MAX_ZIP_BYTES) {
    // Single ZIP fits within limit
    const zipName = `quizzy-backup-${date}.zip`;
    const zipPath = path.join(OUTPUT_DIR, zipName);
    console.log(`\n🗜️  Creating single ZIP archive: ${zipName}`);
    await createZipArchive(zipPath, STAGING_DIR);
  } else {
    // Collect fine-grained units so pw-modules or large directories can be split
    console.log(`\n⚠️  Staging size (${sizeMB} MB) > ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB limit.`);
    console.log(`🗂️  Partitioning into standalone ZIP parts...`);

    const units = collectZipUnits(STAGING_DIR, MAX_ZIP_BYTES);
    const alwaysInclude = ["README.md", "backup-manifest.json", "logs"].filter((f) =>
      fs.existsSync(path.join(STAGING_DIR, f))
    );

    const groups = [[]];
    let currentGroupSize = 0;

    for (const unit of units) {
      if (currentGroupSize + unit.size > MAX_ZIP_BYTES && groups[groups.length - 1].length > 0) {
        groups.push([]);
        currentGroupSize = 0;
      }
      groups[groups.length - 1].push(unit);
      currentGroupSize += unit.size;
    }

    console.log(`📦 Partitioned into ${groups.length} part(s).`);

    for (let i = 0; i < groups.length; i++) {
      const partNum = i + 1;
      const zipName = `quizzy-backup-${date}-part${partNum}.zip`;
      const zipPath = path.join(OUTPUT_DIR, zipName);
      const itemsToInclude = [...alwaysInclude, ...groups[i].map((u) => u.relPath)];

      console.log(`\n🗜️  Creating Part ${partNum}/${groups.length}: ${zipName}`);
      console.log(`   Contents: ${itemsToInclude.length} item(s)`);
      await createZipArchive(zipPath, STAGING_DIR, itemsToInclude);
    }
  }

  // List output files and update summary.md
  console.log("\n📦 Output archives generated:");
  let zipTable = "\n### 📦 Generated Archives\n| Archive | Size |\n|---|---|\n";
  let zipCount = 0;

  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    if (f.endsWith(".zip")) {
      zipCount++;
      const size = (fs.statSync(path.join(OUTPUT_DIR, f)).size / 1024 / 1024).toFixed(1);
      console.log(`   ${f}  (${size} MB)`);
      zipTable += `| \`${f}\` | ${size} MB |\n`;
    }
  }

  const summaryFile = path.join(OUTPUT_DIR, "summary.md");
  if (zipCount > 0 && fs.existsSync(summaryFile)) {
    fs.appendFileSync(summaryFile, zipTable);
  }
}

main().catch((err) => {
  console.error("💥 ZIP creation failed:", err);
  process.exit(1);
});
