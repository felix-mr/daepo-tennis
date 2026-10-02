const firebaseConfig = __FIREBASE_CONFIG__;
const scheduleDate = __SCHEDULE_DATE__;
const matches = __MATCHES__;
const forms = [...document.querySelectorAll('[data-score-form]')];
const connection = document.getElementById('score-connection-status');
const retry = document.getElementById('score-retry');
const saved = new Map();
const drafts = new Map();
const messages = new Map();
const saving = new Set();
let ready = false;
let db, firestore, unsubscribe, connectionTimer;
let modulesPromise;
let connectionGeneration = 0;

const version = record => record?.updatedAt
  ? `${record.updatedAt.seconds}:${record.updatedAt.nanoseconds}` : null;
const sameVersion = (left, right) => version(left) === version(right);

function setConnection(text, connected, canRetry = false) {
  connection.textContent = text;
  ready = connected && navigator.onLine;
  retry.hidden = !canRetry;
  renderAll();
}

function render(matchId) {
  const record = saved.get(matchId);
  const draft = drafts.get(matchId);
  forms.filter(form => form.dataset.match === matchId).forEach(form => {
    for (const field of ['scoreA', 'scoreB']) {
      const input = form.elements.namedItem(field);
      const value = draft ? draft[field] : record?.[field] ?? '';
      if (input.value !== String(value)) input.value = value;
      input.disabled = saving.has(matchId);
    }
    const reverse = form.dataset.reverse === 'true';
    const score = record
      ? `${record[reverse ? 'scoreB' : 'scoreA']} : ${record[reverse ? 'scoreA' : 'scoreB']}`
      : '미입력';
    form.querySelector('[data-score-result]').textContent = `저장된 점수 · ${score}`;
    let outcome = '';
    if (record) {
      if (record.outcome === 'draw') outcome = '무승부 · 승점 1점';
      else if (form.dataset.personalScore === 'true') {
        const won = record.outcome === (reverse ? 'teamB' : 'teamA');
        outcome = won ? '승리 · 승점 3점' : '패배 · 승점 0점';
      } else outcome = `${record[`${record.outcome}Names`].join(' · ')} 승 · 각 3점`;
    }
    form.querySelector('[data-score-outcome]').textContent = outcome;
    form.querySelector('[data-score-message]').textContent = messages.get(matchId) || '';
    const button = form.querySelector('[type="submit"]');
    button.disabled = !ready || saving.has(matchId) || !draft;
    button.textContent = saving.has(matchId) ? '저장 중…' : '점수 저장';
    form.querySelector('[data-reset-score]').hidden = !draft;
    form.querySelector('[data-reset-score]').disabled = saving.has(matchId);
  });
}

function renderAll() {
  Object.keys(matches).forEach(render);
}

function errorMessage(error) {
  if (error.code === 'permission-denied') return '점수 접근 권한을 확인해 주세요.';
  if (error.code === 'not-found' || error.code === 'failed-precondition') return '점수 저장소 설정을 확인해 주세요.';
  return '점수 연결 실패. 잠시 후 다시 연결해 주세요.';
}

async function connect() {
  const generation = ++connectionGeneration;
  clearTimeout(connectionTimer);
  unsubscribe?.();
  unsubscribe = undefined;
  setConnection('점수 연결 중…', false);
  connectionTimer = setTimeout(() => {
    setConnection('점수 연결이 지연되고 있어요. 다시 연결해 주세요.', false, true);
  }, 12000);
  try {
    modulesPromise ??= Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'),
    ]).catch(error => { modulesPromise = undefined; throw error; });
    const [appModule, firestoreModule] = await modulesPromise;
    if (generation !== connectionGeneration) return;
    firestore = firestoreModule;
    db ??= firestore.getFirestore(appModule.initializeApp(firebaseConfig));
    const scores = firestore.collectionGroup(db, 'matchResults');
    unsubscribe = firestore.onSnapshot(scores, { includeMetadataChanges: true }, snapshot => {
      if (generation !== connectionGeneration) return;
      if (snapshot.metadata.hasPendingWrites) return;
      const previous = new Map(saved);
      saved.clear();
      const allRecords = [];
      snapshot.forEach(document => {
        const data = document.data();
        if (resultModel.valid(data)) {
          allRecords.push(data);
          if (data.date === scheduleDate && matches[document.id]) saved.set(document.id, data);
        }
      });
      const stats = resultModel.aggregate(allRecords);
      document.querySelectorAll('[data-player-summary]').forEach(node => {
        node.textContent = `전체 기록 · ${resultModel.summary(stats.get(node.dataset.playerSummary))}`;
      });
      for (const [id, draft] of drafts) {
        if (!sameVersion(previous.get(id), saved.get(id)) && !saving.has(id)) {
          messages.set(id, '다른 사람이 점수를 수정했어요. 취소하면 최신 점수를 볼 수 있어요.');
        }
      }
      if (!snapshot.metadata.fromCache) clearTimeout(connectionTimer);
      setConnection(snapshot.metadata.fromCache ? '점수 연결 확인 중…' : '점수 공유 중 · 누구나 입력·수정 가능',
        !snapshot.metadata.fromCache, snapshot.metadata.fromCache);
    }, error => {
      if (generation !== connectionGeneration) return;
      clearTimeout(connectionTimer);
      setConnection(errorMessage(error), false, true);
    });
  } catch (error) {
    if (generation !== connectionGeneration) return;
    clearTimeout(connectionTimer);
    setConnection(errorMessage(error), false, true);
  }
}

forms.forEach(form => {
  const id = form.dataset.match;
  form.addEventListener('input', () => {
    const existing = drafts.get(id);
    drafts.set(id, {
      scoreA: form.elements.namedItem('scoreA').value,
      scoreB: form.elements.namedItem('scoreB').value,
      baseVersion: existing ? existing.baseVersion : version(saved.get(id)),
    });
    messages.set(id, '저장 전');
    render(id);
  });
  form.querySelector('[data-reset-score]').addEventListener('click', () => {
    drafts.delete(id);
    messages.delete(id);
    render(id);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || saving.has(id) || !drafts.has(id)) return;
    const draft = drafts.get(id);
    const scoreA = Number(draft.scoreA), scoreB = Number(draft.scoreB);
    if (draft.scoreA === '' || draft.scoreB === '' ||
        ![scoreA, scoreB].every(value => Number.isInteger(value) && value >= 0 && value <= 99)) {
      messages.set(id, '두 팀 점수를 0~99 정수로 입력해 주세요.');
      render(id);
      return;
    }
    saving.add(id);
    messages.set(id, '저장 중…');
    render(id);
    try {
      const reference = firestore.doc(db, 'schedules', scheduleDate, 'matchResults', id);
      await firestore.runTransaction(db, async transaction => {
        const current = await transaction.get(reference);
        const record = current.exists() ? current.data() : undefined;
        if (version(record) !== draft.baseVersion) {
          if (record) saved.set(id, record); else saved.delete(id);
          const error = new Error('Score changed while editing');
          error.code = 'score-conflict';
          throw error;
        }
        transaction.set(reference, { ...matches[id], scoreA, scoreB,
          outcome: resultModel.outcome(scoreA, scoreB), updatedAt: firestore.serverTimestamp() });
      });
      // Show success only after the server acknowledged the transaction.
      const confirmed = await firestore.getDocFromServer(reference);
      saved.set(id, confirmed.data());
      drafts.delete(id);
      messages.set(id, '저장 완료');
    } catch (error) {
      messages.set(id, error.code === 'score-conflict'
        ? '다른 사람이 먼저 저장했어요. 취소 후 최신 점수를 확인해 주세요.'
        : '저장 확인 실패. 입력값은 유지돼요. 연결 후 최신 점수를 확인해 주세요.');
    } finally {
      saving.delete(id);
      render(id);
    }
  });
});

retry.addEventListener('click', connect);
window.addEventListener('offline', () => {
  clearTimeout(connectionTimer);
  setConnection('인터넷 연결 끊김 · 입력값은 유지돼요', false, true);
});
window.addEventListener('online', connect);
connect();
