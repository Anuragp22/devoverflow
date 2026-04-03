export function getVoteChannelName(
  targetType: "question" | "answer",
  targetId: string
) {
  return `votes-${targetType}-${targetId}`;
}
