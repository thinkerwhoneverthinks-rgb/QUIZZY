import os
import json
import glob
from collections import defaultdict
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

PW_DIR = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY\data\pw-modules"

files = glob.glob(os.path.join(PW_DIR, "**", "*.json"), recursive=True)
total_files = len(files)
print(f"Starting topic restructuring on {total_files} files...")

count_contiguous = 0
count_rearranged = 0
total_questions_processed = 0

for idx, fpath in enumerate(files, 1):
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    ex_name = data.get('name', '').strip()
    
    # Extract questions
    questions = []
    if 'sections' in data and data['sections']:
        for s in data['sections']:
            questions.extend(s.get('questions', []))
    elif 'chapters' in data and data['chapters']:
        for ch in data['chapters']:
            for t in ch.get('topics', []):
                questions.extend(t.get('questions', []))
                
    q_count = len(questions)
    total_questions_processed += q_count
    
    if q_count == 0:
        continue
        
    # Collect unique topics in order of appearance
    unique_topics = []
    topic_map = defaultdict(list)
    for q in questions:
        t = (q.get('topic') or ex_name).strip()
        if t not in topic_map:
            unique_topics.append(t)
        topic_map[t].append(q)
        
    # Check if contiguous
    seen = set()
    last = None
    is_contiguous = True
    for q in questions:
        t = (q.get('topic') or ex_name).strip()
        if t != last:
            if t in seen:
                is_contiguous = False
                break
            seen.add(t)
            last = t
            
    # Build chapters[0].topics
    new_topics = [{"topic": t, "questions": topic_map[t]} for t in unique_topics]
    
    # Ensure chapters array exists
    if not data.get('chapters'):
        data['chapters'] = [{
            "id": data.get("id", "ex") + "-ch",
            "name": ex_name,
            "icon": "📘",
            "topics": new_topics
        }]
    else:
        data['chapters'][0]['topics'] = new_topics
        
    if is_contiguous:
        count_contiguous += 1
        data['rearrangedTopicwise'] = False
        data['chapters'][0]['rearranged'] = False
        # sections[0].questions remains in original order
        if 'sections' in data and data['sections']:
            data['sections'][0]['questions'] = questions
    else:
        count_rearranged += 1
        data['rearrangedTopicwise'] = True
        data['chapters'][0]['rearranged'] = True
        
        # Flatten grouped by topic
        rearranged_qs = [q for t in unique_topics for q in topic_map[t]]
        if 'sections' in data and data['sections']:
            data['sections'][0]['questions'] = rearranged_qs
            
        desc = data.get('description', '')
        if '· (Rearranged Topic-wise)' not in desc:
            data['description'] = f"{desc} · (Rearranged Topic-wise)".strip()
            
    with open(fpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    if idx % 500 == 0 or idx == total_files:
        print(f"Processed {idx}/{total_files} files (Contiguous: {count_contiguous}, Rearranged: {count_rearranged})")

print(f"\n[DONE] Successfully processed all {total_files} files!")
print(f"  - Contiguous / Single Topic (Natural Order): {count_contiguous} files")
print(f"  - Rearranged Topic-wise (Approach B):         {count_rearranged} files")
print(f"  - Total Questions Preserved:                 {total_questions_processed}")
