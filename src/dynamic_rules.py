"""Rules for immutable schedules created in the browser. Legacy score rules stay intact."""
import json
from datetime import date, timedelta


def render_dynamic_rules(root, legacy_dates):
    profiles = json.loads((root / 'data/players.json').read_text())
    memberships = json.loads((root / 'data/memberships.json').read_text())
    dates = {}
    for period, membership in memberships.items():
        day, end = date.fromisoformat(membership['startsOn']), date.fromisoformat(membership['endsBefore'])
        while day < end:
            if day.weekday() == 5:
                dates[day.isoformat()] = period
            day += timedelta(days=1)
    keys = [f'r{r}-f{f}' for r in range(1, 7) for f in range(1, 3)]
    return '''    function sameSet(a,b) { return a.difference(b).size() == 0 && b.difference(a).size() == 0; }
    function browserDates() { return __DATES__; }
    function browserNames() { return __NAMES__; }
    function browserGenders() { return __GENDERS__; }
    function browserReservedDates() { return __LEGACY__; }
    function browserMatchPlayers(m) {
      return m == null ? [] : m.teamA.concat(m.teamB);
    }
    function playerGames(d, id) {
      return (id in d.roundParticipants['r1'] ? 1 : 0) + (id in d.roundParticipants['r2'] ? 1 : 0)
        + (id in d.roundParticipants['r3'] ? 1 : 0) + (id in d.roundParticipants['r4'] ? 1 : 0)
        + (id in d.roundParticipants['r5'] ? 1 : 0) + (id in d.roundParticipants['r6'] ? 1 : 0);
    }
    function validParticipant(d, id, names, genders) {
      let p = d.profiles[id];
      let window = d.availability[id];
      return p.keys().hasOnly(['name', 'gender', 'memberType'])
        && p.name is string && p.name.size() > 0 && p.name.size() <= 24
        && p.name.matches('[^\\s\\x00-\\x1f\\x7f]+( [^\\s\\x00-\\x1f\\x7f]+)*')
        && p.gender in ['male', 'female'] && p.memberType == (id in d.fixedPlayerIds ? 'fixed' : 'guest')
        && ((id in names && p.name == names[id] && p.gender == genders[id])
          || (!(id in names) && id.matches('guest-' + d.date + '-[0-9]{2}') && p.memberType == 'guest'))
        && window.keys().hasOnly(['from', 'to']) && window.from is int && window.to is int
        && window.from >= 0 && window.to <= 6 && window.from < window.to
        && d.quotas[id] is int && d.quotas[id] >= 2 && d.quotas[id] <= 4
        && d.quotas[id] == playerGames(d, id)
        && id in d.genderPlayers[p.gender] && validFloorPlan(d, id);
    }
    function validFloorPlan(d, id) {
      let plan = d.floorPlan[id];
      let active = plan.removeAll([0]);
      return plan is list && plan.size() == 6 && plan.toSet().difference([0,1,2].toSet()).size() == 0
        && active.size() == d.quotas[id]
        && __AVAILABLE_PLAN__
        && (active.size() <= 3 || active[0] == active[1] || active[1] == active[2] || active[2] == active[3]);
    }
    function validBrowserMatch(d, m, round, floor) {
      let ids = m.teamA.concat(m.teamB);
      let men = d.genderPlayers.male.toSet();
      let offset = (round-1)*4 + (floor-1)*2;
      return m.keys().hasOnly(['date', 'round', 'floor', 'teamA', 'teamB', 'teamANames', 'teamBNames', 'fixedPlayerIds'])
        && m.date == d.date && m.round == round && m.floor == floor
        && m.teamA is list && m.teamB is list && m.teamA.size() == 2 && m.teamB.size() == 2
        && m.teamA[0] < m.teamA[1] && m.teamB[0] < m.teamB[1]
        && ids.toSet().size() == 4 && ids.toSet().difference(d.players.toSet()).size() == 0
        && m.teamANames == [d.profiles[m.teamA[0]].name, d.profiles[m.teamA[1]].name]
        && m.teamBNames == [d.profiles[m.teamB[0]].name, d.profiles[m.teamB[1]].name]
        && sameSet(m.fixedPlayerIds.toSet(), ids.toSet().intersection(d.fixedPlayerIds.toSet()))
        && m.fixedPlayerIds.size() == m.fixedPlayerIds.toSet().size()
        && m.teamA.toSet().intersection(men).size() == m.teamB.toSet().intersection(men).size()
        && d.floorPlan[ids[0]][round-1] == floor && d.floorPlan[ids[1]][round-1] == floor
        && d.floorPlan[ids[2]][round-1] == floor && d.floorPlan[ids[3]][round-1] == floor
        && d.teamKeys[offset] == pairKey(m.teamA) && d.teamKeys[offset+1] == pairKey(m.teamB);
    }
    function validBrowserRound(d, round) {
      let ids = browserMatchPlayers(d.matches.get('r' + string(round) + '-f1', null)).concat(browserMatchPlayers(d.matches.get('r' + string(round) + '-f2', null)));
      return ids.size() == ids.toSet().size() && d.roundParticipants['r' + string(round)] == ids;
    }
    function countPairGames(teams, pair) { return teams.size() - teams.removeAll([pairKey(pair)]).size(); }
    function pairKey(pair) { return pair[0] < pair[1] ? pair[0] + '|' + pair[1] : pair[1] + '|' + pair[0]; }
    function repeatLimit(d, pair) {
      let genders = [d.profiles[pair[0]].gender, d.profiles[pair[1]].gender];
      let pool = genders[0] == genders[1] ? d.genderPlayers[genders[0]] : d.players;
      let other = pool.removeAll(pair);
      return d.lockedPairTargets.get(pairKey(pair), pool.size() == 4 ? d.lockedPairTargets.get(pairKey(other),1) : 1);
    }
    function validRepeatPair(d,pair,teams) {
      let count = countPairGames(teams,pair);
      return count <= 1 || count <= repeatLimit(d,pair);
    }
    function validRepeats(d, m, teams) { return m == null || d.allowPartnerRepeats
      || (validRepeatPair(d,m.teamA,teams) && validRepeatPair(d,m.teamB,teams)); }
    function validLockedPair(d, index, teams) {
      let p = d.lockedPairs[index];
      let pair = p.players;
      let target = p.games == 'all' ? d.quotas[pair[0]] : p.games;
      return p.keys().hasAll(['players','games']) && p.keys().hasOnly(['players','games'])
        && pair is list && pair.size() == 2 && pair[0] < pair[1] && pair.toSet().difference(d.players.toSet()).size() == 0
        && p.games in [1,2,3,'all'] && target <= d.quotas[pair[0]] && target <= d.quotas[pair[1]]
        && (p.games != 'all' || d.quotas[pair[0]] == d.quotas[pair[1]])
        && d.lockedPairTargets[pairKey(pair)] == target && d.lockedPairKeys[index] == pairKey(pair) && countPairGames(teams, pair) == target;
    }
    function validDraftProof(draftId, day, proof) {
      let verification = get(/databases/$(database)/documents/scheduleDrafts/$(draftId)/validation/$(proof)).data;
      return verification.date == day && verification.createdAt is timestamp;
    }
    function validBrowserDraft() {
      let d = request.resource.data;
      let day = d.date;
      let dates = browserDates();
      return !(day in browserReservedDates()) && day in dates && d.date == day && d.membershipPeriod == dates[day]
        && d.keys().hasAll(['schemaVersion', 'date', 'membershipPeriod', 'theme', 'startMinutes', 'roundMinutes', 'roundCount', 'players', 'fixedPlayerIds', 'profiles', 'quotas', 'availability', 'roundParticipants', 'lockedPairs', 'allowPartnerRepeats', 'avoidConsecutiveRests', 'maxFloorChanges', 'matches', 'floorPlan', 'genderPlayers', 'lockedPairTargets', 'lockedPairKeys', 'teamKeys', 'playerNames', 'createdAt'])
        && d.keys().hasOnly(['schemaVersion', 'date', 'membershipPeriod', 'theme', 'startMinutes', 'roundMinutes', 'roundCount', 'players', 'fixedPlayerIds', 'profiles', 'quotas', 'availability', 'roundParticipants', 'lockedPairs', 'allowPartnerRepeats', 'avoidConsecutiveRests', 'maxFloorChanges', 'matches', 'floorPlan', 'genderPlayers', 'lockedPairTargets', 'lockedPairKeys', 'teamKeys', 'playerNames', 'createdAt'])
        && d.schemaVersion == 1 && d.startMinutes == 480 && d.roundMinutes == 30 && d.roundCount == 6
        && d.theme in __BROWSER_THEMES__ && d.maxFloorChanges == 2
        && d.createdAt == request.time && d.allowPartnerRepeats is bool && d.avoidConsecutiveRests is bool
        && d.playerNames is list && d.playerNames.size() == d.players.size() && d.playerNames.toSet().size() == d.players.size()
        && d.players is list && d.players.size() >= 4 && d.players.size() <= 16 && d.players.toSet().size() == d.players.size();
    }

    function validDraftStructure(d) {
      let day = d.date;
      let period = get(/databases/$(database)/documents/membershipPeriods/$(d.membershipPeriod)).data;
      return sameSet(d.profiles.keys().toSet(), d.players.toSet()) && sameSet(d.quotas.keys().toSet(), d.players.toSet()) && sameSet(d.availability.keys().toSet(), d.players.toSet())
          && sameSet(d.fixedPlayerIds.toSet(),d.players.toSet().intersection(period.memberIds.toSet()))
          && d.fixedPlayerIds.size() == d.fixedPlayerIds.toSet().size() && period.startsOn <= day && day < period.endsBefore
          && d.roundParticipants is map && d.roundParticipants.keys().hasAll(['r1','r2','r3','r4','r5','r6']) && d.roundParticipants.size() == 6
          && sameSet(d.floorPlan.keys().toSet(),d.players.toSet())
          && d.genderPlayers.keys().hasAll(['male','female']) && d.genderPlayers.keys().hasOnly(['male','female'])
          && sameSet(d.genderPlayers.male.concat(d.genderPlayers.female).toSet(),d.players.toSet())
          && d.genderPlayers.male.size()+d.genderPlayers.female.size() == d.players.size()
          && d.lockedPairs is list && d.lockedPairs.size() <= 8
          && d.lockedPairKeys.size() == d.lockedPairs.size() && d.lockedPairKeys.toSet().size() == d.lockedPairs.size()
          && d.lockedPairTargets.size() == d.lockedPairKeys.size() && d.teamKeys.size() == 24
          && d.matches is map && d.matches.size() >= 1 && d.matches.keys().hasOnly(__MATCH_KEYS__);
    }
    match /scheduleDrafts/{draftId} {
      allow get: if true;
      allow list: if false;
      allow create: if draftId.matches('[a-zA-Z0-9]{20}') && validBrowserDraft();
      allow update, delete: if false;
      match /validation/{proof} {
        function draftData() { return get(/databases/$(database)/documents/scheduleDrafts/$(draftId)).data; }
        function validMarker() {
          let data = request.resource.data;
          let parent = draftData();
          return data.keys().hasAll(['date','createdAt']) && data.keys().hasOnly(['date','createdAt'])
            && data.date == parent.date && data.createdAt == request.time;
        }
        function participantProof() {
          let d = draftData();
          let index = {'p1': 0, 'p2': 1, 'p3': 2, 'p4': 3, 'p5': 4, 'p6': 5, 'p7': 6, 'p8': 7, 'p9': 8, 'p10': 9, 'p11': 10, 'p12': 11, 'p13': 12, 'p14': 13, 'p15': 14, 'p16': 15}[proof];
          return d.players.size() <= index || (d.profiles[d.players[index]].name == d.playerNames[index] && validParticipant(d, d.players[index], browserNames(), browserGenders()));
        }
        function matchProof() {
          let d = draftData();
          let round = {'m1': 1, 'm2': 1, 'm3': 2, 'm4': 2, 'm5': 3, 'm6': 3, 'm7': 4, 'm8': 4, 'm9': 5, 'm10': 5, 'm11': 6, 'm12': 6}[proof];
          let floor = {'m1': 1, 'm2': 2, 'm3': 1, 'm4': 2, 'm5': 1, 'm6': 2, 'm7': 1, 'm8': 2, 'm9': 1, 'm10': 2, 'm11': 1, 'm12': 2}[proof];
          let m = d.matches.get('r'+string(round)+'-f'+string(floor),null);
          let offset = (round-1)*4+(floor-1)*2;
          return (m == null ? (d.teamKeys[offset] == '' && d.teamKeys[offset+1] == '') : validBrowserMatch(d,m,round,floor))
            && (!('r'+string(round)+'-f'+string(floor) in d.matches) || m != null)
            && validBrowserRound(d,round) && validRepeats(d,m,d.teamKeys);
        }
        function lockedProof() {
          let d = draftData();
          let offset = proof == 'l1' ? 0 : 4;
          return (d.lockedPairs.size() <= offset || validLockedPair(d,offset,d.teamKeys))
            && (d.lockedPairs.size() <= offset+1 || validLockedPair(d,offset+1,d.teamKeys))
            && (d.lockedPairs.size() <= offset+2 || validLockedPair(d,offset+2,d.teamKeys))
            && (d.lockedPairs.size() <= offset+3 || validLockedPair(d,offset+3,d.teamKeys));
        }
        function playerGroup() {
          let d = draftData();
          return proof == 'players1' ? (validDraftProof(draftId,d.date,'p1') && validDraftProof(draftId,d.date,'p2') && validDraftProof(draftId,d.date,'p3') && validDraftProof(draftId,d.date,'p4') && validDraftProof(draftId,d.date,'p5') && validDraftProof(draftId,d.date,'p6') && validDraftProof(draftId,d.date,'p7') && validDraftProof(draftId,d.date,'p8')) : (validDraftProof(draftId,d.date,'p9') && validDraftProof(draftId,d.date,'p10') && validDraftProof(draftId,d.date,'p11') && validDraftProof(draftId,d.date,'p12') && validDraftProof(draftId,d.date,'p13') && validDraftProof(draftId,d.date,'p14') && validDraftProof(draftId,d.date,'p15') && validDraftProof(draftId,d.date,'p16'));
        }
        function matchGroup() {
          let d = draftData();
          return proof == 'matches1' ? (validDraftProof(draftId,d.date,'m1') && validDraftProof(draftId,d.date,'m2') && validDraftProof(draftId,d.date,'m3') && validDraftProof(draftId,d.date,'m4') && validDraftProof(draftId,d.date,'m5') && validDraftProof(draftId,d.date,'m6')) : (validDraftProof(draftId,d.date,'m7') && validDraftProof(draftId,d.date,'m8') && validDraftProof(draftId,d.date,'m9') && validDraftProof(draftId,d.date,'m10') && validDraftProof(draftId,d.date,'m11') && validDraftProof(draftId,d.date,'m12'));
        }
        function rootProof() {
          let d = draftData();
          return (proof == 'roster' && validDraftProof(draftId,d.date,'structure') && validDraftProof(draftId,d.date,'players1') && validDraftProof(draftId,d.date,'players2'))
            || (proof == 'rounds' && validDraftProof(draftId,d.date,'matches1') && validDraftProof(draftId,d.date,'matches2'))
            || (proof == 'locks' && validDraftProof(draftId,d.date,'l1') && validDraftProof(draftId,d.date,'l2'));
        }
        allow create: if validMarker() && ((proof == 'structure' && validDraftStructure(draftData())) || (proof.matches('p([1-9]|1[0-6])') && participantProof())
          || (proof.matches('m([1-9]|1[0-2])') && matchProof()) || (proof.matches('l[1-2]') && lockedProof())
          || (proof in ['players1','players2'] && playerGroup()) || (proof in ['matches1','matches2'] && matchGroup())
          || (proof in ['roster','rounds','locks'] && rootProof()));
        allow read, update, delete: if false;
      }
    }
    match /schedules/{day} {
      allow read: if true;
      function validPublication() {
        let d = request.resource.data;
        let draft = get(/databases/$(database)/documents/scheduleDrafts/$(d.sourceDraftId)).data;
        return day == d.date && !(day in browserReservedDates()) && d.sourceDraftId.matches('[a-zA-Z0-9]{20}')
          && d.createdAt == request.time && d.diff(draft).affectedKeys().hasOnly(['sourceDraftId','createdAt'])
          && validDraftProof(d.sourceDraftId,day,'roster') && validDraftProof(d.sourceDraftId,day,'rounds')
          && validDraftProof(d.sourceDraftId,day,'locks');
      }
      allow create: if validPublication();
      allow update, delete: if false;
    }
    match /schedules/{day}/matchResults/{matchId} {
      function validDynamicScore() {
        let parent = get(/databases/$(database)/documents/schedules/$(day)).data;
        let canonical = parent.matches[matchId];
        let d = request.resource.data;
        return !(day in browserReservedDates()) && canonical.fixedPlayerIds.size() > 0
          && validScore() && d.date == day && d.round == canonical.round && d.floor == canonical.floor
          && d.teamA == canonical.teamA && d.teamB == canonical.teamB
          && d.teamANames == canonical.teamANames && d.teamBNames == canonical.teamBNames
          && d.fixedPlayerIds == canonical.fixedPlayerIds;
      }
      allow create: if validDynamicScore();
      allow update: if validDynamicScore() && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['scoreA', 'scoreB', 'outcome', 'updatedAt']);
      allow delete: if false;
    }
'''.replace('\\s', '\\\\s').replace('\\x', '\\\\x').replace('__AVAILABLE_PLAN__', ' && '.join([f"(plan[{i}] == 0 || (d.availability[id].from < {i+1} && d.availability[id].to >= {i+1}))" for i in range(6)])).replace('__BROWSER_THEMES__', json.dumps(sorted(path.stem for path in (root / 'themes').glob('*.json')))).replace('__DATES__', json.dumps(dates)).replace('__NAMES__', json.dumps({pid: profile['name'] for pid, profile in profiles.items()}, ensure_ascii=False)).replace('__GENDERS__', json.dumps({pid: profile['gender'] for pid, profile in profiles.items()})).replace('__LEGACY__', json.dumps(sorted(legacy_dates))).replace('__MATCH_KEYS__', json.dumps(keys))
