import os
import json

modules_dir = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY\data\pw-modules"

total_files = 0
total_questions = 0
type_counts = {}
video_count = 0
errors = []

for root, dirs, files in os.walk(modules_dir):
    for f in files:
        if not f.endswith('.json'):
            continue
        total_files += 1
        path = os.path.join(root, f)
        try:
            with open(path, 'r', encoding='utf-8') as jf:
                data = json.load(jf)
                qs = data.get('chapters', [{}])[0].get('topics', [{}])[0].get('questions', [])
                total_questions += len(qs)
                
                # Check sequential order
                last_num = -1
                for idx, q in enumerate(qs):
                    t = q.get('type')
                    type_counts[t] = type_counts.get(t, 0) + 1
                    if q.get('video'):
                        video_count += 1
                    num = q.get('originalNumber')
                    # check if numbers match index + 1 or are in natural order
        except Exception as e:
            errors.append((path, str(e)))

print("==================================================")
print(f"Total Converted Exercise JSON Files: {total_files}")
print(f"Total Questions in pw-modules: {total_questions}")
print(f"Questions with Embedded Video Solution: {video_count}")
print(f"Errors: {len(errors)}")
print("Question Type Breakdown in Converted Files:")
for t, cnt in sorted(type_counts.items(), key=lambda x: -x[1]):
    print(f"  {t:15s}: {cnt}")
print("==================================================")
