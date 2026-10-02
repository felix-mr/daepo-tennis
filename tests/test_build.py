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
                schedule["guests"][player] = {**roster[player], "memberType": "guest"}
            schedule["fixedPlayers"] = [player for player in schedule["fixedPlayers"] if player not in guests]
            membership_path = root / "data/memberships.json"
            memberships = json.loads(membership_path.read_text())
            memberships["2026-Q4"]["memberIds"] = [pid for pid in memberships["2026-Q4"]["memberIds"] if pid not in guests]
            membership_path.write_text(json.dumps(memberships))
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

    def test_new_quarter_keeps_old_profiles_and_old_membership_snapshots(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("src", "data", "themes", "firebase"):
                shutil.copytree(ROOT / name, root / name)
            membership_path = root / "data/memberships.json"
            memberships = json.loads(membership_path.read_text())
            memberships["2027-Q1"] = {"memberIds": [pid for pid in memberships["2026-Q4"]["memberIds"] if pid != "p001"]}
            membership_path.write_text(json.dumps(memberships))
            original = root / "data/schedules/2026-10-03.json"
            schedule = json.loads(original.read_text().replace("2026-10-03", "2027-01-02"))
            schedule["fixedPlayers"].remove("p001")
            schedule["theme"] = "club"
            root.joinpath("data/schedules/2027-01-02.json").write_text(json.dumps(schedule))
            subprocess.run([sys.executable, str(root / "src/build.py"), "--date", "2027-01-02"],
                           check=True, capture_output=True, text=True)
            matches = json.loads((root / "firebase/schedules.json").read_text())
            self.assertIn("p001", matches["2026-10-03"]["r1-f1"]["fixedPlayerIds"])
            self.assertNotIn("p001", matches["2027-01-02"]["r1-f1"]["fixedPlayerIds"])
            self.assertIn("p001", json.loads(root.joinpath("data/players.json").read_text()))
            html = root.joinpath("2027-01-02/index.html").read_text()
            self.assertIn('data-player-summary="p001" data-member-status="guest"', html)
            self.assertIn("고정 멤버 시절 기록 보기", html)


if __name__ == "__main__":
    unittest.main()
