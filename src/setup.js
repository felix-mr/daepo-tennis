const firebaseConfig = __FIREBASE_CONFIG__;
const players = __PLAYERS__;
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
    let count = 0;
    await firestore.runTransaction(db, async transaction => {
      count = 0;
      const entries = Object.entries(players);
      const documents = await Promise.all(entries.map(([id]) => transaction.get(firestore.doc(db, 'users', id))));
      entries.forEach(([id, profile], index) => {
        if (!documents[index].exists()) {
          transaction.set(firestore.doc(db, 'users', id), { ...profile, createdAt: firestore.serverTimestamp() });
          count += 1;
        }
      });
    });
    status.textContent = count ? `${count}명 등록 완료. 고정 멤버 총 ${Object.keys(players).length}명.` : `고정 멤버 ${Object.keys(players).length}명 모두 등록돼 있습니다.`;
  } catch (error) {
    status.textContent = error.code === 'permission-denied'
      ? '등록 권한을 확인해 주세요. Firestore 규칙 반영 후 다시 시도해 주세요.'
      : '등록 확인 실패. 다시 시도해 주세요.';
  } finally {
    button.disabled = false;
  }
});
