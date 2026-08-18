#!/usr/bin/env node
/* ============================================================
   Quizzy — Test Cafe folder importer

   Point it at any folder of test JSONs and it does the rest:
   validates every file, copies them into data/, and rewrites
   data/test-manifest.json so they show up in Test Cafe.

     node tools/import-tests.js "C:\path\to\pw test"
     node tools/import-tests.js "..\allen test\meb-2026_Ready_JSONs" --under "Allen Test"

   Re-importing the same section replaces it in place, so running
   it twice is safe. Only data/test-manifest.json and the section's
   own folder under data/ are ever written — Question Cafe's
   data/manifest.json is never touched.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const QUIZZY_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(QUIZZY_ROOT, 'data');
const MANIFEST_PATH = path.join(DATA_DIR, 'test-manifest.json');
const SW_PATH = path.join(QUIZZY_ROOT, 'sw.js');

// ==================== CLI ====================
function parseArgs(argv) {
    const opts = {
        source: null, as: null, under: null, icon: null,
        dryRun: false, strict: false, prune: true, flat: false,
        list: false, remove: null, bumpSw: false, help: false
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        switch (a) {
            case '--as': opts.as = next(); break;
            case '--under': opts.under = next(); break;
            case '--icon': opts.icon = next(); break;
            case '--remove': opts.remove = next(); break;
            case '--list': opts.list = true; break;
            case '--dry-run': case '-n': opts.dryRun = true; break;
            case '--strict': opts.strict = true; break;
            case '--no-prune': opts.prune = false; break;
            case '--flat': opts.flat = true; break;
            case '--bump-sw': opts.bumpSw = true; break;
            case '--help': case '-h': opts.help = true; break;
            default:
                if (a.startsWith('-')) fail(`Unknown option: ${a}`);
                else if (opts.source === null) opts.source = a;
                else fail(`Unexpected extra argument: ${a}\nQuote paths that contain spaces.`);
        }
    }
    return opts;
}

const HELP = `
Quizzy Test Cafe importer

  node tools/import-tests.js <folder> [options]

Imports a folder of test JSONs into Test Cafe. Subfolders become
browsable folders; each .json becomes a test.

Options
  --as <name>      Name shown in Test Cafe   (default: folder name, tidied)
  --under <path>   Nest inside an existing section, e.g. --under "Allen Test"
                   Use "/" to go deeper:     --under "Allen Test/Mazl 2026"
  --icon <emoji>   Icon for the section      (default: auto)
  --flat           Ignore subfolders; list every test in one flat section
  --dry-run, -n    Show what would change, write nothing
  --strict         Abort if any JSON is invalid (default: skip it and carry on)
  --no-prune       Keep stale files in the section's data folder
  --bump-sw        Also bump the service-worker cache version
  --list           Print the current manifest tree and exit
  --remove <path>  Delete a section (and its data folder), e.g. --remove "PW Test"
  --help, -h       This message

Examples
  node tools/import-tests.js "../pw test"
  node tools/import-tests.js "../allen test" --as "Allen Test" --icon "🅰"
  node tools/import-tests.js "../allen test/meu-2026_Ready_JSONs" --under "Allen Test"
  node tools/import-tests.js --list
  node tools/import-tests.js --remove "PW Test"
`;

function fail(msg) {
    console.error('\n  ✗ ' + msg + '\n');
    process.exit(1);
}

// ==================== helpers ====================
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/* "meb-2026_Ready_JSONs" -> "Meb 2026" ; "Yakeen NEET 2.0 2024" -> unchanged */
function prettyName(folderName) {
    const cleaned = folderName
        .replace(/[_-]?Ready[_-]?JSONs?$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
    if (/[a-z]/.test(cleaned) && /[A-Z]/.test(cleaned)) return cleaned;  // already mixed case, leave it
    return cleaned.split(/\s+/).map(w => {
        if (!w) return w;
        if (/^\d/.test(w)) return w;                     // 2026, 2.0
        if (w.length <= 4 && w === w.toUpperCase()) return w;  // NEET, AITS
        return w[0].toUpperCase() + w.slice(1);
    }).join(' ');
}

/* Directory name on disk: lowercase, URL-safe, stable. */
function slugSegment(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
}

/* Filenames keep their original text (it becomes the test's label in the UI)
   but must stay safe for a URL path and for Windows. */
function safeFileName(name) {
    return name.replace(/[<>:"|?*\\]/g, '-').replace(/\s+/g, ' ').trim();
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

/* Deletes now-empty folders from `dir` upwards, stopping at data/ itself so
   Question Cafe's files at the data/ root are never in scope. */
function removeEmptyDirsUpTo(dir) {
    let current = path.resolve(dir);
    const stop = path.resolve(DATA_DIR);
    while (current.startsWith(stop) && current !== stop) {
        if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) return;
        fs.rmdirSync(current);
        current = path.dirname(current);
    }
}

/* Windows keeps a folder's existing spelling when you re-create it with
   different capitals, which would leave data/Mazl-2026 on disk while the
   manifest points at data/mazl-2026 — fine locally, a 404 on any
   case-sensitive host. So create each level with the exact casing we want,
   renaming any level that only differs by case. */
function ensureDirExact(absPath) {
    const rel = path.relative(DATA_DIR, absPath);
    let current = DATA_DIR;
    ensureDir(current);
    for (const segment of rel.split(path.sep).filter(Boolean)) {
        const siblings = fs.readdirSync(current);
        const clash = siblings.find(s => s.toLowerCase() === segment.toLowerCase());
        if (clash === undefined) {
            fs.mkdirSync(path.join(current, segment));
        } else if (clash !== segment) {
            // Case-only rename needs a detour through a temp name on Windows.
            const temp = path.join(current, `${segment}.__case__${process.pid}`);
            fs.renameSync(path.join(current, clash), temp);
            fs.renameSync(temp, path.join(current, segment));
        }
        current = path.join(current, segment);
    }
    return current;
}

/* Same hazard one level down: an existing file whose name differs only by
   case would silently keep its old spelling. */
function copyExact(src, destDir, destName) {
    const existing = fs.readdirSync(destDir)
        .find(s => s.toLowerCase() === destName.toLowerCase());
    if (existing !== undefined && existing !== destName) {
        fs.unlinkSync(path.join(destDir, existing));
    }
    fs.copyFileSync(src, path.join(destDir, destName));
}

function readManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        return { name: 'Quizzy Tests', subsections: [] };
    }
    try {
        const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        if (!m || typeof m !== 'object') throw new Error('not an object');
        if (!Array.isArray(m.subsections)) m.subsections = [];
        return m;
    } catch (e) {
        fail(`data/test-manifest.json is not valid JSON (${e.message}).\n    Fix or delete it, then run again.`);
    }
}

function writeManifest(manifest) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

/* Mirrors normalizeTest() in test-engine.js: which shapes hold questions. */
function countQuestions(raw) {
    const lenOf = s => (Array.isArray(s.questions) ? s.questions.length
        : Array.isArray(s.qs) ? s.qs.length : 0);
    if (Array.isArray(raw)) return raw.filter(q => q && q.is_active !== false).length;
    if (!raw || typeof raw !== 'object') return 0;
    if (Array.isArray(raw.sections)) return raw.sections.reduce((n, s) => n + lenOf(s), 0);
    if (Array.isArray(raw.subjects)) return raw.subjects.reduce((n, s) => n + lenOf(s), 0);
    if (Array.isArray(raw.chapters)) {
        return raw.chapters.reduce((n, ch) => n + (ch.topics || [])
            .reduce((m, t) => m + (Array.isArray(t.questions) ? t.questions.length : 0), 0), 0);
    }
    if (Array.isArray(raw.questions)) return raw.questions.length;
    return 0;
}

function validateFile(fullPath) {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (e) {
        return { ok: false, reason: 'invalid JSON — ' + e.message.split('\n')[0] };
    }
    const n = countQuestions(raw);
    if (n === 0) return { ok: false, reason: 'no questions found (Test Cafe would reject it)' };
    return { ok: true, questions: n };
}

// ==================== manifest tree ====================
function findChild(node, name) {
    return (node.subsections || []).find(s =>
        String(s.name).toLowerCase() === String(name).toLowerCase());
}

/* Walks --under, creating missing levels. Returns the parent node. */
function resolveParent(manifest, underPath, dryRun) {
    let node = manifest;
    for (const rawSeg of underPath) {
        const seg = rawSeg.trim();
        if (!seg) continue;
        if (!Array.isArray(node.subsections)) node.subsections = [];
        let child = findChild(node, seg);
        if (!child) {
            child = { name: seg, icon: '📁', subsections: [] };
            node.subsections.push(child);
            if (!dryRun) console.log(`  + created missing section "${seg}"`);
        }
        node = child;
    }
    if (!Array.isArray(node.subsections)) node.subsections = [];
    return node;
}

function collectFiles(node, out) {
    out = out || [];
    (node.files || []).forEach(f => { if (!out.includes(f)) out.push(f); });
    (node.subsections || []).forEach(s => collectFiles(s, out));
    return out;
}

function printTree(node, depth) {
    depth = depth || 0;
    const pad = '  '.repeat(depth + 1);
    (node.subsections || []).forEach(s => {
        const n = collectFiles(s).length;
        console.log(`${pad}${s.icon || '📁'} ${s.name}  (${n} test${n === 1 ? '' : 's'})`);
        printTree(s, depth + 1);
    });
    (node.files || []).forEach(f => {
        console.log(`${pad}  📝 ${path.basename(f).replace(/\.json$/i, '')}`);
    });
}

// ==================== source scanning ====================
/* Folders that repeat their own name (pw test/Yakeen 2024/Yakeen 2024/*.json)
   add a pointless tap in the UI, so descend through those. Only a same-named
   single child is collapsed — a differently named one is real structure and
   must stay browsable. */
function descendThroughWrappers(dir) {
    for (;;) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const subdirs = entries.filter(e => e.isDirectory());
        const jsons = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.json'));
        const repeatsParent = subdirs.length === 1 && jsons.length === 0 &&
            slugSegment(subdirs[0].name) === slugSegment(path.basename(dir));
        if (repeatsParent) {
            dir = path.join(dir, subdirs[0].name);
            continue;
        }
        return dir;
    }
}

/* Builds the manifest node for one source folder, copying as it goes.
   dataRel is the folder under data/ that this node's files live in. */
function buildNode(srcDir, displayName, icon, dataRel, ctx) {
    srcDir = descendThroughWrappers(srcDir);
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    const jsonNames = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.json'))
        .map(e => e.name).sort(naturalSort);
    const subdirNames = entries.filter(e => e.isDirectory())
        .map(e => e.name).sort(naturalSort);

    const files = [];
    for (const name of jsonNames) {
        const src = path.join(srcDir, name);
        const check = validateFile(src);
        if (!check.ok) {
            ctx.rejected.push({ file: path.relative(ctx.sourceRoot, src) || name, reason: check.reason });
            if (ctx.strict) fail(`${src}\n    ${check.reason}\n    (running with --strict)`);
            continue;
        }
        const outName = safeFileName(name);
        const rel = `${dataRel}/${outName}`;
        if (ctx.seenRel.has(rel.toLowerCase())) {
            ctx.rejected.push({ file: name, reason: 'duplicate destination name, skipped' });
            continue;
        }
        ctx.seenRel.add(rel.toLowerCase());

        if (!ctx.dryRun) {
            const destDir = ensureDirExact(path.join(DATA_DIR, dataRel));
            copyExact(src, destDir, outName);
        }
        ctx.written.add(path.join(dataRel, outName).replace(/\\/g, '/').toLowerCase());
        files.push(rel);
        ctx.imported++;
        ctx.questions += check.questions;
    }

    let subsections = [];
    if (ctx.flat) {
        // pull every nested test up into this one node
        for (const sub of subdirNames) {
            const child = buildNode(path.join(srcDir, sub), sub, null, dataRel, ctx);
            files.push(...collectFiles(child));
        }
        files.sort(naturalSort);
    } else {
        subsections = subdirNames.map(sub => buildNode(
            path.join(srcDir, sub),
            prettyName(sub),
            null,
            `${dataRel}/${slugSegment(prettyName(sub))}`,
            ctx
        )).filter(n => collectFiles(n).length > 0);
    }

    const node = { name: displayName, icon: icon || '📁' };
    if (files.length) node.files = files;
    node.subsections = subsections;
    return node;
}

/* Removes files under data/<dataRel> that this import did not write. */
function pruneStale(dataRel, ctx) {
    const root = path.join(DATA_DIR, dataRel);
    if (!fs.existsSync(root)) return 0;
    let removed = 0;
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                walk(full);
                if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
            } else {
                const rel = path.relative(DATA_DIR, full).split(path.sep).join('/').toLowerCase();
                if (!ctx.written.has(rel)) { fs.unlinkSync(full); removed++; }
            }
        }
    };
    walk(root);
    removeEmptyDirsUpTo(root);
    return removed;
}

function bumpServiceWorker() {
    if (!fs.existsSync(SW_PATH)) return null;
    const txt = fs.readFileSync(SW_PATH, 'utf8');
    const m = txt.match(/const CACHE_VERSION = '([a-z-]*?)(\d+)';/i);
    if (!m) return null;
    const next = `${m[1]}${Number(m[2]) + 1}`;
    fs.writeFileSync(SW_PATH, txt.replace(m[0], `const CACHE_VERSION = '${next}';`), 'utf8');
    return next;
}

// ==================== commands ====================
function cmdList() {
    const manifest = readManifest();
    const total = collectFiles(manifest).length;
    console.log(`\n  ${manifest.name} — ${total} test${total === 1 ? '' : 's'}\n`);
    if (!(manifest.subsections || []).length) console.log('  (empty)');
    printTree(manifest, 0);
    console.log('');
}

function cmdRemove(targetPath) {
    const manifest = readManifest();
    const segs = targetPath.split('/').map(s => s.trim()).filter(Boolean);
    if (!segs.length) fail('--remove needs a section path, e.g. --remove "PW Test"');

    let parent = manifest;
    for (let i = 0; i < segs.length - 1; i++) {
        const child = findChild(parent, segs[i]);
        if (!child) fail(`No section "${segs.slice(0, i + 1).join('/')}" in the manifest.`);
        parent = child;
    }
    const leafName = segs[segs.length - 1];
    const idx = (parent.subsections || []).findIndex(s =>
        String(s.name).toLowerCase() === leafName.toLowerCase());
    if (idx === -1) fail(`No section "${targetPath}" in the manifest.`);

    const removed = parent.subsections[idx];
    const files = collectFiles(removed);
    parent.subsections.splice(idx, 1);

    // Delete the data folder only if nothing left in the manifest points into it.
    const stillReferenced = new Set(collectFiles(manifest).map(f => f.toLowerCase()));
    let deleted = 0;
    const dirs = new Set(files.map(f => f.split('/').slice(0, -1).join('/')).filter(Boolean));
    files.forEach(f => {
        if (stillReferenced.has(f.toLowerCase())) return;
        const full = path.join(DATA_DIR, f);
        if (fs.existsSync(full)) { fs.unlinkSync(full); deleted++; }
    });
    [...dirs].sort((a, b) => b.length - a.length)
        .forEach(d => removeEmptyDirsUpTo(path.join(DATA_DIR, d)));

    writeManifest(manifest);
    console.log(`\n  ✓ Removed "${targetPath}" — ${deleted} file${deleted === 1 ? '' : 's'} deleted from data/\n`);
}

function cmdImport(opts) {
    const source = path.resolve(opts.source);
    if (!fs.existsSync(source)) fail(`Folder not found:\n    ${source}`);
    if (!fs.statSync(source).isDirectory()) fail(`Not a folder:\n    ${source}`);
    if (source.toLowerCase().startsWith(DATA_DIR.toLowerCase())) {
        fail(`That folder is inside data/ — it is already imported.\n    ${source}`);
    }

    const displayName = opts.as || prettyName(path.basename(source));
    const underPath = opts.under ? opts.under.split('/').map(s => s.trim()).filter(Boolean) : [];
    const fullPath = [...underPath, displayName];
    const dataRel = fullPath.map(p => slugSegment(p)).join('/');

    console.log(`\n  Source   ${source}`);
    console.log(`  Section  ${fullPath.join(' › ')}`);
    console.log(`  Data     data/${dataRel}/`);
    if (opts.dryRun) console.log(`  Mode     DRY RUN — nothing will be written`);
    console.log('');

    const manifest = readManifest();

    // Guard: another section already writing into this data folder?
    const parentPreview = JSON.parse(JSON.stringify(manifest));
    const others = collectFiles(parentPreview).filter(f => f.toLowerCase().startsWith(dataRel.toLowerCase() + '/'));
    const parent = resolveParent(manifest, underPath, opts.dryRun);
    const existingIdx = (parent.subsections || []).findIndex(s =>
        String(s.name).toLowerCase() === displayName.toLowerCase());
    if (others.length && existingIdx === -1) {
        fail(`data/${dataRel}/ is already used by another section.\n    Pick a different --as name.`);
    }

    const ctx = {
        sourceRoot: source, dryRun: opts.dryRun, strict: opts.strict, flat: opts.flat,
        rejected: [], imported: 0, questions: 0, seenRel: new Set(), written: new Set()
    };

    const node = buildNode(source, displayName, opts.icon || (existingIdx !== -1
        ? parent.subsections[existingIdx].icon : null), dataRel, ctx);

    if (ctx.imported === 0) {
        fail(`No usable test JSON files found in that folder.` +
            (ctx.rejected.length ? `\n    ${ctx.rejected.length} file(s) were rejected — see above.` : ''));
    }

    if (existingIdx !== -1) {
        parent.subsections[existingIdx] = node;
        console.log(`  ↻ replaced existing section "${displayName}"`);
    } else {
        parent.subsections.push(node);
        console.log(`  + added new section "${displayName}"`);
    }

    let pruned = 0;
    if (!opts.dryRun) {
        writeManifest(manifest);
        if (opts.prune) pruned = pruneStale(dataRel, ctx);
    }

    // ---- report ----
    const folderCount = (function count(n) {
        return (n.subsections || []).reduce((acc, s) => acc + 1 + count(s), 0);
    })(node);

    console.log('');
    console.log(`  ✓ ${ctx.imported} test${ctx.imported === 1 ? '' : 's'} imported` +
        (folderCount ? ` across ${folderCount} folder${folderCount === 1 ? '' : 's'}` : '') +
        ` — ${ctx.questions.toLocaleString()} questions`);
    if (pruned) console.log(`  ✓ ${pruned} stale file${pruned === 1 ? '' : 's'} removed from data/${dataRel}/`);

    if (ctx.rejected.length) {
        console.log(`\n  ⚠ ${ctx.rejected.length} file${ctx.rejected.length === 1 ? '' : 's'} skipped:`);
        ctx.rejected.slice(0, 15).forEach(r => console.log(`      ${r.file}\n        ${r.reason}`));
        if (ctx.rejected.length > 15) console.log(`      …and ${ctx.rejected.length - 15} more`);
    }

    if (opts.bumpSw && !opts.dryRun) {
        const v = bumpServiceWorker();
        if (v) console.log(`\n  ✓ service worker cache bumped to ${v}`);
    }

    if (opts.dryRun) {
        console.log(`\n  Dry run only — re-run without --dry-run to apply.\n`);
    } else {
        console.log(`\n  Open test-cafe.html — "${fullPath.join(' › ')}" is live.\n`);
    }
}

// ==================== main ====================
function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(HELP); return; }
    if (opts.list) { cmdList(); return; }
    if (opts.remove !== null) { cmdRemove(opts.remove); return; }
    if (!opts.source) { console.log(HELP); process.exit(1); }
    cmdImport(opts);
}

main();
