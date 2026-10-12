const builderStore = (() => {
  let modules, db;
  async function connection(config) {
    modules ||= Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'), import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')]).catch(error => { modules = null; throw error; });
    const [app, f] = await modules;
    db ||= f.getFirestore(app.initializeApp(config));
    return { f, db };
  }
  async function read(config, date) {
    const { f, db } = await connection(config);
    const snap = await f.getDocFromServer(f.doc(db, 'schedules', date));
    return snap.exists() ? snap.data() : null;
  }
  async function save(config, document) {
    builderModel.validateDocument(document);
    if (!navigator.onLine) throw Error('인터넷 연결 후 확정해 주세요. 초안은 유지됩니다.');
    const { f, db } = await connection(config);
    const ref = f.doc(db, 'schedules', document.date);
    const payload = { ...document, createdAt: f.serverTimestamp() };
    delete payload.searchNodes;
    const draftRef = f.doc(f.collection(db, 'scheduleDrafts'));
    const onlineStage = async action => {
      if (!navigator.onLine) throw Error('인터넷 연결 후 다시 확정해 주세요. 초안은 유지됩니다.');
      let timer, interrupt;
      const stopped = new Promise((_, reject) => {
        interrupt = () => reject(Error('인터넷 연결이 끊겼어요. 초안은 유지됩니다. 다시 연결한 뒤 확정해 주세요.'));
        timer = setTimeout(() => reject(Error('서버 확인이 지연되고 있어요. 초안은 유지됩니다. 다시 확정해 주세요.')), 20000);
        window.addEventListener('offline', interrupt, {once:true});
      });
      try { return await Promise.race([action(), stopped]); }
      finally { clearTimeout(timer); window.removeEventListener('offline', interrupt); }
    };
    await onlineStage(() => f.setDoc(draftRef, payload));
    const prove = proof => f.setDoc(f.doc(draftRef, 'validation', proof), { date: document.date, createdAt: f.serverTimestamp() });
    const stage = async proofs => {
      for (let start = 0; start < proofs.length; start += 4) await onlineStage(async () => {
        const results = await Promise.allSettled(proofs.slice(start, start + 4).map(prove));
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      });
    };
    await stage(['structure']);
    await stage([...Array.from({length:16},(_,i)=>'p'+(i+1)), ...Array.from({length:12},(_,i)=>'m'+(i+1)), 'l1', 'l2']);
    await stage(['players1','players2','matches1','matches2']);
    await stage(['roster','rounds','locks']);
    if (!navigator.onLine) throw Error('인터넷 연결 후 다시 확정해 주세요. 초안은 유지됩니다.');
    await f.runTransaction(db, async transaction => {
      const existing = await transaction.get(ref);
      if (existing.exists() && existing.data().sourceDraftId === draftRef.id) return;
      if (existing.exists()) { const error = Error('다른 사람이 먼저 이 날짜 대진을 확정했어요. 저장된 대진을 확인해 주세요.'); error.code = 'already-exists'; throw error; }
      transaction.set(ref, { ...payload, sourceDraftId: draftRef.id });
    });
    return document.date;
  }
  async function listen(config, success, failure) {
    const { f, db } = await connection(config);
    return f.onSnapshot(f.collection(db, 'schedules'), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
      success(snapshot.docs.map(doc => doc.data()));
    }, failure);
  }
  return { connection, read, save, listen };
})();
