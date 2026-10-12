// The preflight explains eligibility; server rules recheck all results atomically.
const scheduleDeletion = (() => {
  function mount({config, getSchedule, onDeleted, onBusy = () => {}}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'delete-dialog';
    dialog.setAttribute('aria-labelledby', 'delete-dialog-title');
    dialog.setAttribute('aria-describedby', 'delete-dialog-description');
    dialog.innerHTML = '<h2 id="delete-dialog-title">대진표를 삭제할까요?</h2><p id="delete-dialog-description">삭제하면 공유 링크에서 대진을 볼 수 없습니다. 같은 날짜로 다시 만들 수 있습니다. 점수가 입력된 대진은 삭제할 수 없습니다.</p><p class="delete-dialog-error" role="alert" hidden></p><div class="delete-dialog-actions"><button type="button" data-cancel-delete autofocus>취소</button><button type="button" data-confirm-delete class="danger-button">대진 삭제</button></div>';
    document.body.append(dialog);
    const cancel = dialog.querySelector('[data-cancel-delete]'), confirm = dialog.querySelector('[data-confirm-delete]'), error = dialog.querySelector('[role=alert]');
    let target = null, busy = false, submitting = false, opener, finished = false;
    const status = text => { const node=document.getElementById('schedule-delete-status'); if(node)node.textContent=text; };
    const setBusy = value => {busy=value;onBusy(value);};
    const failureMessage = failure => failure.code === 'permission-denied'
      ? '점수 입력 여부와 최신 대진을 다시 확인해 주세요. 삭제는 완료되지 않았습니다.'
      : failure.message || '삭제 확인에 실패했어요. 대진을 다시 확인해 주세요.';
    dialog.addEventListener('cancel', event => {if(submitting)event.preventDefault();});
    const restoreFocus=()=>{
      const next=[document.getElementById(opener?.id),document.getElementById('date'),document.querySelector('nav a')]
        .find(node=>node && !node.disabled && node.getClientRects().length);
      next?.focus();
    };
    dialog.addEventListener('close', () => {
      if(dialog.open)return;
      target=null;setBusy(false);
      if(finished){const next=document.querySelector('.deleted-action') || document.getElementById('generate');if(next && !next.disabled)next.focus();}
      else restoreFocus();
    });
    cancel.addEventListener('click', () => {if(!submitting)dialog.close();});
    confirm.addEventListener('click', async () => {
      if (!target || submitting) return;
      const submitted={...target};
      submitting=true;cancel.disabled=confirm.disabled=true;confirm.textContent='삭제 중…';error.hidden=true;
      try {
        await builderStore.remove(config,submitted.date,submitted.sourceDraftId);
        finished=true;dialog.close();status(submitted.date+' 대진표를 삭제했어요. 다시 만들 수 있습니다.');onDeleted(submitted);
      } catch (failure) {error.textContent=failureMessage(failure);error.hidden=false;}
      finally {submitting=false;cancel.disabled=confirm.disabled=false;confirm.textContent='대진 삭제';}
    });
    return {async open(button) {
      if(busy)return;
      const current=getSchedule();if(!current)return;
      const snapshot={date:current.date,sourceDraftId:current.sourceDraftId};opener=button;finished=false;setBusy(true);status('점수 입력 여부 확인 중…');
      try {
        const result=await builderStore.removalStatus(config,snapshot.date,snapshot.sourceDraftId);
        if(!result.exists){status('이미 삭제된 대진입니다. 다시 만들 수 있습니다.');setBusy(false);onDeleted(snapshot);return;}
        target=snapshot;dialog.querySelector('h2').textContent=snapshot.date+' 대진표를 삭제할까요?';error.hidden=true;status('');dialog.showModal();cancel.focus();
      } catch(failure){status(failureMessage(failure));setBusy(false);restoreFocus();}
    }};
  }
  return {mount};
})();
