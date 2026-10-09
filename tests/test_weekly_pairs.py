"""Verify weekly attendance and the narrow, mandatory women's doubles pairing rule."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DAY = '2026-10-10'


class WeeklyPairsTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for name in ('src', 'data', 'themes', 'firebase'):
            shutil.copytree(ROOT / name, self.root / name)
        self.path = self.root / f'data/schedules/{DAY}.json'
        self.schedule = json.loads(self.path.read_text())

    def build(self):
        self.path.write_text(json.dumps(self.schedule, ensure_ascii=False))
        return subprocess.run([sys.executable, str(self.root / 'src/build.py'), '--date', DAY],
                              capture_output=True, text=True)

    def test_attendance_balance_fixed_pairs_and_old_week_preserved(self):
        old = json.loads((self.root / 'firebase/schedules.json').read_text())['2026-10-03']
        archive = self.root / '2026-10-03/index.html'
        archive.parent.mkdir()
        archive.write_text('preserved archived page')
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(archive.read_text(), 'preserved archived page')
        self.assertEqual(json.loads((self.root / 'firebase/schedules.json').read_text())['2026-10-03'], old)
        self.assertEqual(len(self.schedule['players']), 12)
        self.assertFalse({'p002', 'p006', 'p010'} & set(self.schedule['players']))
        self.assertEqual(self.schedule['guests']['guest-2026-10-10-03']['name'], '김진수')
        genders = {**json.loads((self.root / 'data/players.json').read_text()), **self.schedule['guests']}
        appearances, mixed, types = Counter(), Counter(), Counter()
        for row in self.schedule['rounds']:
            for offset in (0, 2):
                a, b = row[offset:offset+2]
                active = a+b
                male_count = sum(genders[p]['gender'] == 'male' for p in active)
                types[male_count] += 1
                appearances.update(active)
                if male_count == 2:
                    mixed.update(active)
                if male_count == 0:
                    self.assertIn({'p007', 'guest-2026-10-10-04'}, [set(a), set(b)])
        self.assertEqual(dict(types), {4: 6, 2: 4, 0: 2})
        self.assertTrue(all(appearances[p] == 4 for p in self.schedule['players']))
        self.assertTrue(all(mixed[p] == (1 if genders[p]['gender'] == 'male' else 2)
                            for p in self.schedule['players']))
        html = (self.root / f'{DAY}/index.html').read_text()
        self.assertIn('여복 고정 페어 · 성주은 · 추진영', html)
        self.assertNotIn('고죠', html)

    def test_wrong_partner_in_one_womens_match_rejected(self):
        women = {'p007', 'p008', 'p009', 'guest-2026-10-10-04'}
        for row in self.schedule['rounds']:
            for offset in (0, 2):
                if set(row[offset] + row[offset+1]) == women:
                    row[offset][1], row[offset+1][1] = row[offset+1][1], row[offset][1]
                    result = self.build()
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('여복 고정 페어를 지켜야', result.stderr)
                    return
        self.fail('No womens doubles match')

    def test_repeat_permission_not_global(self):
        self.schedule['conditions']['fixedWomenDoublesPairs'].pop()
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('고정 여복 페어 외에는 페어를 반복', result.stderr)

    def test_men_cannot_use_womens_repeat_exception(self):
        self.schedule['conditions']['fixedWomenDoublesPairs'].append(['p001', 'p003'])
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('여자 선수로 구성', result.stderr)

    def test_absent_player_cannot_be_fixed_partner(self):
        self.schedule['conditions']['fixedWomenDoublesPairs'][0][0] = 'p006'
        result = self.build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('참석 명단에 없습니다', result.stderr)


if __name__ == '__main__':
    unittest.main()
