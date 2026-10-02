"""Verify guest-only games remain scheduled without score inputs or write rules."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class GuestOnlyMatchTest(unittest.TestCase):
    def test_guest_only_match_has_no_score_form_or_write_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("src", "data", "themes", "firebase"):
                shutil.copytree(ROOT / name, root / name)
            roster_path = root / "data/players.json"
            schedule_path = root / "data/schedules/2026-10-03.json"
            roster = json.loads(roster_path.read_text())
            schedule = json.loads(schedule_path.read_text())
            guests = set(schedule["rounds"][0][0] + schedule["rounds"][0][1])
            for player in guests.intersection(roster):
                schedule["guests"][player] = {**roster.pop(player), "memberType": "guest"}
            schedule["fixedPlayers"] = [player for player in schedule["fixedPlayers"] if player not in guests]
            roster_path.write_text(json.dumps(roster, ensure_ascii=False))
            schedule_path.write_text(json.dumps(schedule, ensure_ascii=False))
            subprocess.run([sys.executable, str(root / "src/build.py"), "--date", "2026-10-03"],
                           check=True, capture_output=True, text=True)
            html = (root / "2026-10-03/index.html").read_text()
            matches = json.loads((root / "firebase/schedules.json").read_text())["2026-10-03"]
            self.assertNotIn("r1-f1", matches)
            self.assertNotIn('data-score-form data-match="r1-f1"', html)
            self.assertIn('data-score-form data-match="r2-f1"', html)
            for player in guests:
                self.assertIn(schedule["guests"][player]["name"], html)
            self.assertNotIn('"r1-f1":', (root / "firebase/firestore.rules").read_text())


if __name__ == "__main__":
    unittest.main()
