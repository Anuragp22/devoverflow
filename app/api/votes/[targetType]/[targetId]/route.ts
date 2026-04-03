import { NextResponse } from "next/server";

import { Answer, Question } from "@/database";
import handleError from "@/lib/handlers/error";
import { NotFoundError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { GetVoteCountsSchema } from "@/lib/validations";

interface VoteRouteParams {
  params: Promise<{
    targetType: string;
    targetId: string;
  }>;
}

export async function GET(_: Request, { params }: VoteRouteParams) {
  try {
    const { targetType, targetId } = await params;
    const validatedParams = GetVoteCountsSchema.safeParse({
      targetType,
      targetId,
    });

    if (!validatedParams.success) {
      throw new ValidationError(
        validatedParams.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    await dbConnect();

    const Model = targetType === "question" ? Question : Answer;
    const target = await Model.findById(targetId).select(
      "_id upvotes downvotes voteVersion"
    );

    if (!target) throw new NotFoundError(targetType);

    return NextResponse.json({
      success: true,
      data: {
        targetId: target._id.toString(),
        targetType,
        upvotes: target.upvotes,
        downvotes: target.downvotes,
        voteVersion: target.voteVersion,
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
