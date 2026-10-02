const firebaseConfig = __FIREBASE_CONFIG__;
const players = __PLAYERS__;
const memberships = __MEMBERSHIPS__;
const button = document.getElementById('setup-users');
const status = document.getElementById('setup-status');
document.getElementById('setup-roster').textContent = Object.values(players).map(profile => profile.name).join(' · ');
button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = '고정 멤버 등록 중…';
  try {
    const [app, firestore] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'),
    ]);
    const db = firestore.getFirestore(app.initializeApp(firebaseConfig));
    let count = 0, periodCount = 0;
    await firestore.runTransaction(db, async transaction => {
      count = 0;
      periodCount = 0;
      const entries = Object.entries(players);
      const periods = Object.entries(memberships);
      const documents = await Promise.all(entries.map(([id]) => transaction.get(firestore.doc(db, 'users', id))));
      const periodDocuments = await Promise.all(periods.map(([id]) => transaction.get(firestore.doc(db, 'membershipPeriods', id))));
      entries.forEach(([id, profile], index) => {
        if (!documents[index].exists()) {
          transaction.set(firestore.doc(db, 'users', id), { ...profile, createdAt: firestore.serverTimestamp() });
          count += 1;
        }
      });
      periods.forEach(([id, membership], index) => {
        const expected = { period: id, label: membership.label, memberIds: membership.memberIds,
          startsOn: membership.startsOn, endsBefore: membership.endsBefore };
        const previous = periodDocuments[index].data();
        if (!previous || Object.entries(expected).some(([field, value]) => JSON.stringify(previous[field]) !== JSON.stringify(value))) {
          transaction.set(firestore.doc(db, 'membershipPeriods', id), { ...expected, updatedAt: firestore.serverTimestamp() });
          periodCount += 1;
        }
      });
    });
    status.textContent = count || periodCount
      ? `회원 ${count}명 추가 · 회차 명단 ${periodCount}개 반영 완료. 기존 회원·기록은 유지됩니다.`
      : '회원 정보와 회차 명단이 모두 최신 상태입니다.';
  } catch (error) {
    status.textContent = error.code === 'permission-denied'
      ? '등록 권한을 확인해 주세요. Firestore 규칙 반영 후 다시 시도해 주세요.'
      : '등록 확인 실패. 다시 시도해 주세요.';
  } finally {
    button.disabled = false;
  }
});
