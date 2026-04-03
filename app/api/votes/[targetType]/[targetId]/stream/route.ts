import { NextResponse } from "next/server";

import { Answer, Question } from "@/database";
import handleError from "@/lib/handlers/error";
import { NotFoundError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { subscribeToVoteUpdates } from "@/lib/realtime/votes";
import { GetVoteCountsSchema } from "@/lib/validations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();
const HEARTBEAT_INTERVAL_MS = 25000;

interface VoteStreamRouteParams {
  params: Promise<{
    targetType: string;
    targetId: string;
  }>;
}

async function getCurrentVoteSnapshot(
  targetType: "question" | "answer",
  targetId: string
): Promise<VoteCountResponse> {
  const Model = targetType === "question" ? Question : Answer;
  const target = await Model.findById(targetId).select(
    "_id upvotes downvotes voteVersion"
  );

  if (!target) throw new NotFoundError(targetType);

  return {
    targetId: target._id.toString(),
    targetType,
    upvotes: target.upvotes,
    downvotes: target.downvotes,
    voteVersion: target.voteVersion,
  };
}

function encodeEvent(data: string) {
  return encoder.encode(data);
}

export async function GET(request: Request, { params }: VoteStreamRouteParams) {
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
    const snapshot = await getCurrentVoteSnapshot(
      targetType as "question" | "answer",
      targetId
    );

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encodeEvent("retry: 3000\n\n"));
        controller.enqueue(
          encodeEvent(`event: vote.updated\ndata: ${JSON.stringify(snapshot)}\n\n`)
        );

        const unsubscribe = subscribeToVoteUpdates(
          targetType as "question" | "answer",
          targetId,
          (payload) => {
            controller.enqueue(
              encodeEvent(
                `event: vote.updated\ndata: ${JSON.stringify(payload)}\n\n`
              )
            );
          }
        );

        const heartbeatId = setInterval(() => {
          controller.enqueue(encodeEvent(`: keep-alive ${Date.now()}\n\n`));
        }, HEARTBEAT_INTERVAL_MS);

        request.signal.addEventListener("abort", () => {
          unsubscribe();
          clearInterval(heartbeatId);
          controller.close();
        });
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}
