/**
 * QUIZZY Backup — ZIP Creator
 * ============================================================
 * Takes the backup-staging/ folder and packages it into one or
 * more ZIP files (max 8GB each to stay under GitHub's 10GB
 * artifact limit).
 *
 * Output: backup-output/quizzy-backup-YYYY-MM-DD[-partN].zip
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STAGING_DIR = path.resolve("backup-staging");
const OUTPUT_DIR = path.resolve("backup-output");

function hasNativeZip() {
  try {
    const cmd = process.platform === "win32" ? "where zip" : "which zip";
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getArchiver() {
  try {
    return require("archiver");
  } catch {
    console.log("📦 Installing archiver...");
    execSync("npm install archiver --no-save", { stdio: "inherit" });
    return require("archiver");
  }
}

const MAX_ZIP_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB per ZIP part

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

async function createZip(outputPath, sourceDir) {
  if (hasNativeZip()) {
    console.log("⚡ Using native zip binary for fast compression...");
    try {
      execSync(`zip -q -r "${outputPath}" .`, {
        cwd: sourceDir,
        stdio: "inherit",
        maxBuffer: 1024 * 1024 * 50,
      });
      const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`✅ ZIP created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      return;
    } catch (e) {
      console.warn("⚠️ Native zip failed, falling back to node archiver:", e.message);
    }
  }

  const archiver = getArchiver();
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(1);
      console.log(`✅ ZIP created: ${path.basename(outputPath)} (${sizeMB} MB)`);
      resolve();
    });

    archive.on("error", reject);
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") throw err;
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
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
    // Single ZIP
    const zipName = `quizzy-backup-${date}.zip`;
    const zipPath = path.join(OUTPUT_DIR, zipName);
    console.log(`\n🗜️  Creating ZIP: ${zipName}`);
    await createZip(zipPath, STAGING_DIR);
  } else {
    // Split into parts — collect top-level subdirs + files
    console.log(`\n⚠️  Staging > 8GB. Splitting into multiple ZIPs...`);
    const archiver = getArchiver();

    const entries = fs.readdirSync(STAGING_DIR, { withFileTypes: true });
    const groups = [[]];
    let currentSize = 0;
    let part = 1;

    for (const entry of entries) {
      const full = path.join(STAGING_DIR, entry.name);
      const entrySize = entry.isDirectory()
        ? getDirSizeBytes(full)
        : fs.statSync(full).size;

      if (currentSize + entrySize > MAX_ZIP_BYTES && groups[groups.length - 1].length > 0) {
        groups.push([]);
        currentSize = 0;
        part++;
      }
      groups[groups.length - 1].push({ entry, full, entrySize });
      currentSize += entrySize;
    }

    for (let i = 0; i < groups.length; i++) {
      const partNum = i + 1;
      const zipName = `quizzy-backup-${date}-part${partNum}.zip`;
      const zipPath = path.join(OUTPUT_DIR, zipName);
      console.log(`\n🗜️  Creating ZIP part ${partNum}/${groups.length}: ${zipName}`);

      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 6 } });

        output.on("close", () => {
          const sizeMBPart = (archive.pointer() / 1024 / 1024).toFixed(1);
          console.log(`✅ ${zipName} created (${sizeMBPart} MB)`);
          resolve();
        });

        archive.on("error", reject);
        archive.pipe(output);

        // Always include README and manifest in every part
        const alwaysInclude = ["README.md", "backup-manifest.json", "logs"];
        for (const name of alwaysInclude) {
          const p = path.join(STAGING_DIR, name);
          if (fs.existsSync(p)) {
            const stat = fs.statSync(p);
            if (stat.isDirectory()) archive.directory(p, name);
            else archive.file(p, { name });
          }
        }

        for (const { entry, full } of groups[i]) {
          if (alwaysInclude.includes(entry.name)) continue;
          if (entry.isDirectory()) archive.directory(full, entry.name);
          else archive.file(full, { name: entry.name });
        }

        archive.finalize();
      });
    }
  }

  // List output files
  console.log("\n📦 Output files:");
  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    if (f.endsWith(".zip")) {
      const size = (fs.statSync(path.join(OUTPUT_DIR, f)).size / 1024 / 1024).toFixed(1);
      console.log(`   ${f}  (${size} MB)`);
    }
  }
}

main().catch((err) => {
  console.error("💥 ZIP creation failed:", err);
  process.exit(1);
});
