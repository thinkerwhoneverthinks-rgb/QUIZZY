#!/usr/bin/env python3
"""
Quizzy & Quizard Test Schema Repair Tool
---------------------------------------
Repairs common extraction blunders across all downloaded test JSON files:
1. Normalizes question types to lowercase ('mcq', 'integer', 'multi_mcq').
2. Fixes integer questions:
   - Populates "answer" from "correct" if "answer" is missing.
   - Clears "correct" and removes dummy options (["A","B","C","D"]) for integers.
3. Fixes false-positive multi_mcq:
   - Demotes single-element [x] multi_mcq to standard 'mcq' for NEET and single-choice tests.
   - Converts single-int correct to array for genuine multi_mcq.
4. Cleans up formatting and writes back schema-compliant JSON.
"""

import os
import sys
import json
import glob
from pathlib import Path

# Ensure stdout handles utf-8 properly on Windows
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

DEFAULT_DIRS = [
    r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY\data\pw-test",
    r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\python-runner\workspace\quizard_outputs",
]

def repair_question(q, is_neet=False):
    modified = False
    raw_type = str(q.get("type", "")).strip()
    norm_type = raw_type.lower()
    
    # 1. Normalize type name to lowercase
    if raw_type != norm_type and raw_type != "":
        q["type"] = norm_type
        modified = True
        
    # Standardize aliases
    if norm_type in ["numerical", "integer_type"]:
        norm_type = "integer"
        q["type"] = "integer"
        modified = True
    elif norm_type in ["multi", "multiple"]:
        norm_type = "multi_mcq"
        q["type"] = "multi_mcq"
        modified = True
    elif not norm_type:
        norm_type = "mcq"
        q["type"] = "mcq"
        modified = True

    # 2. Fix INTEGER type questions
    if norm_type == "integer":
        ans = q.get("answer")
        corr = q.get("correct")
        corr_ans = q.get("correct_answer")
        
        # If answer is missing, populate from correct / correct_answer
        if ans is None or str(ans).strip() == "":
            candidate = corr if corr is not None else corr_ans
            if candidate is not None:
                q["answer"] = str(candidate).strip()
                modified = True
        
        # In Quizzy schema, integer should have correct: null and options: null
        if q.get("correct") is not None:
            q["correct"] = None
            modified = True
        if q.get("options") is not None:
            q["options"] = None
            modified = True

    # 3. Fix MULTI_MCQ type questions
    elif norm_type == "multi_mcq":
        corr = q.get("correct")
        
        # If it's a NEET test (where multi-choice never exists) and has single correct answer
        # OR if it only has 1 correct answer and question body explicitly says "single/only correct statement"
        if isinstance(corr, list):
            if len(corr) == 1 and (is_neet or "only correct" in (q.get("question") or "").lower()):
                q["type"] = "mcq"
                q["correct"] = corr[0]
                norm_type = "mcq"
                modified = True
        elif isinstance(corr, (int, float)):
            # Wrapped in list for multi_mcq
            q["correct"] = [int(corr)]
            modified = True
            
        # Ensure answer is null for MCQ
        if q.get("answer") is not None:
            q["answer"] = None
            modified = True

    # 4. Fix standard MCQ questions
    elif norm_type == "mcq":
        corr = q.get("correct")
        if isinstance(corr, list):
            if len(corr) == 1:
                q["correct"] = corr[0]
                modified = True
            elif len(corr) > 1:
                q["type"] = "multi_mcq"
                norm_type = "multi_mcq"
                modified = True
                
        # Ensure answer is null for MCQ
        if q.get("answer") is not None:
            q["answer"] = None
            modified = True

    return modified, norm_type

def process_file(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return False, f"Failed to read JSON: {e}", {}

    if not isinstance(data, dict) or "sections" not in data:
        return False, "Not a test format JSON", {}

    is_neet = "neet" in file_path.lower()
    file_modified = False
    stats = {
        "total_q": 0,
        "integer_fixed": 0,
        "multi_demoted_to_single": 0,
        "types_normalized": 0
    }

    for section in data.get("sections", []):
        for q in section.get("questions", []):
            stats["total_q"] += 1
            old_type = q.get("type")
            old_ans = q.get("answer")
            
            mod, new_type = repair_question(q, is_neet=is_neet)
            if mod:
                file_modified = True
                if old_type != new_type:
                    stats["types_normalized"] += 1
                    if old_type and old_type.upper() == "MULTI_MCQ" and new_type == "mcq":
                        stats["multi_demoted_to_single"] += 1
                if new_type == "integer" and not old_ans and q.get("answer"):
                    stats["integer_fixed"] += 1

    if file_modified:
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True, "Repaired", stats
        except Exception as e:
            return False, f"Failed to save JSON: {e}", stats

    return False, "Already clean", stats

def main():
    target_dirs = sys.argv[1:] if len(sys.argv) > 1 else DEFAULT_DIRS
    
    print("=" * 65)
    print("        QUIZZY / QUIZARD TEST SCHEMA REPAIR UTILITY        ")
    print("=" * 65)
    
    total_files_scanned = 0
    total_files_repaired = 0
    aggregate_stats = {
        "total_q": 0,
        "integer_fixed": 0,
        "multi_demoted_to_single": 0,
        "types_normalized": 0
    }

    for base_dir in target_dirs:
        p = Path(base_dir)
        if not p.exists():
            print(f"⚠️  Directory not found: {base_dir}")
            continue

        print(f"\n🔍 Scanning: {base_dir}")
        json_files = list(p.rglob("*.json"))
        print(f"   Found {len(json_files)} JSON files...")

        for jf in json_files:
            total_files_scanned += 1
            was_mod, msg, st = process_file(str(jf))
            for k in aggregate_stats:
                aggregate_stats[k] += st.get(k, 0)
            if was_mod:
                total_files_repaired += 1
                rel_p = jf.relative_to(p)
                print(f"   ✅ Repaired: {rel_p}")

    print("\n" + "=" * 65)
    print("                     REPAIR SUMMARY                        ")
    print("=" * 65)
    print(f"📁 Total Files Scanned        : {total_files_scanned}")
    print(f"🛠  Total Files Repaired       : {total_files_repaired}")
    print(f"❓ Total Questions Checked    : {aggregate_stats['total_q']}")
    print(f"🔡 Question Types Normalized  : {aggregate_stats['types_normalized']}")
    print(f"🔢 Integers Answer Populated  : {aggregate_stats['integer_fixed']}")
    print(f"🎯 False Multi -> Single MCQ  : {aggregate_stats['multi_demoted_to_single']}")
    print("=" * 65)

if __name__ == "__main__":
    main()
