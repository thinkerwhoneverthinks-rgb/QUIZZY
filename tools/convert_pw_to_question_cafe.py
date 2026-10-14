import os
import sys
import zipfile
import json
import re

# Ensure stdout handles utf-8 properly on Windows
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

SOURCE_ROOT = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\my-original-file\pw-book-add"
TARGET_DATA_ROOT = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY\data"
TARGET_MODULES_DIR = os.path.join(TARGET_DATA_ROOT, "pw-modules")
MANIFEST_PATH = os.path.join(TARGET_DATA_ROOT, "manifest.json")

NOTICE_NOTE = (
    "📝 **Practice Exercise Notice:**\n"
    "This is an open practice exercise (or it may have an alternate rendering format / bug in rendering). A direct option key is not applicable.\n\n"
    "Please refer to the step-by-step solution diagram and video lecture below for the verified answer and complete derivation."
)

def slugify(text):
    text = str(text or 'unknown').lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-') or 'default'

def pretty_book_name(zip_filename):
    name = zip_filename[:-4] if zip_filename.endswith('.zip') else zip_filename
    name = name.replace('_Digital Module_', '(Digital Module)')
    name = name.replace('_Digital Book_', '(Digital Book)')
    name = name.replace('_Class XI_', '(Class 11)')
    name = name.replace('_Class XII_', '(Class 12)')
    name = name.replace('_Class 11th Digital Book_', '(Class 11)')
    name = name.replace('_Class 12th Digital Book_', '(Class 12)')
    name = name.replace('_2025-1978_', '(1978-2025)')
    name = name.replace('_', ' ')
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def derive_embed_url(url):
    if not url:
        return None
    url_str = str(url).strip()
    m = re.search(r'(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})', url_str)
    if m:
        return f"https://www.youtube-nocookie.com/embed/{m.group(1)}"
    if '/embed/' in url_str:
        return url_str.replace('youtube.com', 'youtube-nocookie.com')
    return url_str

def resolve_correct_indices(q, options):
    correct_ids = q.get('correctOptionIds') or []
    if not isinstance(correct_ids, list):
        correct_ids = [correct_ids]
        
    indices = []
    opts = q.get('options') or []
    id_to_idx = {opt.get('id'): idx for idx, opt in enumerate(opts) if isinstance(opt, dict) and 'id' in opt}
    
    for cid in correct_ids:
        if cid in id_to_idx:
            indices.append(id_to_idx[cid])
            
    if not indices:
        return 0
    return indices

def convert_question(q, idx, exercise_name, chapter_name):
    raw_type = str(q.get('type', '')).strip()
    q_id = q.get('id') or f"q_{idx + 1}"
    q_num = q.get('number', idx + 1)
    
    imgs = q.get('images', {})
    image_url = imgs.get('en') if isinstance(imgs, dict) else None
    if not image_url and isinstance(imgs, dict) and imgs:
        image_url = next(iter(imgs.values()), None)
        
    video_info = None
    exp_image = None
    sols = q.get('solutions') or []
    if sols and isinstance(sols, list):
        first_sol = sols[0] if isinstance(sols[0], dict) else {}
        
        sol_imgs = first_sol.get('images', {})
        if isinstance(sol_imgs, dict):
            exp_image = sol_imgs.get('en') or next(iter(sol_imgs.values()), None)
            
        v = first_sol.get('video')
        if isinstance(v, dict):
            v_url = v.get('embedCode') or v.get('url')
            if v_url:
                video_info = {
                    "url": v_url,
                    "embed_url": derive_embed_url(v_url),
                    "thumbnail": v.get('image', ''),
                    "title": v.get('name') or f"Question {q_num} Video Solution",
                    "duration": v.get('duration', '')
                }

    if raw_type in ['Notebook', 'Subjective']:
        target_type = "fill_blank"
        options = None
        correct = None
        answer = "Subjective / Notebook Exercise — Refer to Solution Below"
        explanation = NOTICE_NOTE
    elif raw_type == 'Numeric':
        target_type = "integer"
        options = None
        correct = None
        raw_ans = q.get('numericAnswer', '')
        answer = str(raw_ans).strip() if raw_ans is not None else ""
        explanation = ""
    elif raw_type == 'Multiple':
        target_type = "multi_mcq"
        raw_opts = q.get('options') or []
        options = ["A", "B", "C", "D"] if len(raw_opts) <= 4 else [chr(65 + i) for i in range(len(raw_opts))]
        correct = resolve_correct_indices(q, options)
        answer = None
        explanation = ""
    else:
        target_type = "mcq"
        raw_opts = q.get('options') or []
        options = ["A", "B", "C", "D"] if len(raw_opts) <= 4 else [chr(65 + i) for i in range(len(raw_opts))]
        res = resolve_correct_indices(q, options)
        correct = res[0] if isinstance(res, list) and res else (res if isinstance(res, int) else 0)
        answer = None
        explanation = ""

    return {
        "id": q_id,
        "originalNumber": q_num,
        "type": target_type,
        "question": "",
        "image_url": image_url,
        "options": options,
        "correct": correct,
        "answer": answer,
        "explanation": explanation,
        "explanation_image": exp_image,
        "video": video_info,
        "topic": q.get('topic') or exercise_name,
        "sub_category": q.get('topic') or exercise_name,
        "category": chapter_name,
        "marks": { "correct": 4, "incorrect": -1 }
    }

def convert_single_book(zip_path, category):
    book_filename = os.path.basename(zip_path)
    book_name = pretty_book_name(book_filename)
    book_slug = slugify(book_name)
    
    target_book_dir = os.path.join(TARGET_MODULES_DIR, category, book_slug)
    os.makedirs(target_book_dir, exist_ok=True)
        
    book_manifest_entries = []
    
    with zipfile.ZipFile(zip_path, 'r') as z:
        namelist = sorted(z.namelist())
        chapter_groups = {}
        for entry_name in namelist:
            if not entry_name.endswith('.json'):
                continue
            parts = entry_name.replace('\\', '/').split('/')
            if len(parts) >= 2:
                chapter_dir = parts[0]
                file_part = parts[1]
            else:
                chapter_dir = "General"
                file_part = parts[0]
                
            chapter_groups.setdefault(chapter_dir, []).append((file_part, entry_name))

        for chapter_dir, file_list in chapter_groups.items():
            chapter_title = chapter_dir
            chapter_title_clean = re.sub(r'^[Cc]hapter\s*\d+\s*[-_:]\s*', '', chapter_title).strip()
            chapter_slug = slugify(chapter_title)
            
            chapter_manifest = {
                "name": chapter_title,
                "displayName": chapter_title_clean or chapter_title,
                "icon": "📁",
                "files": []
            }
            
            for file_part, entry_name in file_list:
                try:
                    content = z.read(entry_name).decode('utf-8', errors='ignore')
                    raw_data = json.loads(content)
                except Exception as e:
                    print(f"    [Skip] Error reading {entry_name}: {e}")
                    continue
                    
                raw_name = raw_data.get('name')
                if not raw_name:
                    raw_name = file_part.replace('.json', '')
                    raw_name = re.sub(r'^\d+\s*[-_:]\s*', '', raw_name).strip()
                    
                exercise_name = raw_name.replace('_', ' ').strip()
                exercise_slug = slugify(exercise_name)
                out_filename = f"{chapter_slug}--{exercise_slug}.json"
                out_filepath = os.path.join(target_book_dir, out_filename)
                rel_path = f"pw-modules/{category}/{book_slug}/{out_filename}".replace('\\', '/')
                
                source_questions = []
                if isinstance(raw_data, dict) and 'sections' in raw_data:
                    for s in raw_data['sections']:
                        if isinstance(s, dict) and 'questions' in s:
                            source_questions.extend(s['questions'])
                elif isinstance(raw_data, list):
                    source_questions = raw_data
                    
                converted_questions = []
                for q_idx, q in enumerate(source_questions):
                    converted_questions.append(convert_question(q, q_idx, exercise_name, chapter_title))
                    
                if not converted_questions:
                    continue
                    
                quizzy_file_data = {
                    "id": f"{book_slug}-{chapter_slug}-{exercise_slug}",
                    "name": exercise_name,
                    "displayName": exercise_name,
                    "description": f"{exercise_name} · {chapter_title} ({book_name})",
                    "duration": max(30, len(converted_questions) * 2),
                    "marking": { "correct": 4, "incorrect": -1 },
                    "chapters": [
                        {
                            "id": f"{book_slug}-{chapter_slug}-{exercise_slug}-ch",
                            "name": exercise_name,
                            "icon": "📘",
                            "topics": [
                                {
                                    "topic": "All Questions",
                                    "questions": converted_questions
                                }
                            ]
                        }
                    ],
                    "sections": [
                        {
                            "name": exercise_name,
                            "icon": "📘",
                            "questions": converted_questions
                        }
                    ]
                }
                
                with open(out_filepath, 'w', encoding='utf-8') as out_f:
                    json.dump(quizzy_file_data, out_f, indent=2, ensure_ascii=False)
                        
                chapter_manifest["files"].append({
                    "path": rel_path,
                    "displayName": exercise_name
                })
                
            if chapter_manifest["files"]:
                book_manifest_entries.append(chapter_manifest)
                
    total_q = sum(len(f) for c in book_manifest_entries for f in [c["files"]])
    print(f"  [OK] {book_name}: {len(book_manifest_entries)} chapters, {total_q} exercises converted.")
    return {
        "name": book_name,
        "displayName": book_name,
        "icon": "📚",
        "subsections": book_manifest_entries
    }

def convert_all_pw_books():
    categories = [
        ("jee", "PW JEE Digital Modules & Books", "🎯"),
        ("neet", "PW NEET Digital Modules & Books", "🩺"),
        ("ncert", "PW NCERT Digital Books (Class 11 & 12)", "📚")
    ]
    
    top_subsections = []
    
    for cat_dir, cat_display, cat_icon in categories:
        cat_full_path = os.path.join(SOURCE_ROOT, cat_dir)
        if not os.path.exists(cat_full_path):
            continue
            
        print(f"\n=======================================================")
        print(f"STARTING CATEGORY: {cat_display}")
        print(f"=======================================================")
        
        cat_books = []
        zip_files = sorted([f for f in os.listdir(cat_full_path) if f.endswith('.zip')])
        
        for zf in zip_files:
            zip_full_path = os.path.join(cat_full_path, zf)
            try:
                book_node = convert_single_book(zip_full_path, cat_dir)
                if book_node["subsections"]:
                    cat_books.append(book_node)
            except Exception as e:
                print(f"  [Error] Failed to process {zf}: {e}")
                
        if cat_books:
            top_subsections.append({
                "name": cat_display,
                "displayName": cat_display,
                "icon": cat_icon,
                "subsections": cat_books
            })
            
    # Update manifest.json
    print("\nUpdating manifest.json...")
    try:
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as mf:
            manifest_data = json.load(mf)
    except Exception as e:
        manifest_data = { "name": "Quizzy", "subsections": [] }
        
    pw_root_node = {
        "name": "PW Digital Books & Modules",
        "displayName": "Physics Wallah Digital Modules & Books",
        "icon": "⚡",
        "subsections": top_subsections
    }
    
    # Replace existing PW entry if present or append
    subs = manifest_data.get("subsections", [])
    new_subs = []
    replaced = False
    for s in subs:
        if s.get("name") in ["PW Digital Books & Modules", "Physics Wallah Digital Modules & Books"]:
            new_subs.append(pw_root_node)
            replaced = True
        else:
            new_subs.append(s)
            
    if not replaced:
        new_subs.append(pw_root_node)
        
    manifest_data["subsections"] = new_subs
    
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as mf:
        json.dump(manifest_data, mf, indent=2, ensure_ascii=False)
        
    print(f"\n[DONE] Manifest updated successfully at {MANIFEST_PATH}!")

if __name__ == '__main__':
    convert_all_pw_books()
