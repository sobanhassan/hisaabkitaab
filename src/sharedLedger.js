export const getPairId = (firstUserId, secondUserId) =>
  [firstUserId, secondUserId].sort().join("_");

export const isFirstMember = (userId, otherUserId) => userId < otherUserId;

export const getUserBalance = (pair, userId) => {
  if (!pair) return 0;
  return pair.members[0] === userId
    ? Number(pair.balanceForFirstMember) || 0
    : -(Number(pair.balanceForFirstMember) || 0);
};

export const getBalanceChange = (paidById, viewerId, amount) =>
  paidById === viewerId ? -Number(amount) : Number(amount);

export const formatTransactionDate = (timestamp) => {
  const date = timestamp?.toDate?.();
  if (!date) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};
