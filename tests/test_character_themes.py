"""The 70 choices must have usable local art and build into saved schedules."""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class CharacterThemesTest(unittest.TestCase):
    def test_seventy_distinct_characters_have_local_art_and_matching_styles(self):
        catalog = json.loads((ROOT / 'data/character-catalog.json').read_text())
        self.assertEqual(len(catalog['series']), 7)
        seen = set()
        for series in catalog['series']:
            self.assertEqual(len(series['characters']), 10)
            for character in series['characters']:
                key = character['id']
                self.assertNotIn(key, seen)
                seen.add(key)
                self.assertRegex(key, r'^[a-z][a-z0-9-]*$')
                theme = json.loads((ROOT / 'themes' / (key + '.json')).read_text())
                self.assertEqual(theme['seriesId'], series['id'])
                self.assertEqual(theme['seriesName'], series['name'])
                self.assertEqual(theme['heroImage'], character['heroImage'])
                self.assertEqual(theme['tagline'], character['tagline'])
                image = (ROOT / theme['heroImage']).read_bytes()
                self.assertTrue(image.startswith((b'\x89PNG', b'\xff\xd8', b'RIFF')))
                self.assertTrue(theme['heroAlt'])
                css = (ROOT / theme['stylesheet']).read_text()
                if key not in ('gojo', 'geto', 'toji'):
                    self.assertTrue(theme['characterPortrait'])
                    self.assertEqual(theme['accent'], character['name'])
                    for color in character['palette'].values():
                        self.assertRegex(color, r'^#[0-9a-f]{6}$')
                        self.assertIn(color, css)
                    self.assertIn('@media print', css)
                    self.assertTrue(character['imageSourceUrl'].startswith('https://'))
        self.assertEqual(len(seen), 70)

    def test_static_build_embeds_png_with_correct_mime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('src', 'data', 'themes', 'firebase'):
                shutil.copytree(ROOT / name, root / name)
            schedule_path = root / 'data/schedules/2026-10-10.json'
            schedule = json.loads(schedule_path.read_text())
            schedule['theme'] = 'luffy'
            schedule_path.write_text(json.dumps(schedule))
            subprocess.run([sys.executable, str(root / 'src/build.py'), '--date', '2026-10-10'],
                           check=True, capture_output=True, text=True)
            page = (root / '2026-10-10/index.html').read_text()
            self.assertIn('data:image/png;base64,', page)
            self.assertIn('몽키 D. 루피', page)
            self.assertRegex(page, r'--concept-primary:#[0-9a-f]{6}')


if __name__ == '__main__':
    unittest.main()
