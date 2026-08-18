# Adding tests to Test Cafe

Drop a folder of test JSONs in, and Test Cafe picks it up. The importer
validates every file, copies it into `data/`, and rewrites
`data/test-manifest.json` for you.

## The easy way (Windows)

**Drag a folder onto `tools/import-tests.bat` and drop it.** That's it.

Double-click the `.bat` with nothing to import and it prints the help text
plus everything currently in Test Cafe.

## The terminal way

Run from the `QUIZZY` folder:

```sh
node tools/import-tests.js "../pw test"
```

Subfolders become browsable folders, and each `.json` inside becomes a test.
So this layout:

```
pw test/
└── Yakeen NEET 2.0 2024/
    ├── AITS - 01.json
    └── Practice Test 02.json
```

shows up in Test Cafe as **PW Test › Yakeen NEET 2.0 2024 › AITS - 01**.

### Common jobs

```sh
# Import a whole source folder, naming the section yourself
node tools/import-tests.js "../allen test" --as "Allen Test" --icon "🅰"

# Add just one new chapter into a section that already exists
node tools/import-tests.js "../allen test/meu-2026_Ready_JSONs" --under "Allen Test"

# See what's in Test Cafe right now
node tools/import-tests.js --list

# Check what an import would do, without writing anything
node tools/import-tests.js "../some folder" --dry-run

# Delete a section and its files
node tools/import-tests.js --remove "PW Test"
```

### Options

| Option | What it does |
| --- | --- |
| `--as <name>` | Section name shown in Test Cafe. Defaults to the folder name, tidied up. |
| `--under <path>` | Nest inside an existing section. Use `/` to go deeper: `--under "Allen Test/Mazl 2026"`. Missing levels are created. |
| `--icon <emoji>` | Icon for the section. |
| `--flat` | Ignore subfolders — list every test in one flat section. |
| `--dry-run`, `-n` | Report what would change, write nothing. |
| `--strict` | Stop on the first bad file. Default is to skip it and carry on. |
| `--no-prune` | Keep files in the section's folder that are no longer in the source. |
| `--bump-sw` | Also bump the service-worker cache version. |
| `--list` | Print the current manifest tree. |
| `--remove <path>` | Delete a section and its data files. |

## Things worth knowing

**Re-importing is safe.** Importing a section that already exists replaces it
in place rather than duplicating it, and files dropped from the source folder
are cleaned out of `data/` too. Re-run it whenever the source folder changes.

**Bad files are skipped, not fatal.** A file is rejected if it isn't valid JSON,
or if it has no questions the test engine can find (Test Cafe would refuse to
open it anyway). You get a list of what was skipped and why. Use `--strict` to
turn those into a hard stop.

**Question Cafe is never touched.** The importer only writes
`data/test-manifest.json` and the section's own folder under `data/`.
`data/manifest.json` and the loose `.json` files at the root of `data/` are
left alone.

**Folder names on disk are lowercased** (`data/allen-test/mazl-2026/`) and
kept exactly in sync with the manifest, so the paths still resolve on
case-sensitive hosting like GitHub Pages. The display names in Test Cafe keep
their normal capitals.

**A test's title comes from its filename**, minus the `.json`. Rename the file
if you want the label to read differently.

**Accepted test shapes** — the importer accepts anything `test-engine.js` can
read: `{ sections: [...] }`, `{ subjects: [...] }`, `{ chapters: [...] }`,
`{ questions: [...] }`, or a bare array of questions.

**Offline caching.** `data/*.json` is served network-first by the service
worker, so new tests appear on a normal reload — no cache bump needed. Pass
`--bump-sw` only if you're also shipping CSS/JS changes.
