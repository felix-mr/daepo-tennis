"""Generate rules for known weekly matches without losing earlier weeks."""
import json
from datetime import date


def write_rules(root, schedule_date, matches):
    manifest_path = root / "firebase/schedules.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    manifest[schedule_date] = matches
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    blocks = []
    for day, day_matches in sorted(manifest.items()):
        date.fromisoformat(day)
        metadata = json.dumps(day_matches, ensure_ascii=False)
        blocks.append(f'''    match /schedules/{day}/matchResults/{{matchId}} {{
      function validMatch() {{
        let matches = {metadata};
        let data = request.resource.data;
        return matchId in matches && data.date == '{day}'
          && data.round == matches[matchId].round && data.floor == matches[matchId].floor
          && data.teamA == matches[matchId].teamA && data.teamB == matches[matchId].teamB
          && data.teamANames == matches[matchId].teamANames
          && data.teamBNames == matches[matchId].teamBNames;
      }}
      allow create: if validScore() && validMatch();
      allow update: if validScore() && validMatch()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['scoreA', 'scoreB', 'outcome', 'updatedAt']);
      allow delete: if false;
    }}''')
    rules = '''rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function validScore() {
      let data = request.resource.data;
      let fields = ['date', 'round', 'floor', 'teamA', 'teamB', 'teamANames', 'teamBNames', 'scoreA', 'scoreB', 'outcome', 'updatedAt'];
      return data.keys().hasAll(fields) && data.keys().hasOnly(fields)
        && data.scoreA is int && data.scoreA >= 0 && data.scoreA <= 99
        && data.scoreB is int && data.scoreB >= 0 && data.scoreB <= 99
        && data.outcome == (data.scoreA > data.scoreB ? 'teamA' : (data.scoreA < data.scoreB ? 'teamB' : 'draw'))
        && data.updatedAt is timestamp && data.updatedAt == request.time;
    }
    // Collection-group reads power cumulative records; writes are limited below.
    match /{path=**}/matchResults/{matchId} {
      allow read: if true;
    }
''' + "\n".join(blocks) + '''
  }
}
'''
    profiles = json.loads((root / "data/players.json").read_text(encoding="utf-8"))
    user_rules = '''    match /users/{userId} {
      function validUser() {
        let users = __PROFILES__;
        let data = request.resource.data;
        return userId in users && data.keys().hasAll(['name', 'gender', 'memberType', 'createdAt'])
          && data.keys().hasOnly(['name', 'gender', 'memberType', 'createdAt'])
          && data.name == users[userId].name && data.gender == users[userId].gender
          && data.memberType == 'fixed' && data.createdAt == request.time;
      }
      allow read: if true;
      allow create: if validUser();
      allow update, delete: if false;
    }
'''.replace("__PROFILES__", json.dumps(profiles, ensure_ascii=False))
    rules = rules.replace("    // Collection-group reads", user_rules+"    // Collection-group reads")
    (root / "firebase/firestore.rules").write_text(rules, encoding="utf-8")
