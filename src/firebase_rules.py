"""Generate rules for known weekly matches without losing earlier weeks."""
import json
from datetime import date


def write_rules(root, schedule_date, matches):
    manifest_path = root / "firebase/schedules.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    memberships = json.loads((root / "data/memberships.json").read_text(encoding="utf-8"))
    for day, day_matches in manifest.items():
        parsed = date.fromisoformat(day)
        period = f"{parsed.year}-Q{(parsed.month-1)//3+1}"
        for match in day_matches.values():
            if "fixedPlayerIds" not in match:
                assert period in memberships, "지난 경기의 회원 분기 명단이 필요합니다"
                members = set(memberships[period]["memberIds"])
                match["fixedPlayerIds"] = [pid for pid in match["teamA"] + match["teamB"] if pid in members]
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
          && data.teamBNames == matches[matchId].teamBNames
          && data.fixedPlayerIds == matches[matchId].fixedPlayerIds;
      }}
      allow create: if validScore() && validMatch();
      allow update: if validScore() && validMatch()
        && (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['scoreA', 'scoreB', 'outcome', 'updatedAt'])
          || (!resource.data.keys().hasAny(['fixedPlayerIds'])
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['scoreA', 'scoreB', 'outcome', 'updatedAt', 'fixedPlayerIds'])));
      allow delete: if false;
    }}''')
    rules = '''rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function validScore() {
      let data = request.resource.data;
      let fields = ['date', 'round', 'floor', 'teamA', 'teamB', 'teamANames', 'teamBNames', 'fixedPlayerIds', 'scoreA', 'scoreB', 'outcome', 'updatedAt'];
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
    periods = {}
    for period, membership in memberships.items():
        year, quarter = map(int, period.split("-Q"))
        month = (quarter - 1) * 3 + 1
        periods[period] = {
            "memberIds": membership["memberIds"], "startsOn": f"{year}-{month:02d}-01",
            "endsBefore": f"{year+1}-01-01" if quarter == 4 else f"{year}-{month+3:02d}-01",
        }
    membership_rules = '''    match /membershipPeriods/{period} {
      function validPeriod() {
        let periods = __PERIODS__;
        let data = request.resource.data;
        return period in periods && data.keys().hasAll(['period', 'memberIds', 'startsOn', 'endsBefore', 'updatedAt'])
          && data.keys().hasOnly(['period', 'memberIds', 'startsOn', 'endsBefore', 'updatedAt'])
          && data.period == period && data.memberIds == periods[period].memberIds
          && data.startsOn == periods[period].startsOn && data.endsBefore == periods[period].endsBefore
          && data.updatedAt == request.time;
      }
      allow read: if true;
      allow create: if validPeriod();
      allow update: if validPeriod()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberIds', 'updatedAt']);
      allow delete: if false;
    }
'''.replace("__PERIODS__", json.dumps(periods, ensure_ascii=False))
    rules = rules.replace("    // Collection-group reads", membership_rules+"    // Collection-group reads")
    (root / "firebase/firestore.rules").write_text(rules, encoding="utf-8")
