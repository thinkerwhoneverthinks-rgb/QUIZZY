"""
Quizzy Test Baker (Pre-bake compiler for borrowed questions)
-----------------------------------------------------------
Usage:
    python tools/bake-tests.py <input_draft_or_folder> [output_path_or_folder]

Features:
    - Resolves "from": "path/to/test.json", "q": "question_id" (or 1-based index)
    - Supports option rearrangement with "optionOrder": [2, 0, 1, 3]
    - O(1) hash map lookup with in-memory caching
    - Outputs self-contained, 1-request JSON files ready for GitHub Pages
"""

import os
import sys
import json
import copy

file_cache = {}
index_cache = {}

def get_source_questions(src_path, base_dir):
    # Resolve relative path
    full_path = src_path
    if not os.path.isabs(full_path):
        full_path = os.path.normpath(os.path.join(base_dir, src_path))
    
    if full_path in file_cache:
        return file_cache[full_path], index_cache[full_path]
    
    if not os.path.exists(full_path):
        raise FileNotFoundError(f"Source file not found: {full_path}")
        
    with open(full_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    flat_qs = []
    by_id = {}
    
    # Flatten questions from sections or root
    if 'sections' in data and isinstance(data['sections'], list):
        for sec in data['sections']:
            for q in sec.get('questions', []):
                flat_qs.append(q)
                if q.get('id'):
                    by_id[str(q['id'])] = q
    elif 'questions' in data:
        for q in data['questions']:
            flat_qs.append(q)
            if q.get('id'):
                by_id[str(q['id'])] = q
                
    file_cache[full_path] = flat_qs
    index_cache[full_path] = by_id
    return flat_qs, by_id

def bake_file(input_path, output_path, base_dir):
    with open(input_path, 'r', encoding='utf-8') as f:
        test_data = json.load(f)
        
    modified = False
    
    def process_questions(q_list):
        nonlocal modified
        new_list = []
        for q in q_list:
            if isinstance(q, dict) and 'from' in q:
                modified = True
                src_path = q['from']
                flat_qs, by_id = get_source_questions(src_path, base_dir)
                
                target = q.get('q')
                borrowed = None
                
                # Lookup by string ID or integer index
                if isinstance(target, str):
                    borrowed = by_id.get(target)
                    if not borrowed:
                        raise ValueError(f"Question ID '{target}' not found in {src_path}")
                elif isinstance(target, int):
                    idx = target - 1
                    if idx < 0 or idx >= len(flat_qs):
                        raise IndexError(f"Question index {target} out of range in {src_path} (has {len(flat_qs)} questions)")
                    borrowed = flat_qs[idx]
                else:
                    raise TypeError(f"Invalid 'q' reference type: {type(target)}. Must be string ID or integer index.")
                    
                borrowed_copy = copy.deepcopy(borrowed)
                
                # Allow overriding fields (e.g. custom explanation or marks)
                for k, v in q.items():
                    if k not in ['from', 'q', 'optionOrder']:
                        borrowed_copy[k] = v
                        
                # Handle option reordering
                if 'optionOrder' in q and 'options' in borrowed_copy and isinstance(borrowed_copy['options'], list):
                    order = q['optionOrder']
                    orig_opts = borrowed_copy['options']
                    orig_corr = borrowed_copy.get('correct')
                    
                    # Validate permutation
                    if sorted(order) != list(range(len(orig_opts))):
                        raise ValueError(f"optionOrder {order} must be a permutation of indices 0 to {len(orig_opts)-1}")
                        
                    reordered_opts = [orig_opts[i] for i in order]
                    borrowed_copy['options'] = reordered_opts
                    
                    # Update correct index if it's an integer
                    if isinstance(orig_corr, int) and 0 <= orig_corr < len(orig_opts):
                        borrowed_copy['correct'] = order.index(orig_corr)
                        
                new_list.append(borrowed_copy)
            else:
                new_list.append(q)
        return new_list

    if 'sections' in test_data and isinstance(test_data['sections'], list):
        for sec in test_data['sections']:
            if 'questions' in sec:
                sec['questions'] = process_questions(sec['questions'])
    elif 'questions' in test_data:
        test_data['questions'] = process_questions(test_data['questions'])

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(test_data, f, ensure_ascii=False, indent=2)
        
    return modified

def main():
    if len(sys.argv) < 2:
        print("Usage: python tools/bake-tests.py <input_draft_path> [output_path]")
        return
        
    input_target = sys.argv[1]
    quizzy_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    if os.path.isfile(input_target):
        out_path = sys.argv[2] if len(sys.argv) > 2 else input_target
        print(f"Baking {input_target} -> {out_path}...")
        mod = bake_file(input_target, out_path, quizzy_root)
        print("Done! Questions resolved and baked successfully." if mod else "Done! File had no external references.")
    elif os.path.isdir(input_target):
        out_dir = sys.argv[2] if len(sys.argv) > 2 else input_target
        count = 0
        for root, _, files in os.walk(input_target):
            for f in files:
                if f.endswith('.json'):
                    in_p = os.path.join(root, f)
                    rel = os.path.relpath(in_p, input_target)
                    out_p = os.path.join(out_dir, rel)
                    bake_file(in_p, out_p, quizzy_root)
                    count += 1
        print(f"Baked {count} files from {input_target} into {out_dir}.")

if __name__ == '__main__':
    main()
