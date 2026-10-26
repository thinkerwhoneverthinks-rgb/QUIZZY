"""NEETprep Previous Year Papers to Quizzy Test Cafe Converter.

Converts all 46 raw NEETprep test files into standardized Quizzy Test Cafe format:
- Math formulas (LaTeX \\( ... \\), MathML, and images) are 100% UNTOUCHED and preserved verbatim.
- Maps correctOptionIndex -> correct (0-based integer).
- Appends student analytics box (percentage breakdown) to explanation.
- Groups questions into 4 sections: Physics (⚛️), Chemistry (🧪), Botany (🌱), Zoology (🐾).
- Registers all 46 tests cleanly into QUIZZY/data/test-manifest.json.
"""

import base64
from collections import Counter
import glob
import json
import os
from pathlib import Path
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_DIR = Path(r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY")
SRC_DIR = Path(r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\neetprep-previus-yeartest")
DEST_DIR = BASE_DIR / "data" / "neet-pyq-tests"
MANIFEST_PATH = BASE_DIR / "data" / "test-manifest.json"

DEST_DIR.mkdir(parents=True, exist_ok=True)

# Build Subtopic -> Subject dictionary from Question Cafe
subtopic_to_subject = {}
for subj in ["physics", "chemistry", "botany", "zoology"]:
    subj_dir = BASE_DIR / "data" / "neetprep" / subj
    if not subj_dir.exists():
        continue
    for jf in subj_dir.rglob("*.json"):
        try:
            d = json.loads(jf.read_text(encoding="utf-8"))
            for ch in d.get("chapters", []):
                for top in ch.get("topics", []):
                    t = top.get("topic")
                    if t:
                        subtopic_to_subject[t.strip().lower()] = subj
                    for q in top.get("questions", []):
                        st = q.get("subtopic") or q.get("topic")
                        if st:
                            subtopic_to_subject[st.strip().lower()] = subj
        except Exception:
            pass

manual_map = {
    "dorsal vessel: heart": "zoology",
    "alimentary canal: oral cavity & teeth": "zoology",
    "gastric secretions": "zoology",
    "histology of gut": "zoology",
    "endocrine gland - parathyroid gland": "zoology",
    "non - disjunction: klinefelter syndrome": "zoology",
    "non - disjunction: down syndrome": "zoology",
    "factors affecting hardy weinberg principle": "zoology",
    "stomata: 3": "botany",
    "mineral deficiency & toxicity": "botany",
    "plasmolysis": "botany",
    "means of transport: active": "botany",
    "phloem translocation": "botany",
    "nitrogen nutrition in plants": "botany",
    "nitrogen metabolism": "botany",
    "secondary & primary meristems": "botany",
    "cell cycle: mitosis - metaphase": "botany",
    "tools: ligases": "botany",
    "in situ conservation": "botany",
    "ecosystem - energy flow": "botany",
    "ideal gas law": "physics",
    "types of velocities": "physics",
    "introduction to states of matter": "chemistry",
    "solubility & factors affecting solubility": "chemistry",
    "effect of temperature: arrhenius equation": "chemistry",
    "chemical reactions: alkynes": "chemistry",
    "classification on the basis of growth & structure of polymers": "chemistry",
    "physical properties": "chemistry",
    "agrochemical & radioactive waste": "botany",
    "air pollution": "botany",
}
for k, v in manual_map.items():
    subtopic_to_subject[k.lower()] = v


def decode_qid(raw_id: str, default_prefix: str = "q") -> str:
    if not raw_id:
        return default_prefix
    try:
        dec = base64.b64decode(raw_id).decode("utf-8", errors="ignore")
        if ":" in dec:
            return f"neet_{dec.split(':')[-1]}"
    except Exception:
        pass
    clean = re.sub(r"[^a-zA-Z0-9_]", "_", str(raw_id))
    return f"neet_{clean}"


def build_analytics_card(an: dict, correct_idx: int) -> str:
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
        is_corr = oi == correct_idx
        if is_corr:
            box = (
                f'<div style="padding:0.4rem; border-radius:6px; background:rgba(34,197,94,0.12); border:1.5px solid #22c55e;">'
                f'<div style="color:#16a34a; font-weight:700;">({oi+1}) ✓</div>'
                f'<div style="font-weight:800; color:#16a34a; margin-top:2px;">{pct}%</div>'
                f"</div>"
            )
        else:
            box = (
                f'<div style="padding:0.4rem; border-radius:6px; background:var(--bg-primary); border:1px solid var(--border);">'
                f"<div>({oi+1})</div>"
                f'<div style="font-weight:700; margin-top:2px;">{pct}%</div>'
                f"</div>"
            )
        boxes.append(box)

    card = (
        f'<div style="margin-top:1.25rem; padding:0.85rem 1rem; background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px;">'
        f'<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem; font-weight:600; font-size:0.88rem;">'
        f"<span>📊 Student Attempt Analytics</span>"
        f'<span style="padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; background:{diff_bg}; color:{diff_color};">'
        f"{diff_label} · {correct_pct}% Got This Correct"
        f"</span>"
        f"</div>"
        f'<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.5rem; text-align:center; font-size:0.82rem;">'
        f'{"".join(boxes)}'
        f"</div>"
        f"</div>"
    )
    return card


PAPERS_META = {
    1: {"name": "NEET 2024 (Re-NEET Exam Paper)", "era": "2021_2024", "duration": 180},
    2: {"name": "NEET 2024 (Main Exam Paper)", "era": "2021_2024", "duration": 180},
    3: {"name": "NEET 2024 (Practice Exam Paper)", "era": "2021_2024", "duration": 180},
    4: {"name": "NEET 2024 (Full Paper · 200 Questions)", "era": "2021_2024", "duration": 200},
    5: {"name": "NEET 2024 (Standard Paper · 180 Questions)", "era": "2021_2024", "duration": 180},
    6: {"name": "NEET 2024 Jhajjar Centre (Full · 200 Questions)", "era": "2021_2024", "duration": 200},
    7: {"name": "NEET 2024 Jhajjar Centre (Standard · 180 Questions)", "era": "2021_2024", "duration": 180},
    8: {"name": "NEET 2024 Re-NEET Paper (Full · 200 Questions)", "era": "2021_2024", "duration": 200},
    9: {"name": "NEET 2024 Re-NEET Paper (Standard · 180 Questions)", "era": "2021_2024", "duration": 180},
    10: {"name": "NEET 2023 Manipur Exam (Standard · 180 Questions)", "era": "2021_2024", "duration": 180},
    11: {"name": "NEET 2023 Manipur Exam (Full · 200 Questions)", "era": "2021_2024", "duration": 200},
    12: {"name": "NEET 2023 Main Exam (Standard · 180 Questions)", "era": "2021_2024", "duration": 180},
    13: {"name": "NEET 2023 Main Exam (Full · 200 Questions)", "era": "2021_2024", "duration": 200},
    14: {"name": "NEET 2022 Ganganagar Exam (Standard · 180 Questions)", "era": "2021_2024", "duration": 180},
    15: {"name": "NEET 2022 Ganganagar Exam (Full · 200 Questions)", "era": "2021_2024", "duration": 200},
    16: {"name": "NEET 2022 Main Exam (Full · 200 Questions)", "era": "2021_2024", "duration": 200},
    17: {"name": "NEET 2022 Main Exam (Standard · 180 Questions)", "era": "2021_2024", "duration": 180},
    18: {"name": "NEET 2022 Abroad Exam (Full · 200 Questions)", "era": "2021_2024", "duration": 200},
    19: {"name": "NEET 2022 Abroad Exam (Standard · 180 Questions)", "era": "2021_2024", "duration": 180},
    20: {"name": "NEET 2021 Main Exam (Full · 200 Questions)", "era": "2021_2024", "duration": 200},
    21: {"name": "NEET 2021 Main Exam (Standard · 180 Questions)", "era": "2021_2024", "duration": 180},
    22: {"name": "NEET 2020 Covid Re-Exam (Paper)", "era": "2013_2020", "duration": 180},
    23: {"name": "NEET 2020 Covid Re-Exam (Standard Order)", "era": "2013_2020", "duration": 180},
    24: {"name": "NEET 2020 Main Exam Phase 1", "era": "2013_2020", "duration": 180},
    25: {"name": "NEET 2020 Main Exam Phase 1 (Standard Order)", "era": "2013_2020", "duration": 180},
    26: {"name": "NEET 2019 Odisha Exam", "era": "2013_2020", "duration": 180},
    27: {"name": "NEET 2019 Odisha Exam (Standard Order)", "era": "2013_2020", "duration": 180},
    28: {"name": "NEET 2019 Main Exam (Standard Order)", "era": "2013_2020", "duration": 180},
    29: {"name": "NEET 2019 Main Exam", "era": "2013_2020", "duration": 180},
    30: {"name": "NEET 2018 Main Exam Paper", "era": "2013_2020", "duration": 180},
    31: {"name": "NEET 2017 Main Exam Paper", "era": "2013_2020", "duration": 180},
    32: {"name": "NEET 2016 Phase 2 Exam Paper", "era": "2013_2020", "duration": 180},
    33: {"name": "NEET 2016 Phase 1 (AIPMT) Exam Paper", "era": "2013_2020", "duration": 180},
    34: {"name": "AIPMT 2015 Re-Exam Paper", "era": "2013_2020", "duration": 180},
    35: {"name": "AIPMT 2015 Exam Paper", "era": "2013_2020", "duration": 180},
    36: {"name": "AIPMT 2014 Exam Paper", "era": "2013_2020", "duration": 180},
    37: {"name": "AIPMT 2013 (NEET-UG) Exam Paper", "era": "2013_2020", "duration": 180},
    38: {"name": "NEET 2013 Karnataka Exam Paper", "era": "2013_2020", "duration": 180},
    39: {"name": "AIPMT 2012 Prelims Exam Paper (200 Qs)", "era": "2006_2012", "duration": 180},
    40: {"name": "AIPMT 2012 Mains Exam Paper (120 Qs)", "era": "2006_2012", "duration": 180},
    41: {"name": "AIPMT 2011 Prelims Exam Paper (199 Qs)", "era": "2006_2012", "duration": 180},
    42: {"name": "AIPMT 2010 Prelims Exam Paper (200 Qs)", "era": "2006_2012", "duration": 180},
    43: {"name": "AIPMT 2009 Prelims Exam Paper (200 Qs)", "era": "2006_2012", "duration": 180},
    44: {"name": "AIPMT 2008 Prelims Exam Paper (200 Qs)", "era": "2006_2012", "duration": 180},
    45: {"name": "AIPMT 2007 Prelims Exam Paper (200 Qs)", "era": "2006_2012", "duration": 180},
    46: {"name": "AIPMT 2006 Prelims Exam Paper (200 Qs)", "era": "2006_2012", "duration": 180},
}


def convert_test_file(file_path: Path, idx: int) -> dict:
    raw_qs = json.loads(file_path.read_text(encoding="utf-8"))
    n = len(raw_qs)

    meta = PAPERS_META.get(idx, {})
    disp_name = meta.get("name") or file_path.stem.replace("_", " ")
    test_id = f"neet-pyq-{idx:02d}"

    block_size = n // 4
    remainder = n % 4

    ranges = []
    curr = 0
    for b in range(4):
        sz = block_size + (1 if b < remainder else 0)
        ranges.append((curr, curr + sz))
        curr += sz

    block_questions = {}
    for b_idx, (start, end) in enumerate(ranges):
        b_qs = raw_qs[start:end]
        votes = []
        for q in b_qs:
            st = q.get("subtopic_tag")
            if st and st.strip().lower() in subtopic_to_subject:
                votes.append(subtopic_to_subject[st.strip().lower()])
        cnt = Counter(votes)
        top_subj = cnt.most_common(1)[0][0] if cnt else "physics"
        block_questions[top_subj] = b_qs

    subjects_order = ["physics", "chemistry", "botany", "zoology"]
    section_configs = [
        {"name": "Physics", "icon": "⚛️", "key": "physics"},
        {"name": "Chemistry", "icon": "🧪", "key": "chemistry"},
        {"name": "Botany", "icon": "🌱", "key": "botany"},
        {"name": "Zoology", "icon": "🐾", "key": "zoology"},
    ]

    sections = []
    if set(block_questions.keys()) == set(subjects_order):
        for cfg in section_configs:
            raw_section_qs = block_questions[cfg["key"]]
            converted_qs = []
            for q_idx, q in enumerate(raw_section_qs):
                converted_qs.append(convert_question(q, q_idx, cfg["name"]))
            sections.append({
                "name": cfg["name"],
                "icon": cfg["icon"],
                "marking": {"correct": 4, "incorrect": -1},
                "questions": converted_qs,
            })
    else:
        b0_votes = [
            subtopic_to_subject.get((q.get("subtopic_tag") or "").strip().lower(), "")
            for q in raw_qs[ranges[0][0]:ranges[0][1]]
        ]
        cnt0 = Counter([v for v in b0_votes if v])
        first_subj = cnt0.most_common(1)[0][0] if cnt0 else "physics"

        if first_subj == "physics":
            block_to_subj = ["Physics", "Chemistry", "Botany", "Zoology"]
        else:
            block_to_subj = ["Botany", "Zoology", "Chemistry", "Physics"]

        section_map = {name: [] for name in ["Physics", "Chemistry", "Botany", "Zoology"]}
        for b_idx, (start, end) in enumerate(ranges):
            s_name = block_to_subj[b_idx]
            for q_idx, q in enumerate(raw_qs[start:end]):
                section_map[s_name].append(convert_question(q, q_idx, s_name))

        for cfg in section_configs:
            sections.append({
                "name": cfg["name"],
                "icon": cfg["icon"],
                "marking": {"correct": 4, "incorrect": -1},
                "questions": section_map[cfg["name"]],
            })

    total_qs = sum(len(s["questions"]) for s in sections)
    duration = meta.get("duration", 180)

    test_json = {
        "id": test_id,
        "name": disp_name,
        "displayName": disp_name,
        "description": f"NEET/AIPMT Official Previous Year Question Paper ({disp_name}) with full solutions & student attempt analytics.",
        "duration": duration,
        "marking": {"correct": 4, "incorrect": -1},
        "syllabus": {
            "enabled": True,
            "type": "text",
            "title": f"{disp_name} Syllabus",
            "buttonLabel": "📄 Syllabus",
            "content": "📌 PHYSICS\n• Full Syllabus (Class 11 & Class 12)\n\n📌 CHEMISTRY\n• Full Syllabus (Class 11 & Class 12)\n\n📌 BOTANY\n• Full Syllabus (Class 11 & Class 12)\n\n📌 ZOOLOGY\n• Full Syllabus (Class 11 & Class 12)",
        },
        "sections": sections,
        "totalQuestions": total_qs,
        "totalMarks": total_qs * 4,
    }
    return test_json


def convert_question(q: dict, index: int, section_name: str) -> dict:
    raw_id = q.get("id") or f"{section_name.lower()}_{index+1}"
    qid = decode_qid(raw_id, f"neet_{section_name.lower()}_{index+1}")

    coi = q.get("correctOptionIndex")
    if isinstance(coi, int):
        correct_idx = coi
    else:
        try:
            correct_idx = int(coi)
        except Exception:
            correct_idx = 0

    q_text = q.get("question") or q.get("questionTitle") or ""

    opts = q.get("options")
    if not opts or len(opts) != 4:
        opts = ["(1)", "(2)", "(3)", "(4)"]
    else:
        opts = [str(o) for o in opts]

    raw_exp = q.get("explanation") or q.get("explanationText") or ""
    an_card = build_analytics_card(q.get("analytics"), correct_idx)
    final_exp = raw_exp + an_card if an_card else raw_exp

    exam_badge = q.get("exam_badge")
    subtopic = q.get("subtopic_tag")

    return {
        "id": qid,
        "type": "mcq",
        "question": q_text,
        "options": opts,
        "correct": correct_idx,
        "explanation": final_exp,
        "sub_category": subtopic or section_name,
        "exam_name": exam_badge or "NEET / AIPMT",
    }


def update_manifest(converted_manifest_items: list):
    manifest_data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    era_groups = {
        "2021_2024": {
            "name": "🌟 NEET 2021 – 2024 (New 200-Q & 180-Q Pattern)",
            "displayName": "NEET 2021 – 2024 Test Series",
            "icon": "🌟",
            "files": [],
        },
        "2013_2020": {
            "name": "🏛️ NEET 2013 – 2020 (180-Q Standard Pattern)",
            "displayName": "NEET 2013 – 2020 Test Series",
            "icon": "🏛️",
            "files": [],
        },
        "2006_2012": {
            "name": "📜 AIPMT 2006 – 2012 (Legacy National Papers)",
            "displayName": "AIPMT 2006 – 2012 Test Series",
            "icon": "📜",
            "files": [],
        },
    }

    for item in converted_manifest_items:
        era = item["era"]
        era_groups[era]["files"].append({
            "displayName": item["displayName"],
            "path": item["path"],
            "syllabus": {
                "enabled": True,
                "type": "text",
                "title": f"{item['displayName']} Syllabus",
                "buttonLabel": "📄 Syllabus",
                "content": "📌 PHYSICS\n• Full Syllabus (Class 11 & Class 12)\n\n📌 CHEMISTRY\n• Full Syllabus (Class 11 & Class 12)\n\n📌 BOTANY\n• Full Syllabus (Class 11 & Class 12)\n\n📌 ZOOLOGY\n• Full Syllabus (Class 11 & Class 12)",
            },
        })

    neet_pyq_folder = {
        "name": "⏳ NEET & AIPMT Previous Year Test Series (2006–2024)",
        "displayName": "NEET & AIPMT PYQ Test Series (46 Papers)",
        "icon": "⏳",
        "subsections": [
            era_groups["2021_2024"],
            era_groups["2013_2020"],
            era_groups["2006_2012"],
        ],
    }

    neet_node = None
    for sub in manifest_data.get("subsections", []):
        if "NEET" in sub.get("name", ""):
            neet_node = sub
            break

    if not neet_node:
        print("❌ Could not find NEET Tests subsection in test-manifest.json")
        return

    current_subs = neet_node.get("subsections", [])
    new_subs = [s for s in current_subs if "NEET & AIPMT Previous Year Test Series" not in s.get("name", "")]
    new_subs.insert(0, neet_pyq_folder)
    neet_node["subsections"] = new_subs

    MANIFEST_PATH.write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print("✅ test-manifest.json updated successfully with NEET Previous Year Test Series!")


def main():
    print("=================================================================")
    print("🚀 NEETprep to Quizzy Test Cafe Conversion Pipeline")
    print(f"📁 Source: {SRC_DIR.resolve()}")
    print(f"📁 Destination: {DEST_DIR.resolve()}")
    print("=================================================================\n")

    files = sorted(SRC_DIR.glob("*.json"))
    manifest_items = []
    total_converted_questions = 0

    for idx, f in enumerate(files, 1):
        meta = PAPERS_META.get(idx, {})
        disp_name = meta.get("name") or f.stem
        era = meta.get("era", "2013_2020")

        clean_name = f.name
        target_path = DEST_DIR / clean_name

        test_data = convert_test_file(f, idx)
        target_path.write_text(json.dumps(test_data, indent=2, ensure_ascii=False), encoding="utf-8")

        total_converted_questions += test_data["totalQuestions"]
        print(f"[{idx:02d}/{len(files):02d}] ✅ Converted: {disp_name} ({test_data['totalQuestions']} Qs, 4 sections) -> {clean_name}")

        manifest_items.append({
            "displayName": disp_name,
            "path": f"neet-pyq-tests/{clean_name}",
            "era": era,
        })

    print(f"\n🎉 Successfully converted all {len(files)} test papers ({total_converted_questions} total questions)!")
    update_manifest(manifest_items)


if __name__ == "__main__":
    main()
