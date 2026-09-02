# Quizzy — Updated Test Configuration & Question Schema Guide
*Comprehensive field reference, question formats, and authoring validation rules (Updated 2026).*

---

## 1. Overview
This document is the authoritative schema guide for authoring test JSONs, question bank files, and manifest configurations for **Quizzy (Test Cafe & Question Cafe)**.

---

## 2. Complete File Structure

A test file contains top-level test metadata, global scoring rules, optional syllabus, and an array of sections.

```json
{
  "id": "allen-mazl-2026-major-01",
  "name": "MAJOR TEST - 01",
  "displayName": "Allen MAZL 2026 Major Test 01",
  "description": "Full syllabus test extracted from Batch: MAZL - 2026",
  "duration": 180,
  "marking": {
    "correct": 4,
    "incorrect": -1
  },
  "syllabus": {
    "enabled": true,
    "type": "text",
    "content": "Physics: Complete Class 11\nChemistry: Physical & Inorganic\nBiology: Full Botany & Zoology",
    "buttonLabel": "📄 Syllabus"
  },
  "sections": [
    {
      "name": "PHYSICS",
      "icon": "🔭",
      "marking": { "correct": 4, "incorrect": -1 },
      "questions": [ ... ]
    },
    {
      "name": "CHEMISTRY",
      "icon": "🧪",
      "questions": [ ... ]
    },
    {
      "name": "BIOLOGY",
      "icon": "🧬",
      "questions": [ ... ]
    }
  ]
}
```

---

## 3. Supported Question Types & Formats

### 3.1 Standard Single-Correct MCQ (`type: "mcq"`)
Used when exactly one option is correct. `correct` is the zero-based index $(0 = \text{Option A}, 1 = \text{Option B}, \dots)$.

```json
{
  "id": "q101",
  "type": "mcq",
  "question": "Two particles of mass $2\\text{ kg}$ and $1\\text{ kg}$ move with speeds $2\\text{ m/s}$ and $5\\text{ m/s}$. The ratio $V_1/V_2$ of COM velocity is:",
  "image_url": null,
  "options": [
    "3 : 4",
    "4 : 3",
    "9 : 1",
    "1 : 9"
  ],
  "correct": 3,
  "explanation": "Center of mass velocity formula: $$V_{com} = \\frac{m_1 v_1 + m_2 v_2}{m_1 + m_2}$$",
  "explanation_image": "https://res.cloudinary.com/anjwxmku/image/upload/v1/solution1.png",
  "sub_category": "Center of Mass"
}
```

---

### 3.2 Match-List Table Question with Multiple Item Diagrams (`matchLists`) *(NEW)*
Used for NEET/JEE match-the-column questions (`List-I` with `List-II`). Each item $(P, Q, R, S)$ and $(1, 2, 3, 4)$ can have its own text and individual diagram image.

```json
{
  "id": "q102",
  "type": "mcq",
  "question": "List-II has conditions on electric field and List-I has certain charge configurations. Match the suitable condition(s) with each charge configuration.",
  "image_url": null,
  "matchLists": {
    "listI": {
      "title": "List-I (Charge Configurations)",
      "items": [
        {
          "label": "P",
          "text": "Two point charges $+q$ and $-q$ placed along x-axis with C nearer to $+q$",
          "image_url": "https://res.cloudinary.com/anjwxmku/image/upload/v1/q17_p.png"
        },
        {
          "label": "Q",
          "text": "Uniformly positively charged sphere with spherical cavity such that C and O lie on x-axis",
          "image_url": "https://res.cloudinary.com/anjwxmku/image/upload/v1/q17_q.png"
        },
        {
          "label": "R",
          "text": "Regular hexagon with 5 charges as shown (dotted line shows x-axis)",
          "image_url": "https://res.cloudinary.com/anjwxmku/image/upload/v1/q17_r.png"
        },
        {
          "label": "S",
          "text": "Uniformly negatively charged sphere with cavity whose center coincides with center of sphere C",
          "image_url": "https://res.cloudinary.com/anjwxmku/image/upload/v1/q17_s.png"
        }
      ]
    },
    "listII": {
      "title": "List-II (Electric Field at Point C)",
      "items": [
        {
          "label": "1",
          "text": "Electric field at point C is towards right (positive x-direction)"
        },
        {
          "label": "2",
          "text": "Electric field at point C is zero"
        },
        {
          "label": "3",
          "text": "Electric field at point C is towards left (negative x-direction)"
        },
        {
          "label": "4",
          "text": "Electric field at point C has two components: negative x and positive y"
        }
      ]
    }
  },
  "options": [
    "P → 1; Q → 3; R → 3; S → 2",
    "P → 1; Q → 1; R → 3; S → 2",
    "P → 1; Q → 2; R → 4; S → 2",
    "P → 3; Q → 2; R → 4; S → 2"
  ],
  "correct": 1,
  "explanation": "(P) Net field at C is directed towards right.\n(Q) Field direction is along the line joining center.\n(R) Produces net field towards left.\n(S) At center, field is zero.",
  "explanation_images": [
    "https://res.cloudinary.com/anjwxmku/image/upload/v1/sol17_p.png",
    "https://res.cloudinary.com/anjwxmku/image/upload/v1/sol17_r.png"
  ]
}
```

---

### 3.3 Multi-Diagram Question (`images` / `image_urls`) *(NEW)*
For questions that contain 2 or more sequential diagrams before the options:

```json
{
  "id": "q103",
  "type": "mcq",
  "question": "The logic circuit shown has the input waveforms 'A' and 'B' as shown. Pick out the correct output waveform:",
  "images": [
    "https://res.cloudinary.com/anjwxmku/image/upload/v1/circuit_diagram.png",
    "https://res.cloudinary.com/anjwxmku/image/upload/v1/waveform_input.png"
  ],
  "options": [
    "Waveform 1",
    "Waveform 2",
    "Waveform 3",
    "Waveform 4"
  ],
  "optionImages": [
    "https://res.cloudinary.com/anjwxmku/image/upload/v1/wave_opt1.png",
    "https://res.cloudinary.com/anjwxmku/image/upload/v1/wave_opt2.png",
    "https://res.cloudinary.com/anjwxmku/image/upload/v1/wave_opt3.png",
    "https://res.cloudinary.com/anjwxmku/image/upload/v1/wave_opt4.png"
  ],
  "correct": 0,
  "explanation": "Boolean output relation is $Y = A \\cdot B$."
}
```

---

### 3.4 Inline Formula Images & HTML Entities (Method B) *(NEW)*
For questions containing small inline formula snippet images (or HTML entities like `<sub>`, `<sup>`, `&pi;`):

```json
{
  "id": "q104",
  "type": "mcq",
  "question": "In given hollow cylindrical conductor current density is J = <img src=\"https://d2lbh14zkcqlst.cloudfront.net/content_data/content_images/1532355536104578064.png\" alt=\"J0/r^2\" />, where J<sub>0</sub> is constant and r is the distance from axis of cylinder.",
  "image_url": "https://d2lbh14zkcqlst.cloudfront.net/content_data/content_images/1532355514phpBsRmzSimage.png",
  "options": [
    "&pi;J<sub>0</sub>log2",
    "2&pi;J<sub>0</sub>log2",
    "2&pi;J<sub>0</sub>",
    "2&pi;J<sub>0</sub>log3"
  ],
  "correct": 1,
  "explanation": "Current through small element di = JdA<br />i = 2&pi;J<sub>0</sub>ln2"
}
```

---

### 3.4 Multiple-Correct MCQ (`type: "multi_mcq"`)
Used when one or more options can be correct. `correct` is an array of zero-based indices.

```json
{
  "id": "q104",
  "type": "multi_mcq",
  "question": "Select all statements that are true regarding photoelectric effect:",
  "options": [
    "Kinetic energy depends on light frequency.",
    "Emission is instantaneous.",
    "Photoelectric current depends on frequency only.",
    "Stopping potential depends on work function."
  ],
  "correct": [0, 1, 3],
  "explanation": "Statements A, B, and D are verified experimentally."
}
```

---

### 3.5 Numerical / Integer Type (`type: "integer"`)
Used for integer or decimal numerical responses. Expected answer is stored in `"answer"`.

```json
{
  "id": "q105",
  "type": "integer",
  "question": "A particle of mass $2\\text{ kg}$ strikes a spring with velocity $4\\text{ m/s}$. The compression in spring (in cm) is:",
  "answer": "5.5",
  "explanation": "By Work-Energy Theorem: $W_{friction} + W_{spring} = \\Delta KE \\implies x = 5.5\\text{ cm}$."
}
```

---

## 4. Manifest Tree & Syllabus Specification

Manifest files (`data/test-manifest.json` and `data/manifest.json`) structure the browsable hierarchy:

```json
{
  "name": "Quizzy Tests",
  "subsections": [
    {
      "name": "Allen Test",
      "displayName": "Allen AITS & Major Tests",
      "icon": "🅰",
      "syllabus": {
        "enabled": true,
        "type": "pdf",
        "content": "https://example.com/allen-series-syllabus.pdf",
        "buttonLabel": "Series Syllabus"
      },
      "subsections": [
        {
          "name": "Mazl 2026",
          "displayName": "MAZL Batch 2026",
          "icon": "📁",
          "files": [
            {
              "path": "allen-test/mazl-2026/major-test-1.json",
              "displayName": "Major Test 01 (Full Class 11)",
              "syllabus": {
                "enabled": true,
                "type": "text",
                "content": "Physics: Mechanics\nChemistry: Physical\nBiology: Botany & Zoology"
              }
            },
            "allen-test/mazl-2026/minor-test-06.json"
          ]
        }
      ]
    }
  ]
}
```

---

## 5. Quick Reference: Field Matrix

| Field | Level | Type | Status | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | File / Question | `string` | **Required** | Unique slug or UUID. |
| `name` | File / Section | `string` | **Required** | Display name of the test or section. |
| `displayName` | File / Manifest | `string` | *Optional* | Custom human-readable override name. |
| `duration` | File | `number` | **Required** | Test duration in minutes (e.g. `180`). |
| `marking` | File / Section | `object` | **Required** | `{ "correct": 4, "incorrect": -1 }`. |
| `syllabus` | File / Folder | `object` | *Optional* | `{ "enabled": true, "type": "text"\|"pdf", "content": "..." }`. |
| `sections` | File | `array` | **Required** | Array of section objects. |
| `type` | Question | `string` | *Optional* | `"mcq"`, `"multi_mcq"`, `"image_mcq"`, `"integer"`, `"fill_blank"`. |
| `question` | Question | `string` | *Optional* | Question text (LaTeX supported). |
| `image_url` | Question | `string` | *Optional* | Main question diagram URL. |
| `images` | Question | `array` | *Optional* | Array of multiple diagram URLs for the question body. |
| `matchLists` | Question | `object` | *Optional* | Structured dual-column matching table with item diagram images. |
| `options` | Question | `array` | **Required (MCQ)** | Array of 4 option text strings. |
| `optionImages`| Question | `array` | *Optional* | Array of up to 4 option diagram URLs (`[urlA, urlB, null, urlD]`). |
| `correct` | Question | `number\|array`| **Required (MCQ)** | Zero-based index (e.g. `0`) or array of indices (`[0, 2]`). |
| `answer` | Question | `string` | **Required (Integer)**| Correct string/number response. |
| `explanation`| Question | `string` | *Optional* | Step-by-step solution text (LaTeX supported). |
| `explanation_images`| Question | `array` | *Optional* | Array of step-by-step diagram URLs for the solution block. |

---

## 6. Key Authoring Rules

1. **Zero-Based Indexing**: Always use $0$-based indices for `correct` (`0` = Option A, `1` = Option B, `2` = Option C, `3` = Option D).
2. **LaTeX Formatting**: Use standard single `$` for inline math (`$E=mc^2$`) and double `$$` for display equations.
3. **Multi-Image Match Lists**: Place diagram images inside `matchLists.listI.items[i].image_url` rather than as a single top question image.
4. **Cloudinary / CDN URLs**: Ensure all image URLs are complete, absolute URLs (`https://...`).
