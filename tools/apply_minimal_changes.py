import os
import sys
import json

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

DATA_DIR = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY\data"
MANIFEST_PATH = os.path.join(DATA_DIR, "manifest.json")

# Files to delete
FILES_TO_DELETE = [
    "Allen26_mole_concept.json",
    "allen26-Atomic_structure.json",
    "allen26_Units,Dimensions_and_Measurement.json",
    "allen_26_Classification_and_Nomenclature.json",
    "basic-maths-elp.json",
    "unacademy_module_mole_concept.json",
    "unit_&_dimensn_mrsir_crash-course21.json"
]

def apply_changes():
    # 1. Update manifest.json
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    subsections = data.get('subsections', [])
    new_subsections = []

    for s in subsections:
        name = s.get('name', '')
        
        # 1] Delete Allen, Unacademy, and Mr sir crash course dpp (keep Allen PYQs)
        if name in ['Allen', 'Unacademy', 'Mr sir crash course dpp']:
            print(f"Removing subsection: {name}")
            continue

        # 2] & 3] JEE Chapterwise PYQs with Solutions -> Add (Allen) in bracket and use distinct emoji (⚛️)
        if 'JEE Chapterwise PYQs' in name or s.get('displayName') == 'JEE Chapterwise PYQs with Solutions':
            s['name'] = "⚛️ JEE Chapterwise (Allen PYQs)"
            s['displayName'] = "JEE Chapterwise PYQs with Solutions (Allen Bank)"
            s['icon'] = "⚛️"
            print("Updated JEE Chapterwise PYQs section with Allen in brackets and ⚛️ icon.")

        # 2] PW Digital Books & Modules -> Use distinct emoji (🔥)
        if name in ['PW Digital Books & Modules', 'Physics Wallah Digital Modules & Books']:
            s['icon'] = "🔥"
            print("Updated PW Digital Books & Modules icon to 🔥.")

        new_subsections.append(s)

    data['subsections'] = new_subsections

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Manifest updated successfully.")

    # 2. Delete the loose files from disk
    for fn in FILES_TO_DELETE:
        fp = os.path.join(DATA_DIR, fn)
        if os.path.exists(fp):
            try:
                os.remove(fp)
                print(f"Deleted file: {fn}")
            except Exception as e:
                print(f"Could not delete {fn}: {e}")
        else:
            print(f"File not found on disk: {fn}")

if __name__ == '__main__':
    apply_changes()
