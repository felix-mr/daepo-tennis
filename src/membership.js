const membershipModel = (() => {
  const periodForDate = (date, memberships) => Object.keys(memberships).find(id => {
    const period = memberships[id];
    return period.startsOn && period.endsBefore && period.startsOn <= date && date < period.endsBefore;
  }) || null;
  const memberIds = (period, memberships) => memberships[period]?.memberIds || [];
  function fixedPlayerIds(record, memberships) {
    const participants = [...(record.teamA || []), ...(record.teamB || [])];
    const members = Array.isArray(record.fixedPlayerIds)
      ? record.fixedPlayerIds : memberIds(periodForDate(record.date, memberships), memberships);
    return [...new Set(members)].filter(id => participants.includes(id));
  }
  const normalize = (record, memberships) => ({ ...record, fixedPlayerIds: fixedPlayerIds(record, memberships) });
  return { periodForDate, memberIds, fixedPlayerIds, normalize };
})();
