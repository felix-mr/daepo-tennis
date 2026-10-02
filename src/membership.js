const membershipModel = (() => {
  const quarter = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '')
    ? `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}` : null;
  const memberIds = (period, memberships) => memberships[period]?.memberIds || [];
  function fixedPlayerIds(record, memberships) {
    const participants = [...(record.teamA || []), ...(record.teamB || [])];
    const members = Array.isArray(record.fixedPlayerIds)
      ? record.fixedPlayerIds : memberIds(quarter(record.date), memberships);
    return [...new Set(members)].filter(id => participants.includes(id));
  }
  const normalize = (record, memberships) => ({ ...record, fixedPlayerIds: fixedPlayerIds(record, memberships) });
  return { quarter, memberIds, fixedPlayerIds, normalize };
})();
