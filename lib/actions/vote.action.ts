"use server";

import mongoose, { ClientSession } from "mongoose";
import { revalidatePath } from "next/cache";

import ROUTES from "@/constants/routes";
import { Answer, Question, Vote } from "@/database";
import { publishVoteUpdate } from "@/lib/realtime/votes";

import action from "../handlers/action";
import handleError from "../handlers/error";
import {
  CreateVoteSchema,
  HasVotedSchema,
  UpdateVoteCountSchema,
} from "../validations";

async function getVoteSnapshot(
  targetId: string,
  targetType: "question" | "answer",
  session?: ClientSession
): Promise<VoteCountResponse & { questionId: string }> {
  if (targetType === "question") {
    const question = await Question.findById(targetId)
      .select("_id upvotes downvotes voteVersion")
      .session(session || null);

    if (!question) throw new Error("Failed to load updated question votes");

    return {
      targetId: question._id.toString(),
      targetType,
      upvotes: question.upvotes,
      downvotes: question.downvotes,
      voteVersion: question.voteVersion,
      questionId: question._id.toString(),
    };
  }

  const answer = await Answer.findById(targetId)
    .select("_id question upvotes downvotes voteVersion")
    .session(session || null);

  if (!answer) throw new Error("Failed to load updated answer votes");

  return {
    targetId: answer._id.toString(),
    targetType,
    upvotes: answer.upvotes,
    downvotes: answer.downvotes,
    voteVersion: answer.voteVersion,
    questionId: answer.question.toString(),
  };
}

export async function updateVoteCount(
  params: UpdateVoteCountParams,
  session?: ClientSession
): Promise<ActionResponse<VoteCountResponse>> {
  const validationResult = await action({
    params,
    schema: UpdateVoteCountSchema,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { targetId, targetType, voteType, change } = validationResult.params!;

  const Model = targetType === "question" ? Question : Answer;
  const voteField = voteType === "upvote" ? "upvotes" : "downvotes";

  try {
    const result = await Model.findByIdAndUpdate(
      targetId,
      { $inc: { [voteField]: change, voteVersion: 1 } },
      { new: true, session }
    );

    if (!result)
      return handleError(
        new Error("Failed to update vote count")
      ) as ErrorResponse;

    return {
      success: true,
      data: {
        targetId: result._id.toString(),
        targetType,
        upvotes: result.upvotes,
        downvotes: result.downvotes,
        voteVersion: result.voteVersion,
      },
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}

export async function createVote(
  params: CreateVoteParams
): Promise<ActionResponse<VoteActionResponse>> {
  const validationResult = await action({
    params,
    schema: CreateVoteSchema,
    authorize: true,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { targetId, targetType, voteType } = validationResult.params!;
  const userId = validationResult.session?.user?.id;

  if (!userId) return handleError(new Error("Unauthorized")) as ErrorResponse;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let hasUpvoted = voteType === "upvote";
    let hasDownvoted = voteType === "downvote";

    const existingVote = await Vote.findOne({
      author: userId,
      actionId: targetId,
      actionType: targetType,
    }).session(session);

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        // If the user has already voted with the same voteType, remove the vote
        await Vote.deleteOne({ _id: existingVote._id }).session(session);
        const updateResult = await updateVoteCount(
          { targetId, targetType, voteType, change: -1 },
          session
        );

        if (!updateResult.success) {
          throw new Error(
            updateResult.error?.message || "Failed to update vote count"
          );
        }

        hasUpvoted = false;
        hasDownvoted = false;
      } else {
        // If the user has already voted with a different voteType, update the vote
        await Vote.findByIdAndUpdate(
          existingVote._id,
          { voteType },
          { new: true, session }
        );
        const previousVoteUpdate = await updateVoteCount(
          { targetId, targetType, voteType: existingVote.voteType, change: -1 },
          session
        );

        if (!previousVoteUpdate.success) {
          throw new Error(
            previousVoteUpdate.error?.message || "Failed to update vote count"
          );
        }

        const nextVoteUpdate = await updateVoteCount(
          { targetId, targetType, voteType, change: 1 },
          session
        );

        if (!nextVoteUpdate.success) {
          throw new Error(
            nextVoteUpdate.error?.message || "Failed to update vote count"
          );
        }
      }
    } else {
      // If the user has not voted yet, create a new vote
      await Vote.create(
        [
          {
            author: userId,
            actionId: targetId,
            actionType: targetType,
            voteType,
          },
        ],
        {
          session,
        }
      );
      const updateResult = await updateVoteCount(
        { targetId, targetType, voteType, change: 1 },
        session
      );

      if (!updateResult.success) {
        throw new Error(
          updateResult.error?.message || "Failed to update vote count"
        );
      }
    }

    const { questionId, ...voteSnapshot } = await getVoteSnapshot(
      targetId,
      targetType,
      session
    );

    await session.commitTransaction();

    await publishVoteUpdate(voteSnapshot);

    revalidatePath(ROUTES.QUESTION(questionId));

    return {
      success: true,
      data: {
        ...voteSnapshot,
        hasUpvoted,
        hasDownvoted,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
}

export async function hasVoted(
  params: HasVotedParams
): Promise<ActionResponse<HasVotedResponse>> {
  const validationResult = await action({
    params,
    schema: HasVotedSchema,
    fetchSession: true,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { targetId, targetType } = validationResult.params!;
  const userId = validationResult.session?.user?.id;

  if (!userId) {
    return {
      success: true,
      data: { hasUpvoted: false, hasDownvoted: false },
    };
  }

  try {
    const vote = await Vote.findOne({
      author: userId,
      actionId: targetId,
      actionType: targetType,
    });

    if (!vote) {
      return {
        success: true,
        data: { hasUpvoted: false, hasDownvoted: false },
      };
    }

    return {
      success: true,
      data: {
        hasUpvoted: vote.voteType === "upvote",
        hasDownvoted: vote.voteType === "downvote",
      },
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}
