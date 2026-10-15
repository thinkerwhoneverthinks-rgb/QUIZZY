import os
import json
import glob
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

PW_DIR = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY\data\pw-modules"

files = glob.glob(os.path.join(PW_DIR, "**", "*.json"), recursive=True)
total_files = len(files)
print(f"Cleaning JSON files across {total_files} modules...")

cleaned_count = 0

for idx, fpath in enumerate(files, 1):
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    modified = False
    
    # 1. Remove rearrangedTopicwise from root
    if "rearrangedTopicwise" in data:
        del data["rearrangedTopicwise"]
        modified = True
        
    # 2. Clean description
    desc = data.get("description", "")
    if " · (Rearranged Topic-wise)" in desc:
        data["description"] = desc.replace(" · (Rearranged Topic-wise)", "").strip()
        modified = True
        
    # 3. Remove rearranged flag from chapters
    if "chapters" in data and data["chapters"]:
        for ch in data["chapters"]:
            if "rearranged" in ch:
                del ch["rearranged"]
                modified = True
                
    # 4. Ensure sections[0].questions is in original sequence 1..N
    if "sections" in data and data["sections"]:
        sec_qs = data["sections"][0].get("questions", [])
        # Sort by originalNumber to guarantee clean original textbook order
        sorted_qs = sorted(sec_qs, key=lambda q: q.get("originalNumber", 0))
        if sorted_qs != sec_qs:
            data["sections"][0]["questions"] = sorted_qs
            modified = True
            
    if modified:
        with open(fpath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        cleaned_count += 1
        
    if idx % 500 == 0 or idx == total_files:
        print(f"Cleaned {idx}/{total_files} files (Modified: {cleaned_count})")

print(f"\n[DONE] Successfully cleaned up all {total_files} JSON files!")
