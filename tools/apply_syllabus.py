#!/usr/bin/env python3
import os, sys, json, re

QUIZZY_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(QUIZZY_ROOT, 'data')
MANIFEST_PATH = os.path.join(DATA_DIR, 'test-manifest.json')

def normalize_name(s):
    if not s: return ''
    s = s.lower().strip()
    s = re.sub(r'\.json$', '', s, flags=re.IGNORECASE)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return ' '.join(s.split())

def apply_syllabus(syllabus_file_path):
    print(f'Loading syllabus file: {syllabus_file_path}')
    with open(syllabus_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Accept either list of batches or dict
    batches = data if isinstance(data, list) else [data]

    # Build lookup: (folder_name, normalized_test_name) -> syllabus_obj
    lookup = {}
    total_syllabi_in_file = 0

    for b in batches:
        b_folders = b.get('folders', [])
        tests = b.get('tests', [])
        for t in tests:
            syl = t.get('syllabus')
            if not syl or not syl.get('content'):
                continue
            total_syllabi_in_file += 1
            t_name = t.get('testName', '')
            norm_t = normalize_name(t_name)

            for folder in b_folders:
                lookup[(folder.lower(), norm_t)] = syl
            # Also store by norm_t alone as fallback
            if norm_t not in lookup:
                lookup[norm_t] = syl

    print(f'Loaded {total_syllabi_in_file} test syllabi across {len(batches)} batches.')

    # Scan and update files in QUIZZY/data/pw-test
    pw_test_dir = os.path.join(DATA_DIR, 'pw-test')
    updated_files = 0
    file_to_syllabus = {}

    for root, dirs, files in os.walk(pw_test_dir):
        folder_name = os.path.basename(root).lower()
        for file in files:
            if not file.endswith('.json'):
                continue
            file_path = os.path.join(root, file)
            norm_f = normalize_name(file)

            syl = lookup.get((folder_name, norm_f)) or lookup.get(norm_f)
            if syl:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        test_json = json.load(f)
                    
                    test_json['syllabus'] = syl
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(test_json, f, indent=2, ensure_ascii=False)
                    
                    rel_path = os.path.relpath(file_path, DATA_DIR).replace('\\', '/')
                    file_to_syllabus[rel_path.lower()] = syl
                    updated_files += 1
                except Exception as e:
                    print(f'Error updating {file_path}: {e}')

    print(f'Successfully updated {updated_files} test JSON files in pw-test!')

    # Update test-manifest.json
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
            manifest = json.load(f)

        manifest_updated = [0]
        def update_node(node):
            if 'files' in node:
                new_files = []
                for entry in node['files']:
                    if isinstance(entry, str):
                        p = entry.replace('\\', '/').lower()
                        if p in file_to_syllabus:
                            base = os.path.basename(entry).replace('.json', '')
                            new_files.append({
                                'path': entry,
                                'displayName': base,
                                'syllabus': file_to_syllabus[p]
                            })
                            manifest_updated[0] += 1
                        else:
                            new_files.append(entry)
                    elif isinstance(entry, dict):
                        p = entry.get('path', '').replace('\\', '/').lower()
                        if p in file_to_syllabus:
                            entry['syllabus'] = file_to_syllabus[p]
                            manifest_updated[0] += 1
                        new_files.append(entry)
                node['files'] = new_files

            if 'subsections' in node:
                for sub in node['subsections']:
                    update_node(sub)

        update_node(manifest)
        with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        print(f'Updated {manifest_updated[0]} file entries in test-manifest.json!')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python apply_syllabus.py <path_to_syllabus_json>')
        sys.exit(1)
    apply_syllabus(sys.argv[1])
