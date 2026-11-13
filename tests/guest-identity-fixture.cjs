const M = require('../src/builder-model.js'), players = require('../data/players.json');
function document() {
  const guest='guest-2026-11-14-01', ids=['p001','p002','p003',guest];
  const input={date:'2026-11-14',membershipPeriod:'nov-2026-jan-2027',theme:'club',players:ids,fixedPlayerIds:ids.slice(0,3),profiles:{...Object.fromEntries(ids.slice(0,3).map(id=>[id,players[id]])),[guest]:{name:'서명렬',gender:'male',memberType:'guest'}},quotas:Object.fromEntries(ids.map(id=>[id,3])),availability:Object.fromEntries(ids.map(id=>[id,{from:0,to:6}])),lockedPairs:[],allowPartnerRepeats:false,avoidConsecutiveRests:true};
  const [a,b,c,d]=ids, empty=()=>[[],[],[],[]];
  return M.documentOf(input,[[[a,b],[c,d],[],[]],empty(),[[a,c],[b,d],[],[]],empty(),[[a,d],[b,c],[],[]],empty()]);
}
module.exports = {document};
