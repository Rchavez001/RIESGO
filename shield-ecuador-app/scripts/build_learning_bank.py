"""Reproducible adaptation of the supplied bank; never edits the source files."""
import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'Banco de preguntas/ciberdojo_banco_completo.json'
OUT = ROOT / 'Banco de preguntas/optimizado'
VERSION = '3.0.0'
BELTS = [
    ('blanco', 'white', 'passwords', 'Primeras defensas', list(range(1, 21))),
    ('amarillo', 'yellow', 'assets', 'Cuentas, compras y pagos', list(range(21, 41))),
    ('naranja', 'orange', 'backup', 'Cuidar el celular y sus aplicaciones', list(range(41, 54))),
    ('verde', 'green', 'access', 'Proteger y recuperar tus datos', list(range(54, 61)) + [63, 64, 79, 80]),
    ('azul', 'blue', 'phishing', 'Reconocer engaños combinados', [61, 62] + list(range(65, 78))),
    ('marron', 'brown', 'incident', 'Actuar ante un problema', [78] + list(range(81, 92))),
    ('negro', 'black', 'mentorship', 'Recuperarse y acompañar a otros', list(range(92, 101))),
]


def build():
    source = json.loads(SOURCE.read_text(encoding='utf-8'))
    mapping = {f'FAM-{n:03}': i for i, b in enumerate(BELTS) for n in b[4]}
    assert len(mapping) == 100
    glossary = source['glosario']
    items = []
    cleaned = 0
    family_options = {}
    for row in source['banco_preguntas'] + source['banco_casos_katas']:
        family_options.setdefault(row['familia_id'], set()).update(
            option for pos, option in enumerate(row['opciones']) if pos != row['respuesta_correcta'])
    for kind, key in [('question', 'banco_preguntas'), ('case', 'banco_casos_katas')]:
        for original in source[key]:
            i = mapping[original['familia_id']]
            options = original['opciones'].copy()
            # The source appends another distractor to some choices. Remove only
            # a complete suffix that already occurs as a separate wrong choice.
            for pos, option in enumerate(options):
                if pos == original['respuesta_correcta']:
                    continue
                for other in sorted(family_options[original['familia_id']], key=lambda s: (-len(s), s)):
                    if option.endswith(' ' + other):
                        shorter = option[:-(len(other) + 1)]
                        if shorter and shorter not in options:
                            options[pos] = shorter
                            cleaned += 1
                            break
            prompt = original.get('pregunta') or (original['situacion_real'] + '\n\n' + original['pregunta_evaluacion'])
            terms = dict(original.get('ayuda_terminos', {}))
            visible = ' '.join([prompt, *options, original['explicacion_sensei']])
            for term, meaning in glossary.items():
                if re.search(r'\b' + re.escape(term) + r'\b', visible, re.I):
                    terms[term] = meaning
            item = dict(
                id=original['uid'].replace('2-', '3-'), source_id=original['uid'],
                version=VERSION, kind=kind, belt=BELTS[i][0], belt_rank=i,
                family=original['familia_id'], topic=original['tema'],
                difficulty=i * 3 + original['subnivel'], sublevel=original['subnivel'],
                objective=original['objetivo'], prompt=prompt, options=options,
                correct=original['respuesta_correcta'], explanation=original['explicacion_sensei'],
                feedback_correct='Bien hecho. ' + original['explicacion_sensei'],
                feedback_incorrect='Vamos paso a paso; aquí puedes practicar sin riesgo. ' + original['explicacion_sensei'],
                terms=terms, sources=original['referencias_orientativas'],
            )
            items.append(item)
    items.sort(key=lambda q: (q['belt_rank'], q['sublevel'], q['id']))
    dojos = []
    for i, (belt, db_belt, dojo, title, families) in enumerate(BELTS):
        pool = [q for q in items if q['belt'] == belt and q['kind'] == 'question']
        chosen = []
        # Cover all families first, then revisit them with a different objective.
        # Ten questions at each sublevel give a gentle, explicit progression.
        counts = Counter()
        for level in (1, 2, 3):
            candidates = [q for q in pool if q['sublevel'] == level]
            for _ in range(10):
                q = min(candidates, key=lambda q: (counts[q['family']], q['id']))
                chosen.append(q['id'])
                counts[q['family']] += 1
                candidates.remove(q)
        dojos.append(dict(id=dojo, belt=belt, db_belt=db_belt, rank=i, title=title,
                          question_ids=chosen,
                          exam_code=f'EXAM_{belt.upper()}_{BELTS[i+1][0].upper()}' if i < 6 else 'EXAM_NEGRO_FINAL'))
    bank = dict(version=VERSION, rules=dict(training_questions=30, exam_cases=5,
                 threshold=0.75, minimum_correct=4, exam_sublevels=[1, 1, 2, 2, 3]),
                dojos=dojos, items=items, glossary=glossary,
                source_file=SOURCE.name, source_references=source['fuentes_consultadas'],
                editorial_note='Adaptación de material proporcionado; requiere pilotaje con personas no informáticas.')
    OUT.mkdir(exist_ok=True)
    (OUT / 'banco_700_preguntas_300_casos.json').write_text(json.dumps(bank, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for kind, name in [('question', 'preguntas_700.csv'), ('case', 'casos_300.csv')]:
        with (OUT / name).open('w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['id', 'cinturon', 'dificultad', 'tema', 'objetivo', 'pregunta', 'A', 'B', 'C', 'D', 'respuesta', 'explicacion', 'terminos'])
            for q in items:
                if q['kind'] == kind:
                    writer.writerow([q['id'], q['belt'], q['difficulty'], q['topic'], q['objective'], q['prompt'], *q['options'], 'ABCD'[q['correct']], q['explanation'], json.dumps(q['terms'], ensure_ascii=False)])
    def sql_json(value):
        return "'" + json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace("'", "''") + "'::jsonb"
    seed = '-- Generated by scripts/build_learning_bank.py. Private exam bank; no client SELECT.\n'
    seed += 'INSERT INTO public.learning_items (id, version, kind, belt, sublevel, family, content) VALUES\n'
    seed += ',\n'.join(f"('{q['id']}', '{VERSION}', '{q['kind']}', '{q['belt']}', {q['sublevel']}, '{q['family']}', {sql_json(q)})" for q in items)
    seed += '\nON CONFLICT (id) DO NOTHING;\n'
    seed += 'INSERT INTO public.learning_dojos (id, belt, db_belt, rank, title, exam_code, version, question_ids) VALUES\n'
    seed += ',\n'.join(f"('{d['id']}', '{d['belt']}', '{d['db_belt']}', {d['rank']}, '{d['title']}', '{d['exam_code']}', '{VERSION}', ARRAY[" + ','.join("'" + q + "'" for q in d['question_ids']) + '])' for d in dojos)
    seed += '\nON CONFLICT (id) DO NOTHING;\n'
    (ROOT / 'supabase/migrations/027_learning_bank_seed.sql').write_text(seed, encoding='utf-8')
    (ROOT / 'frontend/src/data/learningCatalog.json').write_text(json.dumps(dojos, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(questions=700, cases=300, cleaned_choices=cleaned,
                         distribution={b[0]: dict(Counter(q['kind'] for q in items if q['belt'] == b[0])) for b in BELTS}), ensure_ascii=False))


if __name__ == '__main__':
    build()
