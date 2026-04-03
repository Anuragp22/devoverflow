import { getVoteChannelName } from "./channels";

type VoteListener = (payload: VoteCountResponse) => void;

const VOTE_LISTENERS_KEY = Symbol.for("devflow.vote.listeners");

function getVoteListeners() {
  const globalWithListeners = globalThis as typeof globalThis & {
    [VOTE_LISTENERS_KEY]?: Map<string, Set<VoteListener>>;
  };

  if (!globalWithListeners[VOTE_LISTENERS_KEY]) {
    globalWithListeners[VOTE_LISTENERS_KEY] = new Map<string, Set<VoteListener>>();
  }

  return globalWithListeners[VOTE_LISTENERS_KEY];
}

export function subscribeToVoteUpdates(
  targetType: "question" | "answer",
  targetId: string,
  listener: VoteListener
) {
  const listeners = getVoteListeners();
  const channelName = getVoteChannelName(targetType, targetId);
  const channelListeners = listeners.get(channelName) || new Set<VoteListener>();

  channelListeners.add(listener);
  listeners.set(channelName, channelListeners);

  return () => {
    const currentListeners = listeners.get(channelName);
    if (!currentListeners) return;

    currentListeners.delete(listener);

    if (currentListeners.size === 0) {
      listeners.delete(channelName);
    }
  };
}

export async function publishVoteUpdate(payload: VoteCountResponse) {
  const listeners = getVoteListeners().get(
    getVoteChannelName(payload.targetType, payload.targetId)
  );

  if (!listeners?.size) return false;

  listeners.forEach((listener) => listener(payload));
  return true;
}
