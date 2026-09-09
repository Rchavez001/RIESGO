import json
import re
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = json.loads((ROOT / 'Banco de preguntas/optimizado/banco_700_preguntas_300_casos.json').read_text(encoding='utf-8'))


class LearningBankTest(unittest.TestCase):
    def test_counts_identity_and_order(self):
        items = BANK['items']
        self.assertEqual(Counter(q['kind'] for q in items), {'question': 700, 'case': 300})
        self.assertEqual(len({q['id'] for q in items}), 1000)
        self.assertEqual(len({q['prompt'] for q in items}), 1000)
        self.assertEqual([q['difficulty'] for q in items], sorted(q['difficulty'] for q in items))
        self.assertEqual(len({q['family'] for q in items}), 100)

    def test_options_and_explanations(self):
        for q in BANK['items']:
            with self.subTest(q=q['id']):
                self.assertEqual(len(q['options']), 4)
                self.assertEqual(len(set(q['options'])), 4)
                self.assertIn(q['correct'], range(4))
                self.assertGreater(len(q['explanation']), 40)
                self.assertIn('sin riesgo', q['feedback_incorrect'])
                self.assertNotRegex(' '.join(q['options']), r'distractor pendiente|Opcion de riesgo|pendiente de configurar')
                self.assertNotIn('\ufffd', json.dumps(q, ensure_ascii=False))
                text = ' '.join([q['prompt'], *q['options'], q['explanation']])
                for acronym in ('MFA', '2FA', 'HTTPS', 'QR', 'APK', 'SIM', 'IA', 'SMS'):
                    if re.search(r'\b' + acronym + r'\b', text):
                        self.assertIn(acronym, q['terms'])

    def test_dojos_and_exam_pools(self):
        self.assertEqual(len(BANK['dojos']), 7)
        by_id = {q['id']: q for q in BANK['items']}
        for d in BANK['dojos']:
            assigned = [by_id[q] for q in d['question_ids']]
            self.assertEqual(len(set(d['question_ids'])), 30)
            self.assertTrue(all(q['belt'] == d['belt'] and q['kind'] == 'question' for q in assigned))
            self.assertEqual(Counter(q['sublevel'] for q in assigned), {1: 10, 2: 10, 3: 10})
            families = {q['family'] for q in BANK['items'] if q['belt'] == d['belt']}
            self.assertEqual({q['family'] for q in assigned}, families)
            for sublevel in (1, 2, 3):
                pool = [q for q in BANK['items'] if q['belt'] == d['belt'] and q['kind'] == 'case' and q['sublevel'] == sublevel]
                self.assertGreaterEqual(len({q['family'] for q in pool}), 5)


if __name__ == '__main__':
    unittest.main()
