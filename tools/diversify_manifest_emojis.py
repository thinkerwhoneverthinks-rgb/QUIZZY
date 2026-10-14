import os
import json
import re

MANIFEST_PATH = r"c:\Users\Abhishek Pandey\Desktop\Anurag\antigravity\QUIZZY\data\manifest.json"

def has_word(pattern_list, text):
    lower = text.lower()
    for p in pattern_list:
        if re.search(r'\b' + re.escape(p.lower()) + r'\b', lower):
            return True
    return False

def get_book_emoji(book_name):
    lower = book_name.lower()
    
    if any(k in lower for k in ['pyq', '48 years', '38 years', 'previous year']):
        return '📜'
    if any(k in lower for k in ['rankers', 'challengers', 'test series']):
        return '🏆'
    if 'punch' in lower:
        return '🥊'
    if any(k in lower for k in ['med easy', 'made ejee']):
        return '💡'
    if any(k in lower for k in ['notes', 'handwritten']):
        return '✍️'
    if 'crush' in lower:
        return '⚡'
    
    if 'botany' in lower:
        return '🌿'
    if 'zoology' in lower:
        return '🐾'
    if 'biology' in lower:
        return '🧬'
    if 'organic' in lower:
        return '⚗️'
    if 'inorganic' in lower:
        return '🧫'
    if 'physical chemistry' in lower:
        return '🔬'
    if 'chemistry' in lower:
        return '🧪'
    if 'math' in lower:
        return '📐'
    if 'physics' in lower:
        return '⚛️'
        
    return '📘'

def get_chapter_emoji(ch_name):
    lower = ch_name.lower()
    
    # Chemistry first
    if has_word(['basic concepts', 'mole concept', 'stoichiometry'], lower):
        return '⚖️'
    if has_word(['organic chemistry', 'goc', 'general organic', 'principles and techniques', 'iupac', 'nomenclature'], lower):
        return '⚗️'
    if has_word(['isomerism'], lower):
        return '🔀'
    if has_word(['hydrocarbon', 'hydrocarbons', 'alkane', 'alkanes', 'alkene', 'alkynes', 'benzene'], lower):
        return '🌿'
    if has_word(['haloalkane', 'haloalkanes', 'haloarene', 'haloarenes'], lower):
        return '🧪'
    if has_word(['alcohol', 'alcohols', 'phenol', 'phenols', 'ether', 'ethers'], lower):
        return '🍶'
    if has_word(['aldehyde', 'aldehydes', 'ketone', 'ketones', 'carboxylic'], lower):
        return '🧪'
    if has_word(['amine', 'amines', 'diazonium'], lower):
        return '🧬'
    if has_word(['biomolecule', 'biomolecules', 'carbohydrates', 'proteins', 'polymers', 'everyday life'], lower):
        return '🧬'
    if has_word(['purification', 'analysis of organic'], lower):
        return '🔬'
    if has_word(['environmental chemistry'], lower):
        return '🌍'
    if has_word(['structure of atom', 'atomic structure'], lower):
        return '⚛️'
    if has_word(['periodicity', 'periodic', 'classification of elements'], lower):
        return '🧱'
    if has_word(['chemical bonding', 'molecular structure'], lower):
        return '🔗'
    if has_word(['states of matter', 'gaseous state'], lower):
        return '💨'
    if has_word(['thermodynamics', 'chemical thermodynamics', 'thermochemistry'], lower):
        return '🔥'
    if has_word(['equilibrium', 'chemical equilibrium', 'ionic equilibrium'], lower):
        return '⚖️'
    if has_word(['redox', 'redox reactions'], lower):
        return '🔋'
    if has_word(['hydrogen'], lower):
        return '💧'
    if has_word(['s-block', 's block'], lower):
        return '🧂'
    if has_word(['p-block', 'p block'], lower):
        return '💎'
    if has_word(['d-block', 'd and f block', 'f-block'], lower):
        return '🔮'
    if has_word(['coordination compounds', 'coordination'], lower):
        return '✨'
    if has_word(['solid state'], lower):
        return '🧊'
    if has_word(['solutions', 'liquid solutions'], lower):
        return '🧪'
    if has_word(['electrochemistry'], lower):
        return '🔋'
    if has_word(['chemical kinetics', 'kinetics'], lower):
        return '⏱️'
    if has_word(['surface chemistry'], lower):
        return '🧼'
    if has_word(['metallurgy'], lower):
        return '⛏️'

    # Physics
    if has_word(['units', 'unit', 'dimension', 'dimensions', 'measurement', 'measurements', 'errors'], lower):
        return '📏'
    if has_word(['mathematical tools', 'calculus', 'vectors', 'vector'], lower):
        return '📊'
    if has_word(['straight line', '1-d', 'rectilinear', 'motion in a straight line'], lower):
        return '🏎️'
    if has_word(['motion in a plane', '2-d', 'projectile'], lower):
        return '🏹'
    if has_word(['laws of motion', 'nlm', 'friction'], lower):
        return '⚙️'
    if has_word(['work, energy and power', 'work energy and power', 'work power energy', 'work energy'], lower):
        return '⚡'
    if has_word(['system of particles', 'rotational motion', 'rotation', 'center of mass'], lower):
        return '🔄'
    if has_word(['gravitation'], lower):
        return '🪐'
    if has_word(['mechanical properties of solids', 'solids', 'elasticity'], lower):
        return '🔩'
    if has_word(['mechanical properties of fluids', 'fluids', 'fluid mechanics', 'viscosity', 'surface tension'], lower):
        return '💧'
    if has_word(['thermal properties of matter', 'calorimetry', 'ktg', 'kinetic theory'], lower):
        return '🌡️'
    if has_word(['oscillations', 'shm', 'simple harmonic motion'], lower):
        return '〰️'
    if has_word(['waves', 'wave optics', 'sound waves'], lower):
        return '🌊'
    if has_word(['electrostatics', 'electric charges', 'electric field', 'electrostatic potential', 'capacitance', 'capacitors'], lower):
        return '⚡'
    if has_word(['current electricity', 'current'], lower):
        return '🔋'
    if has_word(['moving charges and magnetism', 'magnetism and matter', 'magnetic effects'], lower):
        return '🧲'
    if has_word(['electromagnetic induction', 'emi', 'alternating current', 'ac'], lower):
        return '💡'
    if has_word(['electromagnetic waves', 'em waves'], lower):
        return '📡'
    if has_word(['ray optics', 'optical instruments'], lower):
        return '🌈'
    if has_word(['dual nature of radiation', 'dual nature', 'photoelectric'], lower):
        return '☀️'
    if has_word(['atoms', 'nuclei'], lower):
        return '⚛️'
    if has_word(['semiconductor electronics', 'semiconductors', 'semiconductor'], lower):
        return '💻'
    if has_word(['communication systems', 'communication'], lower):
        return '📻'

    # Biology
    if has_word(['living world'], lower):
        return '🌍'
    if has_word(['biological classification'], lower):
        return '🗂️'
    if has_word(['plant kingdom'], lower):
        return '🌿'
    if has_word(['animal kingdom'], lower):
        return '🐾'
    if has_word(['morphology of flowering plants', 'morphology'], lower):
        return '🌺'
    if has_word(['anatomy of flowering plants', 'anatomy'], lower):
        return '🪴'
    if has_word(['structural organisation in animals', 'cockroach', 'frog'], lower):
        return '🐸'
    if has_word(['cell: the unit of life', 'cell - the unit of life', 'cell the unit of life', 'cell'], lower):
        return '🔬'
    if has_word(['cell cycle and cell division', 'cell cycle'], lower):
        return '🔄'
    if has_word(['photosynthesis'], lower):
        return '🍃'
    if has_word(['respiration in plants'], lower):
        return '🌾'
    if has_word(['plant growth and development', 'plant growth'], lower):
        return '🌱'
    if has_word(['breathing and exchange of gases', 'breathing'], lower):
        return '🫁'
    if has_word(['body fluids and circulation', 'circulation'], lower):
        return '🫀'
    if has_word(['excretory products', 'excretory'], lower):
        return '🧪'
    if has_word(['locomotion and movement', 'locomotion'], lower):
        return '🦴'
    if has_word(['neural control and coordination', 'neural control'], lower):
        return '🧠'
    if has_word(['chemical coordination and integration', 'chemical coordination'], lower):
        return '🩸'
    if has_word(['sexual reproduction in flowering plants', 'reproduction in organisms'], lower):
        return '🌸'
    if has_word(['human reproduction'], lower):
        return '🐣'
    if has_word(['reproductive health'], lower):
        return '🩺'
    if has_word(['principles of inheritance and variation', 'genetics', 'inheritance'], lower):
        return '🧬'
    if has_word(['molecular basis of inheritance'], lower):
        return '🧬'
    if has_word(['evolution'], lower):
        return '🦖'
    if has_word(['human health and disease'], lower):
        return '🛡️'
    if has_word(['microbes in human welfare', 'microbes'], lower):
        return '🦠'
    if has_word(['biotechnology'], lower):
        return '🧪'
    if has_word(['organisms and populations'], lower):
        return '🦊'
    if has_word(['ecosystem'], lower):
        return '🌲'
    if has_word(['biodiversity and conservation', 'biodiversity'], lower):
        return '🦚'
    if has_word(['environmental issues'], lower):
        return '🏭'

    # Math
    if has_word(['sets', 'relations and functions', 'relations', 'functions'], lower):
        return '🔗'
    if has_word(['trigonometric functions', 'trigonometry', 'inverse trigonometric'], lower):
        return '📐'
    if has_word(['complex numbers', 'quadratic equations'], lower):
        return '🔢'
    if has_word(['linear inequalities'], lower):
        return '⚖️'
    if has_word(['permutations and combinations', 'p and c'], lower):
        return '🎲'
    if has_word(['binomial theorem', 'binomial'], lower):
        return '🧩'
    if has_word(['sequences and series', 'sequence and series'], lower):
        return '📈'
    if has_word(['straight lines', 'conic sections', 'circles', 'parabola', 'ellipse', 'hyperbola'], lower):
        return '⚪'
    if has_word(['three dimensional geometry', '3d geometry'], lower):
        return '🧭'
    if has_word(['limits and derivatives', 'continuity and differentiability'], lower):
        return '📉'
    if has_word(['application of derivatives', 'aod'], lower):
        return '📈'
    if has_word(['integrals', 'integration', 'differential equations', 'application of integrals'], lower):
        return '♾️'
    if has_word(['matrices', 'determinants'], lower):
        return '🔲'
    if has_word(['vector algebra', 'vectors'], lower):
        return '🧭'
    if has_word(['probability'], lower):
        return '🎯'
    if has_word(['statistics'], lower):
        return '📊'
    if has_word(['linear programming'], lower):
        return '📏'
    if has_word(['mathematical reasoning'], lower):
        return '💡'

    return '📁'

def diversify():
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    pw_node = None
    for s in data.get('subsections', []):
        if s.get('name') in ['PW Digital Books & Modules', 'Physics Wallah Digital Modules & Books']:
            pw_node = s
            break
            
    if not pw_node:
        print("PW node not found in manifest!")
        return

    pw_node["icon"] = "⚡"
    
    cat_icons = {
        'PW JEE Digital Modules & Books': '🎯',
        'PW NEET Digital Modules & Books': '🩺',
        'PW NCERT Digital Books (Class 11 & 12)': '📚'
    }
    
    total_books = 0
    total_chapters = 0
    
    for cat in pw_node.get('subsections', []):
        cat_name = cat.get('name', '')
        if cat_name in cat_icons:
            cat['icon'] = cat_icons[cat_name]
            
        for book in cat.get('subsections', []):
            total_books += 1
            b_name = book.get('displayName') or book.get('name', '')
            book['icon'] = get_book_emoji(b_name)
            
            for chapter in book.get('subsections', []):
                total_chapters += 1
                ch_name = chapter.get('displayName') or chapter.get('name', '')
                chapter['icon'] = get_chapter_emoji(ch_name)
                
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    print(f"Refined emojis across {total_books} books and {total_chapters} chapters!")

if __name__ == '__main__':
    diversify()
