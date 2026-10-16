"""10/17 local proposal: user constraints and unavoidable consecutive games."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from datetime import date
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class October17ScheduleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schedule = json.loads((ROOT / 'data/schedules/2026-10-17.json').read_text())
        cls.profiles = {**json.loads((ROOT / 'data/players.json').read_text()), **cls.schedule['guests']}
        cls.ids = cls.schedule['players']
        cls.names = {p: cls.profiles[p]['name'] for p in cls.ids}
        cls.rounds = cls.schedule['rounds']
        cls.plans = {p: [next((f + 1 for f in range(2) if p in sum(row[f*2:f*2+2], [])), 0)
                         for row in cls.rounds] for p in cls.ids}

    def test_date_roster_gender_and_membership(self):
        self.assertEqual(self.schedule['date'], '2026-10-17')
        self.assertEqual(date.fromisoformat(self.schedule['date']).weekday(), 5)
        self.assertEqual(set(self.names.values()), {'김영진', '나창은', '박세준', '이재원', '조아라', '박정민',
                                                   '정상현', '이민규', '안홍익', '송효종', '박진형', '권정민'})
        self.assertEqual({self.names[p] for p in self.ids if self.profiles[p]['gender'] == 'female'}, {'조아라', '박정민'})
        membership = json.loads((ROOT / 'data/memberships.json').read_text())['current-members']
        self.assertTrue(membership['startsOn'] <= self.schedule['date'] < membership['endsBefore'])
        self.assertEqual(set(self.schedule['fixedPlayers']), set(self.ids) & set(membership['memberIds']))
        self.assertTrue(all(p.startswith('guest-2026-10-17-') for p in self.schedule['guests']))

    def test_six_full_rounds_no_double_booking_four_games_and_unique_partners(self):
        self.assertEqual(len(self.rounds), 6)
        partners, games = Counter(), Counter()
        for row in self.rounds:
            self.assertEqual(len(row), 4)
            self.assertTrue(all(len(team) == 2 for team in row))
            active = sum(row, [])
            self.assertEqual(len(active), 8)
            self.assertEqual(len(set(active)), 8)
            self.assertTrue(set(active) <= set(self.ids))
            games.update(active)
            partners.update(tuple(sorted(pair)) for pair in row)
        self.assertEqual(dict(games), {p: 4 for p in self.ids})
        self.assertEqual(len(partners), 24)
        self.assertEqual(set(partners.values()), {1})

    def test_arrival_departures_and_forced_consecutive_games(self):
        self.assertEqual([i for i, f in enumerate(self.plans['p002']) if f][0], 1)
        for p in ['p005', 'p006', 'p008']:
            self.assertEqual([bool(f) for f in self.plans[p]], [True]*4 + [False]*2)
        # Only two women: every valid mixed doubles needs both. Park's departure
        # therefore forces Cho's four games into the same first four rounds.
        self.assertEqual(self.plans['p006'], [1, 1, 1, 1, 0, 0])
        self.assertEqual(set(self.schedule['conditions']['consecutiveExceptions']), {'p005', 'p006', 'p008'})
        self.assertEqual(self.schedule['conditions']['lateArrival'], {'p002': 510})
        self.assertEqual(self.schedule['conditions']['earlyDeparture'], {'p005': 600, 'p006': 600, 'p008': 600})

    def test_read_only_page_has_departure_labels_and_no_score_writes(self):
        html = (ROOT / '2026-10-17/index.html').read_text()
        self.assertTrue(self.schedule['display']['readOnly'])
        for name in ['조아라', '이재원', '박정민']:
            self.assertIn(name + ' 10:00 종료', html)
        self.assertIn('김영진 08:30 시작', html)
        self.assertIn('대진 조회 전용', html)
        self.assertNotIn('data-score-form', html)
        self.assertNotIn('firebasejs', html)
        self.assertNotIn('setDoc(', html)
        self.assertNotIn('기록 연결 중', html)

    def test_read_only_rebuild_preserves_rules_and_archives(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'repo'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('.git', 'output', '__pycache__'))
            paths = ['firebase/firestore.rules', 'firebase/schedules.json', '2026-10-03/index.html', '2026-10-10/index.html']
            original = {p: (root / p).read_bytes() for p in paths}
            subprocess.run([sys.executable, str(root / 'src/build.py'), '--date', '2026-10-17'],
                           check=True, capture_output=True)
            for p in paths:
                self.assertEqual((root / p).read_bytes(), original[p], p)
            self.assertIn('"legacyDates": ["2026-10-03", "2026-10-10", "2026-10-17"]',
                          (root / 'builder/index.html').read_text())

    def test_mixed_only_on_first_floor_and_attachment_game_counts_preserved(self):
        counts = {p: Counter() for p in self.ids}
        types = Counter()
        for row in self.rounds:
            for f in range(2):
                a, b = row[f*2:f*2+2]
                women = [sum(self.profiles[p]['gender'] == 'female' for p in team) for team in [a, b]]
                self.assertIn(women, [[0, 0], [1, 1], [2, 2]])
                kind = 'men' if women == [0, 0] else 'mixed' if women == [1, 1] else 'women'
                if kind == 'mixed': self.assertEqual(f, 0)
                types[kind] += 1
                for p in a + b: counts[p][kind] += 1
        self.assertEqual(types, {'men': 8, 'mixed': 4})
        expected = [0, 1, 2, 1, 4, 4, 1, 0, 1, 0, 1, 1]
        self.assertEqual([counts[p]['mixed'] for p in self.ids], expected)

    def test_requested_mens_quartet_exactly_once_with_park_sejun(self):
        target = {'김영진', '안홍익', '권정민', '박세준'}
        hits = [(r, f) for r, row in enumerate(self.rounds) for f in range(2)
                if {self.names[p] for p in sum(row[f*2:f*2+2], [])} == target]
        self.assertEqual(hits, [(5, 0)])
        self.assertEqual([{self.names[p] for p in team} for team in self.rounds[5][:2]],
                         [{'안홍익', '박세준'}, {'권정민', '김영진'}])

    def test_rest_streaks_and_floor_changes(self):
        changes = []
        for p, plan in self.plans.items():
            active = ''.join('G' if f else '-' for f in plan)
            if p not in {'p005', 'p006', 'p008'}:
                self.assertNotIn('GGGG', active, self.names[p])
                self.assertNotIn('--', active, self.names[p])
            floors = [f for f in plan if f]
            changes.append(sum(a != b for a, b in zip(floors, floors[1:])))
        self.assertEqual(max(changes), 1)
        self.assertEqual(sum(changes), 7)

    def test_three_triple_streaks_reach_attendance_lower_bound(self):
        # Relax partners, gender pairings and floors, but retain attendance,
        # no adjacent rests, and no four consecutive games for these nine men.
        # Dynamic programming exhausts all patterns under the per-round capacity.
        men = [p for p in self.ids if p not in {'p005', 'p006', 'p008'}]
        capacities = (5, 5, 5, 5, 8, 8)
        states = {(0,)*6: 0}
        for p in men:
            patterns = []
            for slots in combinations(range(6), 4):
                bits = tuple(int(r in slots) for r in range(6))
                if p == 'p002' and bits[0]: continue
                if any(not bits[r] and not bits[r+1] for r in range(5)): continue
                if any(all(bits[r:r+4]) for r in range(3)): continue
                triples = sum(all(bits[r:r+3]) for r in range(4))
                patterns.append((bits, triples))
            following = {}
            for used, cost in states.items():
                for bits, triples in patterns:
                    total = tuple(a+b for a, b in zip(used, bits))
                    if any(a > b for a, b in zip(total, capacities)): continue
                    following[total] = min(following.get(total, 99), cost + triples)
            states = following
        lower_bound = states[capacities]
        actual = sum(all(self.plans[p][r:r+3]) for p in men for r in range(4))
        self.assertEqual(lower_bound, 3)
        self.assertEqual(actual, lower_bound)


if __name__ == '__main__':
    unittest.main()
