"use client";

import { useEffect } from "react";

const POLL_INTERVAL_MS = 15000;

interface Params {
  targetId: string;
  targetType: "question" | "answer";
  onVoteUpdate: (payload: VoteCountResponse) => void;
}

async function pollVoteSnapshot(
  targetType: "question" | "answer",
  targetId: string,
  onVoteUpdate: (payload: VoteCountResponse) => void
) {
  try {
    const response = await fetch(`/api/votes/${targetType}/${targetId}`, {
      cache: "no-store",
    });

    if (!response.ok) return;

    const payload = (await response.json()) as ActionResponse<VoteCountResponse>;

    if (payload.success && payload.data) {
      onVoteUpdate(payload.data);
    }
  } catch {
    // Polling is a fallback path; ignore transient network failures.
  }
}

export function useVoteSync({ targetId, targetType, onVoteUpdate }: Params) {
  useEffect(() => {
    let isUnmounted = false;
    const eventSource =
      typeof window !== "undefined"
        ? new EventSource(`/api/votes/${targetType}/${targetId}/stream`)
        : null;
    const handleVoteEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as VoteCountResponse;
        onVoteUpdate(payload);
      } catch {
        // Ignore malformed stream payloads and wait for the next update.
      }
    };

    const intervalId = window.setInterval(() => {
      void pollVoteSnapshot(targetType, targetId, onVoteUpdate);
    }, POLL_INTERVAL_MS);

    void pollVoteSnapshot(targetType, targetId, onVoteUpdate);

    if (eventSource) {
      eventSource.addEventListener(
        "vote.updated",
        handleVoteEvent as EventListener
      );

      eventSource.onmessage = handleVoteEvent;

      eventSource.onerror = () => {
        if (!isUnmounted) {
          void pollVoteSnapshot(targetType, targetId, onVoteUpdate);
        }
      };
    }

    return () => {
      isUnmounted = true;
      window.clearInterval(intervalId);
      eventSource?.removeEventListener(
        "vote.updated",
        handleVoteEvent as EventListener
      );
      eventSource?.close();
    };
  }, [targetId, targetType, onVoteUpdate]);
}
