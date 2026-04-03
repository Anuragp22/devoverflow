"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { use, useCallback, useEffect, useState } from "react";

import { toast } from "@/hooks/use-toast";
import { useVoteSync } from "@/hooks/use-vote-sync";
import { createVote } from "@/lib/actions/vote.action";
import { formatNumber } from "@/lib/utils";

interface Params {
  targetType: "question" | "answer";
  targetId: string;
  upvotes: number;
  downvotes: number;
  voteVersion: number;
  hasVotedPromise: Promise<ActionResponse<HasVotedResponse>>;
}

const Votes = ({
  upvotes,
  downvotes,
  voteVersion,
  hasVotedPromise,
  targetId,
  targetType,
}: Params) => {
  const session = useSession();
  const userId = session.data?.user?.id;

  const { data } = use(hasVotedPromise);

  const [voteState, setVoteState] = useState({
    upvotes,
    downvotes,
    voteVersion,
    hasUpvoted: data?.hasUpvoted || false,
    hasDownvoted: data?.hasDownvoted || false,
  });
  const [isLoading, setIsLoading] = useState(false);

  const applySyncedVoteState = useCallback(
    (payload: VoteCountResponse) => {
      if (payload.targetId !== targetId || payload.targetType !== targetType) {
        return;
      }

      setVoteState((current) => {
        if (payload.voteVersion < current.voteVersion) return current;

        return {
          ...current,
          upvotes: payload.upvotes,
          downvotes: payload.downvotes,
          voteVersion: payload.voteVersion,
        };
      });
    },
    [targetId, targetType]
  );

  useVoteSync({
    targetId,
    targetType,
    onVoteUpdate: applySyncedVoteState,
  });

  useEffect(() => {
    setVoteState((current) => {
      if (voteVersion < current.voteVersion) return current;

      return {
        upvotes,
        downvotes,
        voteVersion,
        hasUpvoted: data?.hasUpvoted || false,
        hasDownvoted: data?.hasDownvoted || false,
      };
    });
  }, [data?.hasDownvoted, data?.hasUpvoted, downvotes, upvotes, voteVersion]);

  const getOptimisticVoteState = (
    previousState: typeof voteState,
    voteType: "upvote" | "downvote"
  ) => {
    if (voteType === "upvote") {
      if (previousState.hasUpvoted) {
        return {
          ...previousState,
          hasUpvoted: false,
          upvotes: Math.max(0, previousState.upvotes - 1),
          voteVersion: previousState.voteVersion + 1,
        };
      }

      return {
        ...previousState,
        hasUpvoted: true,
        hasDownvoted: false,
        upvotes: previousState.upvotes + 1,
        downvotes: previousState.hasDownvoted
          ? Math.max(0, previousState.downvotes - 1)
          : previousState.downvotes,
        voteVersion: previousState.voteVersion + 1,
      };
    }

    if (previousState.hasDownvoted) {
      return {
        ...previousState,
        hasDownvoted: false,
        downvotes: Math.max(0, previousState.downvotes - 1),
        voteVersion: previousState.voteVersion + 1,
      };
    }

    return {
      ...previousState,
      hasDownvoted: true,
      hasUpvoted: false,
      downvotes: previousState.downvotes + 1,
      upvotes: previousState.hasUpvoted
        ? Math.max(0, previousState.upvotes - 1)
        : previousState.upvotes,
      voteVersion: previousState.voteVersion + 1,
    };
  };

  const handleVote = async (voteType: "upvote" | "downvote") => {
    if (!userId)
      return toast({
        title: "Please login to vote",
        description: "Only logged-in users can vote.",
      });

    setIsLoading(true);
    const previousVoteState = voteState;
    const optimisticVoteState = getOptimisticVoteState(voteState, voteType);

    setVoteState(optimisticVoteState);

    try {
      const result = await createVote({
        targetId,
        targetType,
        voteType,
      });

      if (!result.success) {
        setVoteState((current) =>
          current.voteVersion > optimisticVoteState.voteVersion
            ? current
            : previousVoteState
        );

        return toast({
          title: "Failed to vote",
          description: result.error?.message,
          variant: "destructive",
        });
      }

      if (result.data) {
        setVoteState({
          upvotes: result.data.upvotes,
          downvotes: result.data.downvotes,
          voteVersion: result.data.voteVersion,
          hasUpvoted: result.data.hasUpvoted,
          hasDownvoted: result.data.hasDownvoted,
        });
      }

      const successMessage =
        voteType === "upvote"
          ? `Upvote ${
              previousVoteState.hasUpvoted ? "removed" : "updated"
            } successfully`
          : `Downvote ${
              previousVoteState.hasDownvoted ? "removed" : "updated"
            } successfully`;

      toast({
        title: successMessage,
        description: "Your vote has been recorded.",
      });
    } catch {
      setVoteState((current) =>
        current.voteVersion > optimisticVoteState.voteVersion
          ? current
          : previousVoteState
      );

      toast({
        title: "Failed to vote",
        description: "An error occurred while voting. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-center gap-2.5">
      <div className="flex-center gap-1.5">
        <Image
          src={
            voteState.hasUpvoted ? "/icons/upvoted.svg" : "/icons/upvote.svg"
          }
          width={18}
          height={18}
          alt="upvote"
          className={`cursor-pointer ${isLoading && "opacity-50"}`}
          aria-label="Upvote"
          onClick={() => !isLoading && handleVote("upvote")}
        />

        <div className="flex-center background-light700_dark400 min-w-5 rounded-sm p-1">
          <p className="subtle-medium text-dark400_light900">
            {formatNumber(voteState.upvotes)}
          </p>
        </div>
      </div>

      <div className="flex-center gap-1.5">
        <Image
          src={
            voteState.hasDownvoted
              ? "/icons/downvoted.svg"
              : "/icons/downvote.svg"
          }
          width={18}
          height={18}
          alt="downvote"
          className={`cursor-pointer ${isLoading && "opacity-50"}`}
          aria-label="Downvote"
          onClick={() => !isLoading && handleVote("downvote")}
        />

        <div className="flex-center background-light700_dark400 min-w-5 rounded-sm p-1">
          <p className="subtle-medium text-dark400_light900">
            {formatNumber(voteState.downvotes)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Votes;
