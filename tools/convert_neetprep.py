import zipfile
import json
import os
import re
import base64
from collections import defaultdict
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

NEET_SRC_DIR = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\my-original-file\Neet-prep"
QUIZZY_DIR = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY"
OUT_BASE_DIR = os.path.join(QUIZZY_DIR, "data", "neetprep")
MANIFEST_PATH = os.path.join(QUIZZY_DIR, "data", "manifest.json")

SUBJECT_CONFIGS = [
    {
        "zip_name": "NEETprep_Physics_Bank.zip",
        "subject_slug": "physics",
        "subject_title": "Physics",
        "icon": "⚛️"
    },
    {
        "zip_name": "NEETprep_Chemistry_Bank.zip",
        "subject_slug": "chemistry",
        "subject_title": "Chemistry",
        "icon": "🧪"
    },
    {
        "zip_name": "NEETprep_Botany_Bank.zip",
        "subject_slug": "botany",
        "subject_title": "Botany",
        "icon": "🌱"
    },
    {
        "zip_name": "NEETprep_Zoology_Bank.zip",
        "subject_slug": "zoology",
        "subject_title": "Zoology",
        "icon": "🐾"
    }
]

# Set of valid HTML/MathML tags to protect from unescaping
VALID_TAGS = {
    'p', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
    'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr',
    'th', 'td', 'col', 'colgroup', 'img', 'a', 'h1', 'h2', 'h3', 'h4', 'h5',
    'h6', 'code', 'pre', 'blockquote', 'label', 'section',
    'math', 'mrow', 'mi', 'mo', 'mn', 'mfrac', 'msup', 'msub', 'msubsup',
    'msqrt', 'mroot', 'mspace', 'mtext', 'mtable', 'mtr', 'mtd', 'mover',
    'munder', 'munderover', 'semantics', 'annotation', 'menclose',
    'mfenced', 'mstyle', 'mmultiscripts', 'mprescripts', 'mpadded'
}

pseudo_tag_pattern = re.compile(r'<(/)?([a-zA-Z0-9]+)([^>]*)>')

def strip_garbage_tags(s):
    if not s or not isinstance(s, str):
        return ""
    # Strip scripts
    s = re.sub(r'<script[\s\S]*?<\/script>', '', s, flags=re.I)
    # Strip styles (both tag and entity forms)
    s = re.sub(r'<style[\s\S]*?<\/style>', '', s, flags=re.I)
    s = re.sub(r'&lt;style[\s\S]*?&lt;\/style&gt;', '', s, flags=re.I)
    s = re.sub(r'<style[^>]*>', '', s, flags=re.I)
    s = re.sub(r'<\/style>', '', s, flags=re.I)
    s = re.sub(r'&lt;style[^&]*&gt;', '', s, flags=re.I)
    s = re.sub(r'&lt;\/style&gt;', '', s, flags=re.I)
    # Strip HTML comments
    s = re.sub(r'<!--[\s\S]*?-->', '', s)
    s = re.sub(r'&lt;!--[\s\S]*?--&gt;', '', s)
    # Strip quillbot extensions (both tag and entity forms, self-closing or pairs)
    s = re.sub(r'<quillbot[\w-]*[\s\S]*?<\/quillbot[\w-]*>', '', s, flags=re.I)
    s = re.sub(r'<quillbot[\w-]*[^>]*\/?>', '', s, flags=re.I)
    s = re.sub(r'<\/quillbot[\w-]*>', '', s, flags=re.I)
    s = re.sub(r'&lt;quillbot[\w-]*[\s\S]*?&lt;\/quillbot[\w-]*&gt;', '', s, flags=re.I)
    s = re.sub(r'&lt;quillbot[\w-]*[^&]*&gt;', '', s, flags=re.I)
    s = re.sub(r'&lt;\/quillbot[\w-]*&gt;', '', s, flags=re.I)
    return s

def escape_pseudo_tags(text):
    if not text or not isinstance(text, str):
        return ""
    def repl(m):
        slash = m.group(1) or ""
        tname = m.group(2).lower()
        rest = m.group(3) or ""
        if tname in VALID_TAGS:
            return m.group(0) # valid tag, keep untouched
        # pseudo-tag like <H2SO4> or <Cr24>
        return f"&lt;{slash}{m.group(2)}{rest}&gt;"
    return pseudo_tag_pattern.sub(repl, text)

def normalize_spacing(s):
    if not s:
        return ""
    s = strip_garbage_tags(s)
    s = re.sub(r'<br\s*/?>\s*[\r\n]+', '<br>', s, flags=re.I)
    s = re.sub(r'[\r\n]+\s*(?=<br\s*/?>)', '', s, flags=re.I)
    s = re.sub(r'(</(?:p|div|table|ul|ol|h[1-6])>)\s*(?:<br\s*/?>\s*)+', r'\1', s, flags=re.I)
    s = re.sub(r'(?:<br\s*/?>\s*)+(<(?:p|div|table|ul|ol|h[1-6]))', r'\1', s, flags=re.I)
    for _ in range(6):
        s = re.sub(r'(</?(?:table|thead|tbody|tfoot|tr|ul|ol)[^>]*>)\s+(</?(?:table|thead|tbody|tfoot|tr|td|th|li)[^>]*>)', r'\1\2', s, flags=re.I)
        s = re.sub(r'(</(?:td|th)>)\s+(<(?:td|th)[^>]*>)', r'\1\2', s, flags=re.I)
        s = re.sub(r'(</(?:p|div|h[1-6])>)\s+(<(?:p|div|h[1-6]|table|ul|ol)[^>]*>)', r'\1\2', s, flags=re.I)
        s = re.sub(r'(<(?:td|th)[^>]*>)\s*[\r\n]+\s*', r'\1', s, flags=re.I)
        s = re.sub(r'\s*[\r\n]+\s*(</(?:td|th)>)', r'\1', s, flags=re.I)
        s = re.sub(r'\s*[\r\n]+\s*(</(?:tr|tbody|thead|tfoot|table)>)', r'\1', s, flags=re.I)
        s = re.sub(r'(<(?:table|tbody|thead|tfoot|tr)[^>]*>)\s*[\r\n]+\s*', r'\1', s, flags=re.I)
    s = re.sub(r'<p>\s*[\r\n]+', '<p>', s, flags=re.I)
    s = re.sub(r'[\r\n]+\s*<\/p>', '</p>', s, flags=re.I)
    s = re.sub(r'<p>\s*(?:&nbsp;)?\s*</p>\s*$', '', s, flags=re.I)
    s = re.sub(r'^\s*<p>\s*(?:&nbsp;)?\s*</p>', '', s, flags=re.I)
    return s.strip()

def decode_id(raw_id, subject):
    try:
        decoded = base64.b64decode(raw_id).decode('utf-8', errors='ignore')
        if ':' in decoded:
            num = decoded.split(':')[-1]
            return f"neetprep_{subject}_q{num}"
    except Exception:
        pass
    clean_raw = re.sub(r'[^a-zA-Z0-9_]', '_', str(raw_id))
    return f"neetprep_{subject}_{clean_raw}"

def build_analytics_card(an, coi):
    if not an or not isinstance(an, dict) or not an.get("correctPercentage"):
        return ""
    try:
        correct_pct = round(float(an.get("correctPercentage") or 0))
    except (ValueError, TypeError):
        correct_pct = 0
    
    opt1 = an.get("option1Percentage", 0)
    opt2 = an.get("option2Percentage", 0)
    opt3 = an.get("option3Percentage", 0)
    opt4 = an.get("option4Percentage", 0)
    
    if correct_pct >= 70:
        diff_label = "🟢 Easy"
        diff_color = "#16a34a"
        diff_bg = "rgba(34, 197, 94, 0.15)"
    elif correct_pct >= 40:
        diff_label = "🟡 Medium"
        diff_color = "#d97706"
        diff_bg = "rgba(245, 158, 11, 0.15)"
    else:
        diff_label = "🔴 Hard"
        diff_color = "#dc2626"
        diff_bg = "rgba(239, 68, 68, 0.15)"
        
    opts_pct = [opt1, opt2, opt3, opt4]
    
    boxes = []
    for oi in range(4):
        pct = opts_pct[oi]
        is_corr = (oi == coi)
        if is_corr:
            box = (
                f'<div style="padding:0.4rem; border-radius:6px; background:rgba(34,197,94,0.12); border:1.5px solid #22c55e;">'
                f'<div style="color:#16a34a; font-weight:700;">({oi+1}) ✓</div>'
                f'<div style="font-weight:800; color:#16a34a; margin-top:2px;">{pct}%</div>'
                f'</div>'
            )
        else:
            box = (
                f'<div style="padding:0.4rem; border-radius:6px; background:var(--bg-primary); border:1px solid var(--border);">'
                f'<div>({oi+1})</div>'
                f'<div style="font-weight:700; margin-top:2px;">{pct}%</div>'
                f'</div>'
            )
        boxes.append(box)
        
    card = (
        f'<div style="margin-top:1.25rem; padding:0.85rem 1rem; background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px;">'
        f'<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem; font-weight:600; font-size:0.88rem;">'
        f'<span>📊 Student Attempt Analytics</span>'
        f'<span style="padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; background:{diff_bg}; color:{diff_color};">'
        f'{diff_label} · {correct_pct}% Got This Correct'
        f'</span>'
        f'</div>'
        f'<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.5rem; text-align:center; font-size:0.82rem;">'
        f'{"".join(boxes)}'
        f'</div>'
        f'</div>'
    )
    return card

def clean_chapter_slug(fname, ch_name):
    # e.g. 675_Units_and_Measurement.json -> units-and-measurement.json
    base = fname.replace('.json', '')
    # remove number prefix like 675_
    base = re.sub(r'^\d+_', '', base)
    slug = re.sub(r'[^a-zA-Z0-9]+', '-', base.lower()).strip('-')
    return f"{slug}.json"

def clean_display_title(raw_name):
    # Remove leading numbers, clean underscores
    clean = re.sub(r'^\d+_', '', raw_name)
    clean = clean.replace('__', ' and ').replace('_', ' ').strip()
    return clean

manifest_entries = defaultdict(list)
total_questions_all = 0
total_chapters_all = 0

print("==================================================")
print("Starting NEETprep Question Bank Conversion Pipeline")
print("==================================================\n")

for cfg in SUBJECT_CONFIGS:
    zip_path = os.path.join(NEET_SRC_DIR, cfg["zip_name"])
    if not os.path.exists(zip_path):
        print(f"Warning: Zip not found {zip_path}")
        continue
    
    sub_dir = os.path.join(OUT_BASE_DIR, cfg["subject_slug"])
    os.makedirs(sub_dir, exist_ok=True)
    
    print(f"Processing {cfg['subject_title']} ({cfg['zip_name']})...")
    
    with zipfile.ZipFile(zip_path, 'r') as zf:
        file_list = sorted([f for f in zf.namelist() if f.endswith('.json')])
        
        for ch_idx, fname in enumerate(file_list, 1):
            try:
                content = zf.read(fname).decode('utf-8')
                raw_qs = json.loads(content)
            except Exception as e:
                print(f"  Error reading {fname}: {e}")
                continue
            
            if not isinstance(raw_qs, list) or len(raw_qs) == 0:
                continue
            
            # Extract canonical chapter name from first question or filename
            ch_name = clean_display_title(fname)
            first_topics = raw_qs[0].get("_topics3kIoNJ", {}).get("edges", [])
            if first_topics and first_topics[0].get("node", {}).get("name"):
                ch_name = first_topics[0]["node"]["name"].strip()
            
            slug_fname = clean_chapter_slug(fname, ch_name)
            ch_slug = slug_fname.replace('.json', '')
            
            # Group questions by subtopic
            unique_subtopics = []
            subtopic_map = defaultdict(list)
            
            for q_idx, q in enumerate(raw_qs):
                st_edges = q.get("_subTopics1oRyyE", {}).get("edges", [])
                st_name = "General Practice"
                if st_edges and st_edges[0].get("node", {}).get("name"):
                    st_name = st_edges[0]["node"]["name"].strip()
                
                if st_name not in subtopic_map:
                    unique_subtopics.append(st_name)
                
                # Question ID
                qid = decode_id(q.get("id"), cfg["subject_slug"])
                
                # Question ordering
                q_num = q.get("questionNum")
                orig_order = int(q_num) if isinstance(q_num, int) else (q_idx + 1)
                
                # Exam badge logic
                exam_details = q.get("_questionDetails3wxeRf", {}).get("edges", [])
                exam_name = "NEETprep Practice"
                if exam_details and exam_details[0].get("node"):
                    node = exam_details[0]["node"]
                    ex = node.get("exam")
                    yr = node.get("year")
                    if ex and yr:
                        exam_name = f"{ex} {yr}"
                    elif ex:
                        exam_name = f"{ex}"
                
                if q.get("ncert"):
                    if exam_name != "NEETprep Practice":
                        exam_name = f"{exam_name} · NCERT"
                    else:
                        exam_name = "NCERT Based"
                
                # Question HTML
                q_body = strip_garbage_tags(q.get("question") or "")
                q_body = escape_pseudo_tags(q_body)
                q_body = normalize_spacing(q_body)
                
                # Options
                opts = q.get("options")
                if not opts or opts == ['(1)', '(2)', '(3)', '(4)'] or opts == ['1', '2', '3', '4']:
                    final_opts = ["(1)", "(2)", "(3)", "(4)"]
                else:
                    final_opts = [normalize_spacing(escape_pseudo_tags(strip_garbage_tags(str(o)))) for o in opts]
                
                # Correct index
                coi = q.get("correctOptionIndex")
                correct_idx = int(coi) if isinstance(coi, int) else 0
                
                # Explanation + Analytics Card
                raw_exp = q.get("explanationText") or q.get("explanation") or ""
                clean_exp = strip_garbage_tags(raw_exp)
                clean_exp = escape_pseudo_tags(clean_exp)
                clean_exp = normalize_spacing(clean_exp)
                an_card = build_analytics_card(q.get("analytics"), correct_idx)
                if an_card:
                    clean_exp = clean_exp + an_card if clean_exp else an_card
                
                converted_q = {
                    "id": qid,
                    "type": "mcq",
                    "originalOrder": orig_order,
                    "topic": st_name,
                    "subtopic": st_name,
                    "sub_category": st_name,
                    "chapter": ch_name,
                    "exam_name": exam_name,
                    "question": q_body,
                    "options": final_opts,
                    "correct": correct_idx,
                    "explanation": clean_exp,
                    "ncert": bool(q.get("ncert"))
                }
                
                subtopic_map[st_name].append(converted_q)
            
            # Construct chapters[0].topics
            topics_array = []
            for st in unique_subtopics:
                topics_array.append({
                    "topic": st,
                    "questions": subtopic_map[st]
                })
            
            total_qs = len(raw_qs)
            est_duration = max(15, round(total_qs * 1.0))
            
            chapter_doc = {
                "id": f"neetprep-{cfg['subject_slug']}-{ch_slug}",
                "name": ch_name,
                "displayName": ch_name,
                "description": f"NEETprep Question Bank · {ch_name} ({cfg['subject_title']})",
                "duration": est_duration,
                "marking": {
                    "correct": 4,
                    "incorrect": -1
                },
                "chapters": [
                    {
                        "id": f"neetprep-{cfg['subject_slug']}-{ch_slug}-ch",
                        "name": ch_name,
                        "icon": cfg["icon"],
                        "topics": topics_array
                    }
                ]
            }
            
            out_file_path = os.path.join(sub_dir, slug_fname)
            with open(out_file_path, "w", encoding="utf-8") as out_f:
                json.dump(chapter_doc, out_f, indent=2, ensure_ascii=False)
            
            # Register in manifest
            manifest_rel_path = f"neetprep/{cfg['subject_slug']}/{slug_fname}"
            manifest_entries[cfg["subject_slug"]].append({
                "displayName": ch_name,
                "path": manifest_rel_path,
                "count": total_qs
            })
            
            total_questions_all += total_qs
            total_chapters_all += 1
            print(f"  [{ch_idx:02d}/{len(file_list):02d}] {ch_name} -> {total_qs} Qs ({len(unique_subtopics)} topics)")

print(f"\nSuccessfully converted {total_chapters_all} chapters ({total_questions_all} questions).")

# Update manifest.json
print("\nUpdating manifest.json with NEETprep sections...")
try:
    with open(MANIFEST_PATH, "r", encoding="utf-8") as mf:
        manifest_data = json.load(mf)
    
    neet_sec = next((s for s in manifest_data.get("subsections", []) if "NEET" in s.get("name", "")), None)
    
    if not neet_sec:
        print("Error: Could not locate '🩺 NEET (UG)' section in manifest.json")
    else:
        # Build NEETprep Question Bank subsection
        subject_subsections = []
        for cfg in SUBJECT_CONFIGS:
            entries = manifest_entries[cfg["subject_slug"]]
            files_list = [{"displayName": e["displayName"], "path": e["path"]} for e in entries]
            total_sub_qs = sum(e["count"] for e in entries)
            subject_subsections.append({
                "name": cfg["subject_title"],
                "displayName": f"{cfg['subject_title']} ({len(entries)} Chapters · {total_sub_qs:,} Qs)",
                "icon": cfg["icon"],
                "files": files_list
            })
        
        neetprep_section = {
            "name": "🌿 NEETprep Question Bank",
            "displayName": f"🌿 NEETprep Question Bank ({total_questions_all:,} Qs)",
            "icon": "🌿",
            "subsections": subject_subsections
        }
        
        # Replace if existing or append
        existing_idx = None
        for i, sub in enumerate(neet_sec.get("subsections", [])):
            if "NEETprep" in sub.get("name", ""):
                existing_idx = i
                break
        
        if existing_idx is not None:
            neet_sec["subsections"][existing_idx] = neetprep_section
            print("  Replaced existing NEETprep section in manifest.")
        else:
            neet_sec["subsections"].append(neetprep_section)
            print("  Appended NEETprep section to NEET (UG) in manifest.")
            
        with open(MANIFEST_PATH, "w", encoding="utf-8") as mf:
            json.dump(manifest_data, mf, indent=2, ensure_ascii=False)
        print("  Manifest.json updated successfully!")

except Exception as e:
    print(f"Error updating manifest: {e}")

print("\n[ALL DONE] NEETprep Conversion Complete!")
