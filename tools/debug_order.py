import zipfile
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

QUIZZY_DIR = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY"
SRC_DIR = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\my-original-file\Neet-prep"

subjects = [
    ("NEETprep_Physics_Bank.zip", "physics"),
    ("NEETprep_Chemistry_Bank.zip", "chemistry"),
    ("NEETprep_Botany_Bank.zip", "botany"),
    ("NEETprep_Zoology_Bank.zip", "zoology"),
]

total_chapters = 0
total_questions = 0
total_order_mismatches = 0
total_subtopic_mismatches = 0

for zip_name, sub in subjects:
    z_path = os.path.join(SRC_DIR, zip_name)
    z = zipfile.ZipFile(z_path)
    
    # Map raw entries
    raw_files = [n for n in z.namelist() if n.endswith('.json')]
    
    quizzy_sub_dir = os.path.join(QUIZZY_DIR, "data", "neetprep", sub)
    quizzy_files = [f for f in os.listdir(quizzy_sub_dir) if f.endswith('.json')]
    
    print(f"Subject {sub.upper()}: {len(quizzy_files)} chapters")
    
    for qf in quizzy_files:
        total_chapters += 1
        with open(os.path.join(quizzy_sub_dir, qf), 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        topic_qs = []
        for t in data['chapters'][0]['topics']:
            topic_qs.extend(t['questions'])
        
        total_questions += len(topic_qs)
        
        # Check consecutive originalOrder 1..N
        serial_qs = sorted(topic_qs, key=lambda q: q.get('originalOrder', 0))
        for idx, sq in enumerate(serial_qs):
            expected = idx + 1
            actual = sq.get('originalOrder')
            if actual != expected:
                total_order_mismatches += 1
                if total_order_mismatches <= 5:
                    print(f"  Mismatch in {sub}/{qf} at idx {idx}: expected {expected}, got {actual}")

print("\n" + "="*50)
print(f"GRAND TOTAL CHECK ACROSS ALL SUBJECTS:")
print(f"Total Chapters Checked: {total_chapters}")
print(f"Total Questions Checked: {total_questions}")
print(f"Total Order Mismatches: {total_order_mismatches}")
print("="*50)
